// Copyright (c) QuestarrNG contributors. All rights reserved.
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { after, test } from 'node:test';
import {
  captureCandidate,
  acquireRunLock,
  createPlan,
  discoverInventory,
  executePlan,
  formatValidationProgress,
  globRegex,
  isolatedTaskEnvironment,
  main as runEngine,
  releaseRunLock,
  runtimeProbeDirectory,
} from './engine.mjs';
import { validation } from './config.mjs';

const temporaryRoots = [];

function makeRoot(files = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'questarrng-validation-contract-'));
  temporaryRoots.push(root);
  for (const [relative, contents] of Object.entries(files)) {
    const fullPath = path.join(root, relative);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents);
  }
  const git = (args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git(['init', '--quiet']);
  git(['config', 'user.email', 'validation-test@example.invalid']);
  git(['config', 'user.name', 'Validation Engine Test']);
  git(['add', '--all']);
  git(['commit', '--quiet', '-m', 'fixture baseline']);
  return root;
}

function baseConfig(overrides = {}) {
  return {
    repository: 'fixture',
    inputs: ['package.json'],
    requiredCommands: [],
    inventory: [{
      id: 'unit',
      glob: 'tests/**/*.test.mjs',
      framework: 'node:test',
      owner: 'unit',
    }],
    tasks: [{
      id: 'unit-tests',
      name: 'Unit tests',
      stage: 'repository',
      kind: 'test',
      command: [process.execPath, '--test', 'tests/example.test.mjs'],
      casePattern: '(?:ℹ|#)\\s*pass\\s+(\\d+)',
      minimumCases: 1,
      inventoryLanes: ['unit'],
      timeoutSeconds: 10,
    }],
    ...overrides,
  };
}

function fixture() {
  const root = makeRoot({
    'package.json': '{"name":"validation-fixture"}\n',
    'src/app.js': 'export const candidate = true;\n',
    'tests/example.test.mjs': "import test from 'node:test';\ntest('fixture passes', () => {});\n",
  });
  return { root, config: baseConfig() };
}

after(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});

test('Playwright installation and execution share the package-local browser cache', () => {
  const install = validation.tasks.find((task) => task.id === 'playwright-browser-install');
  const e2e = validation.tasks.find((task) => task.id === 'playwright-e2e');
  assert.ok(install);
  assert.ok(e2e);
  assert.equal(install.env?.PLAYWRIGHT_BROWSERS_PATH, '0');
  assert.equal(e2e.env?.PLAYWRIGHT_BROWSERS_PATH, '0');
});

test('only the dependency installer receives the configured npm cache', () => {
  const runRoot = mkdtempSync(path.join(os.tmpdir(), 'questarrng-npm-cache-contract-'));
  temporaryRoots.push(runRoot);
  const install = validation.tasks.find((task) => task.id === 'install-dependencies');
  const lint = validation.tasks.find((task) => task.id === 'lint');
  assert.ok(install);
  assert.ok(lint);
  assert.deepEqual(install.passEnv, ['NPM_CONFIG_CACHE', 'NPM_CONFIG_OFFLINE']);
  const inherited = {
    PATH: process.env.PATH,
    NPM_CONFIG_CACHE: path.join(runRoot, 'shared-npm-cache'),
    NPM_CONFIG_OFFLINE: 'true',
  };
  assert.equal(
    isolatedTaskEnvironment(install, runRoot, inherited).NPM_CONFIG_CACHE,
    inherited.NPM_CONFIG_CACHE,
  );
  assert.equal(
    isolatedTaskEnvironment(install, runRoot, inherited).NPM_CONFIG_OFFLINE,
    'true',
  );
  assert.equal(isolatedTaskEnvironment(lint, runRoot, inherited).NPM_CONFIG_CACHE, undefined);
  assert.equal(isolatedTaskEnvironment(lint, runRoot, inherited).NPM_CONFIG_OFFLINE, undefined);
});

test('glob matching covers root and nested files without crossing sibling names', () => {
  const nested = globRegex('src/**/*.test.*');
  assert.equal(nested.test('src/a.test.js'), true);
  assert.equal(nested.test('src/components/a.test.jsx'), true);
  assert.equal(nested.test('src-other/a.test.js'), false);
  assert.equal(globRegex('**/*.spec.ts').test('a.spec.ts'), true);
});

test('inventory records scoped file digests and rejects empty or duplicate ownership', () => {
  const { root, config } = fixture();
  const inventory = discoverInventory(root, config.inventory);
  assert.deepEqual(inventory.laneCounts, { unit: 1 });
  assert.equal(inventory.entries[0].file, 'tests/example.test.mjs');
  assert.match(inventory.entries[0].sha256, /^[a-f0-9]{64}$/);
  assert.throws(() => discoverInventory(root, [
    ...config.inventory,
    { ...config.inventory[0], id: 'duplicate-owner', owner: 'other' },
  ]), /duplicate ownership/);
  assert.throws(() => discoverInventory(root, [{
    ...config.inventory[0],
    glob: 'tests/missing/**/*.test.mjs',
  }]), /inventory is empty/);
});

test('inventory rejects symbolic links in native test discovery scopes', () => {
  const root = makeRoot({ 'package.json': '{}\n' });
  mkdirSync(path.join(root, 'tests'), { recursive: true });
  writeFileSync(path.join(root, 'outside.test.mjs'), '');
  symlinkSync('../outside.test.mjs', path.join(root, 'tests', 'linked.test.mjs'));
  assert.throws(() => discoverInventory(root, baseConfig().inventory), /Symlink in test discovery scope/);
});

test('plan binds the candidate and closes test selection over its dependencies', () => {
  const { root, config } = fixture();
  config.tasks.unshift({
    id: 'prepare',
    name: 'Prepare',
    stage: 'prepare',
    kind: 'setup',
    command: [process.execPath, '-e', 'process.exit(0)'],
  });
  config.tasks[1].dependsOn = ['prepare'];
  config.tasks.push({
    id: 'optional-browser',
    name: 'Optional browser suite',
    stage: 'browser',
    kind: 'test',
    command: [process.execPath, '-e', 'process.exit(0)'],
    casePattern: 'passed (\\d+)',
    minimumCases: 1,
    defaultSelected: false,
  });
  const plan = createPlan(root, config, { testsOnly: true });
  assert.deepEqual(plan.tasks.filter((task) => task.selected).map((task) => task.id), [
    'prepare',
    'unit-tests',
  ]);
  assert.equal(plan.inventoryCounts.unit, 1);
  assert.equal(plan.candidate.commit.length, 40);
  assert.match(plan.candidate.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(plan.runtimes.length, 0);
  assert.match(plan.inventoryLaneDigests.unit, /^[a-f0-9]{64}$/);
});

test('runtime probes receive only the toolchain environment allowlist', () => {
  const { root, config } = fixture();
  const injected = {
    GITHUB_TOKEN: 'synthetic-runtime-token',
    NODE_OPTIONS: '--require=/nonexistent-questarr-runtime-module.cjs',
    TMPDIR: '/operator/nonexistent-temp',
  };
  const previous = new Map(Object.keys(injected).map((name) => [name, process.env[name]]));
  Object.assign(process.env, injected);
  config.runtimes = [{
    command: process.execPath,
    args: ['-e', `process.stdout.write(JSON.stringify(${JSON.stringify(Object.keys(injected))}.map((name) => process.env[name] ?? null)))`],
    versionPattern: '^\\[null,null,null\\]$',
  }];
  try {
    const plan = createPlan(root, config);
    assert.equal(plan.runtimes[0].version, '[null,null,null]');
    assert.equal(plan.runtimes[0].available, true);
    assert.equal(plan.runtimes[0].versionCompatible, true);
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('runtime probes keep default asdf and mise shims usable after environment sanitization', {
  skip: process.platform === 'win32',
}, () => {
  const { root, config } = fixture();
  const hostHome = mkdtempSync(path.join(os.tmpdir(), 'questarrng-runtime-shim-home-'));
  temporaryRoots.push(hostHome);
  const asdfDataDir = path.join(hostHome, '.asdf');
  const asdfShimDirectory = path.join(asdfDataDir, 'shims');
  const miseDataDir = path.join(hostHome, '.local', 'share', 'mise');
  const miseShimDirectory = path.join(hostHome, '.local', 'share', 'mise-shims');
  mkdirSync(asdfShimDirectory, { recursive: true });
  mkdirSync(miseShimDirectory, { recursive: true });
  writeFileSync(
    path.join(asdfShimDirectory, 'node'),
    `#!/bin/sh\nif [ "$ASDF_DATA_DIR" != '${asdfDataDir}' ]; then printf '%s\\n' 'missing asdf data directory' >&2; exit 70; fi\nprintf '%s\\n' 'asdf-shim-ok'\n`,
    { mode: 0o755 },
  );
  writeFileSync(
    path.join(miseShimDirectory, 'npm'),
    `#!/bin/sh\nif [ "$MISE_DATA_DIR" != '${miseDataDir}' ]; then printf '%s\\n' 'missing mise data directory' >&2; exit 71; fi\nprintf '%s\\n' 'mise-shim-ok'\n`,
    { mode: 0o755 },
  );

  const overrides = {
    HOME: hostHome,
    PATH: [asdfShimDirectory, miseShimDirectory, process.env.PATH].filter(Boolean).join(path.delimiter),
    ASDF_DATA_DIR: null,
    ASDF_DIR: null,
    MISE_DATA_DIR: null,
    XDG_DATA_HOME: null,
    LOCALAPPDATA: null,
  };
  const previous = new Map(Object.keys(overrides).map((name) => [name, process.env[name]]));
  for (const [name, value] of Object.entries(overrides)) {
    if (value === null) delete process.env[name];
    else process.env[name] = value;
  }
  config.runtimes = [
    { command: 'node', args: ['--version'], versionPattern: '^asdf-shim-ok$' },
    { command: 'npm', args: ['--version'], versionPattern: '^mise-shim-ok$' },
  ];
  try {
    const plan = createPlan(root, config);
    assert.deepEqual(plan.runtimes.map(({ available, version, versionCompatible }) => ({
      available,
      version,
      versionCompatible,
    })), [
      { available: true, version: 'asdf-shim-ok', versionCompatible: true },
      { available: true, version: 'mise-shim-ok', versionCompatible: true },
    ]);
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('executor rejects a plan whose task contract was changed after hashing', async () => {
  const { root, config } = fixture();
  const plan = createPlan(root, config);
  plan.tasks[0].command = [process.execPath, '-e', 'process.exit(0)'];
  await assert.rejects(executePlan(root, config, plan), /plan digest/);
});

test('native execution records passing case counts, source identity and private evidence', async () => {
  const { root, config } = fixture();
  const plan = createPlan(root, config);
  const runRoot = mkdtempSync(path.join(os.tmpdir(), 'questarrng-validation-receipt-'));
  temporaryRoots.push(runRoot);
  const result = await executePlan(root, config, plan, { runRoot });
  assert.equal(result.exitCode, 0, JSON.stringify(result.receipt, null, 2) +
    '\\n' + readFileSync(path.join(runRoot, 'unit-tests.log'), 'utf8'));
  assert.equal(result.receipt.status, 'passed');
  assert.equal(result.receipt.totals.executed, 1);
  assert.equal(result.receipt.totals.activeCases, 1);
  assert.deepEqual(result.receipt.tasks[0].inventory.map((item) => item.discoveredFiles), [1]);
  assert.equal(statSync(runRoot).mode & 0o777, 0o700);
  const log = path.join(runRoot, result.receipt.tasks[0].logFile);
  assert.equal(statSync(log).mode & 0o777, 0o600);
  assert.match(readFileSync(path.join(runRoot, 'receipt.json'), 'utf8'), /"status": "passed"/);
});

test('failed test tasks expose a bounded printable diagnostic to the caller', async () => {
  const { root, config } = fixture();
  config.tasks[0].command = [
    process.execPath,
    '-e',
    "process.stdout.write('x'.repeat(20000)); process.stderr.write('\\u001b[31mcontract failure\\u001b[0m\\r\\n::error::forged\\n##[group]forged\\n'); process.exit(1);",
  ];
  const failures = [];
  const result = await executePlan(root, config, createPlan(root, config), {
    onTaskFailure: (failure) => failures.push(failure),
  });
  assert.equal(result.exitCode, 1);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].taskId, 'unit-tests');
  assert.equal(failures[0].status, 'failed');
  assert.equal(failures[0].outputBytes > 16 * 1024, true);
  assert.equal(failures[0].truncated, true);
  assert.ok(Buffer.byteLength(failures[0].output, 'utf8') <= 16 * 1024);
  // eslint-disable-next-line no-control-regex -- verify the terminal-control filter.
  assert.doesNotMatch(failures[0].output, /[\u0000-\u0009\u000B-\u001F\u007F]/u);
  assert.match(failures[0].output, /contract failure/u);
  assert.match(failures[0].output, /^\| ::error::forged$/mu);
  assert.match(failures[0].output, /^\| ##\[group\]forged$/mu);
  assert.doesNotMatch(failures[0].output, /^(?:::|##\[)/mu);
});

test('live progress reports task start, heartbeat, and completion', async () => {
  const { root, config } = fixture();
  config.tasks[0].command = [
    process.execPath,
    '-e',
    'console.log("# pass 1"); setTimeout(() => {}, 1300);',
  ];
  const messages = [];
  const result = await executePlan(root, config, createPlan(root, config), {
    progressIntervalMs: 100,
    onProgress: (summary) => messages.push(summary),
  });
  assert.equal(result.exitCode, 0);
  assert.ok(messages.some((summary) => summary.includes('running Unit tests (0m00s)')));
  assert.ok(messages.some((summary) => summary.includes('running Unit tests (0m01s)')));
  assert.equal(messages.at(-1),
    '[validation] fixture: 1/1 selected tasks complete (1 passed, 0 failed, 0 blocked, 0 not-run, 0 pending)');
});

test('progress formatter reports completed, blocked, pending, and active tasks', () => {
  const tasks = [
    { id: 'passed', name: 'Passed task' },
    { id: 'blocked', name: 'Blocked task' },
    { id: 'not-run', name: 'Not-run task' },
    { id: 'running', name: 'Long task' },
  ];
  const results = new Map([
    ['passed', { status: 'passed' }],
    ['blocked', { status: 'blocked' }],
    ['not-run', { status: 'not-run' }],
  ]);
  assert.equal(
    formatValidationProgress('sample', tasks, results, tasks[3], 65_000),
    '[validation] sample: 1/4 selected tasks complete (1 passed, 0 failed, 1 blocked, 1 not-run, 1 pending); running Long task (1m05s)',
  );
});

test('execution fails closed when a test reports zero active cases', async () => {
  const { root, config } = fixture();
  config.tasks[0].command = [process.execPath, '-e', 'console.log("suite completed")'];
  const plan = createPlan(root, config);
  const result = await executePlan(root, config, plan);
  assert.equal(result.receipt.tasks[0].status, 'incomplete');
  assert.equal(result.receipt.status, 'failed');
  assert.equal(result.receipt.totals.activeCases, 0);
});

test('execution blocks later tasks when a command changes the planned source', async () => {
  const { root, config } = fixture();
  config.tasks.push({
    id: 'after-tests',
    name: 'Must not run after drift',
    stage: 'repository',
    kind: 'check',
    command: [process.execPath, '-e', 'process.exit(0)'],
  });
  config.tasks[0].command = [
    process.execPath,
    '-e',
    "require('node:fs').writeFileSync('package.json', '{\\\"changed\\\":true}\\n')",
  ];
  const plan = createPlan(root, config);
  const result = await executePlan(root, config, plan);
  assert.equal(result.receipt.status, 'failed');
  assert.equal(result.receipt.tasks[0].status, 'incomplete');
  assert.match(result.receipt.tasks[1].reason, /candidate source changed/);
  assert.equal(result.receipt.totals.blocked, 1);
});

test('execution records timeouts and does not accept failed native commands', async () => {
  const { root, config } = fixture();
  config.tasks[0].command = [process.execPath, '-e', 'setInterval(() => {}, 1000)'];
  config.tasks[0].timeoutSeconds = 0.1;
  const plan = createPlan(root, config);
  const result = await executePlan(root, config, plan);
  assert.equal(result.receipt.tasks[0].status, 'failed');
  assert.equal(result.receipt.tasks[0].timedOut, true);
  assert.equal(result.receipt.status, 'failed');
});

test('workspace run lock rejects overlap and releases only its own lock file', () => {
  const { root } = fixture();
  const first = acquireRunLock(root, 'questarrng');
  try {
    assert.equal(statSync(first.lockPath).mode & 0o777, 0o600);
    assert.throws(() => acquireRunLock(root, 'questarrng'), /Another validation engine run is active/);
  } finally {
    releaseRunLock(first);
  }
  const second = acquireRunLock(root, 'questarrng');
  releaseRunLock(second);
  assert.throws(() => readFileSync(first.lockPath, 'utf8'), { code: 'ENOENT' });
});

test('workspace run lock refuses to overwrite a stale lock without confirmation', () => {
  const { root } = fixture();
  const first = acquireRunLock(root, 'questarrng');
  releaseRunLock(first);
  writeFileSync(first.lockPath, JSON.stringify({ pid: -1 }), { mode: 0o600 });
  try {
    assert.throws(() => acquireRunLock(root, 'questarrng'), /A stale validation lock exists/);
  } finally {
    unlinkSync(first.lockPath);
  }
});

test('exports a private receipt only to a location beneath the system temporary directory', async () => {
  const { root, config } = fixture();
  const exportDirectory = mkdtempSync(path.join(os.tmpdir(), 'questarrng-export-contract-'));
  temporaryRoots.push(exportDirectory);
  const exportPath = path.join(exportDirectory, 'receipt.json');
  const previous = process.env.VALIDATION_RECEIPT_EXPORT;
  process.env.VALIDATION_RECEIPT_EXPORT = exportPath;
  try {
    assert.equal(await runEngine(['--task', 'unit-tests'], root, config), 0);
    assert.equal(JSON.parse(readFileSync(exportPath, 'utf8')).status, 'passed');
    assert.equal(statSync(exportPath).mode & 0o777, 0o600);
  } finally {
    if (previous === undefined) delete process.env.VALIDATION_RECEIPT_EXPORT;
    else process.env.VALIDATION_RECEIPT_EXPORT = previous;
  }
});

test('child environments hide inherited secrets and reject unapproved passEnv requests', async () => {
  const { root, config } = fixture();
  const runRoot = mkdtempSync(path.join(os.tmpdir(), 'questarrng-isolated-environment-'));
  temporaryRoots.push(runRoot);
  assert.throws(
    () => isolatedTaskEnvironment({ id: '../outside' }, runRoot),
    /safe lowercase identifier/,
  );
  const key = 'VALIDATION_ENGINE_TEST_SECRET';
  const injected = {
    [key]: 'do-not-log-me',
    GITHUB_TOKEN: 'synthetic-github-token',
    NODE_OPTIONS: '--require=/nonexistent-questarr-validation-module.cjs',
    HOME: '/operator/home',
    TMPDIR: '/operator/tmp',
    XDG_CONFIG_HOME: '/operator/config',
    HTTPS_PROXY: 'http://proxy.invalid',
    RANDOM_PRIVATE_VALUE: 'synthetic-private-value',
  };
  const previous = new Map(Object.keys(injected).map((name) => [name, process.env[name]]));
  Object.assign(process.env, injected);
  try {
    config.tasks[0].kind = 'check';
    config.tasks[0].command = [
      process.execPath,
      '-e',
      `const fs = require('node:fs');
const path = require('node:path');
const keys = ${JSON.stringify([...Object.keys(injected), 'CI'])};
fs.mkdirSync(path.join(process.env.HOME, '.npm'), { recursive: true });
fs.writeFileSync(path.join(process.env.HOME, '.npm', 'cache'), 'temporary npm cache');
process.stdout.write(JSON.stringify(Object.fromEntries(keys.map((name) => [name, process.env[name] ?? null]))))`,
    ];
    const result = await executePlan(root, config, createPlan(root, config), { runRoot });
    const log = path.join(result.runRoot, result.receipt.tasks[0].logFile);
    const childEnvironment = JSON.parse(readFileSync(log, 'utf8'));
    assert.equal(childEnvironment[key], null);
    assert.equal(childEnvironment.GITHUB_TOKEN, null);
    assert.equal(childEnvironment.NODE_OPTIONS, null);
    assert.equal(childEnvironment.HTTPS_PROXY, null);
    assert.equal(childEnvironment.RANDOM_PRIVATE_VALUE, null);
    assert.equal(childEnvironment.HOME, path.join(result.runRoot, 'unit-tests-environment', 'home'));
    assert.equal(childEnvironment.TMPDIR, path.join(result.runRoot, 'unit-tests-environment', 'tmp'));
    assert.equal(childEnvironment.XDG_CONFIG_HOME, path.join(result.runRoot, 'unit-tests-environment', 'xdg-config'));
    assert.equal(childEnvironment.CI, 'true');
    assert.equal(existsSync(path.join(result.runRoot, 'unit-tests-environment')), false);

    config.tasks[0].passEnv = [key];
    assert.throws(() => createPlan(root, config), /unapproved inherited environment variable/);
    assert.throws(
      () => isolatedTaskEnvironment(config.tasks[0], runRoot, process.env),
      /unapproved inherited environment variable/,
    );
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('isolated task environments preserve default version-manager data directories', () => {
  const runRoot = mkdtempSync(path.join(os.tmpdir(), 'questarrng-version-manager-environment-'));
  const hostHome = mkdtempSync(path.join(os.tmpdir(), 'questarrng-version-manager-home-'));
  temporaryRoots.push(runRoot, hostHome);
  const asdfDataDir = path.join(hostHome, '.asdf');
  const xdgDataHome = path.join(hostHome, 'xdg-data');
  const shimDirectory = path.join(asdfDataDir, 'shims');
  mkdirSync(shimDirectory, { recursive: true });
  writeFileSync(
    path.join(shimDirectory, 'node'),
    `#!/bin/sh\nif [ "$ASDF_DATA_DIR" != '${asdfDataDir}' ]; then exit 70; fi\nprintf '%s\\n' 'asdf-shim-ok'\n`,
    { mode: 0o755 },
  );

  const environment = isolatedTaskEnvironment(
    { id: 'unit-tests' },
    runRoot,
    {
      HOME: hostHome,
      PATH: shimDirectory,
      XDG_DATA_HOME: xdgDataHome,
    },
  );

  assert.equal(environment.HOME, path.join(runRoot, 'unit-tests-environment', 'home'));
  assert.notEqual(environment.HOME, hostHome);
  assert.equal(environment.ASDF_DATA_DIR, asdfDataDir);
  assert.equal(environment.MISE_DATA_DIR, path.join(xdgDataHome, 'mise'));

  if (process.platform !== 'win32') {
    const shimResult = spawnSync('node', ['--version'], { env: environment, encoding: 'utf8' });
    assert.equal(shimResult.status, 0, shimResult.error?.message ?? shimResult.stderr);
    assert.equal(shimResult.stdout, 'asdf-shim-ok\n');
  }
});

test('version-manager defaults fall back to ASDF_DIR and the host data directory', () => {
  const runRoot = mkdtempSync(path.join(os.tmpdir(), 'questarrng-version-manager-fallback-'));
  const hostHome = mkdtempSync(path.join(os.tmpdir(), 'questarrng-version-manager-home-'));
  temporaryRoots.push(runRoot, hostHome);
  const asdfInstall = path.join(hostHome, 'asdf-install');
  const environment = isolatedTaskEnvironment(
    { id: 'unit-tests' },
    runRoot,
    { HOME: hostHome, ASDF_DIR: asdfInstall, PATH: process.env.PATH },
  );

  assert.equal(environment.ASDF_DATA_DIR, asdfInstall);
  const hostDataHome = process.platform === 'win32'
    ? path.join(hostHome, 'AppData', 'Local')
    : path.join(hostHome, '.local', 'share');
  assert.equal(environment.MISE_DATA_DIR, path.join(hostDataHome, 'mise'));
});

test('plan and executor reject dependency cycles and report missing tools', async () => {
  const { root, config } = fixture();
  config.tasks[0].dependsOn = ['other'];
  config.tasks.push({
    id: 'other',
    name: 'Other',
    stage: 'repository',
    kind: 'check',
    command: [process.execPath, '-e', 'process.exit(0)'],
    dependsOn: ['unit-tests'],
  });
  assert.throws(() => createPlan(root, config), /dependency cycle/);

  const missingRoot = makeRoot({ 'package.json': '{}\n' });
  const missingConfig = baseConfig({
    inventory: [],
    tasks: [{
      id: 'check',
      name: 'Check',
      stage: 'repository',
      kind: 'check',
      command: [process.execPath, '-e', 'throw new Error("must not execute")'],
    }],
    requiredCommands: ['command-that-is-not-installed-validation-test'],
  });
  const plan = createPlan(missingRoot, missingConfig);
  const progress = [];
  const result = await executePlan(missingRoot, missingConfig, plan, {
    onProgress: (summary) => progress.push(summary),
  });
  assert.equal(result.receipt.status, 'incomplete');
  assert.equal(result.receipt.tasks[0].status, 'not-run');
  assert.equal(result.receipt.totals.executed, 0);
  assert.equal(result.receipt.totals.blocked, 0);
  assert.equal(result.receipt.prerequisites.some((item) => !item.available), true);
  assert.equal(
    progress.at(-1),
    '[validation] fixture: 0/1 selected tasks complete (0 passed, 0 failed, 0 blocked, 1 not-run, 0 pending)',
  );
});

test('candidate digests change after tracked source edits', () => {
  const { root, config } = fixture();
  const before = captureCandidate(root, config.inputs, discoverInventory(root, config.inventory));
  const externalDiff = spawnSync('git', ['config', 'diff.external', '/bin/true'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(externalDiff.status, 0, externalDiff.stderr);
  writeFileSync(path.join(root, 'src/app.js'), 'export const candidate = false;\n');
  const afterEdit = captureCandidate(root, config.inputs, discoverInventory(root, config.inventory));
  assert.notEqual(before.sourceSha256, afterEdit.sourceSha256);
});

test('runtime probe directories resolve trusted temporary-root symlinks', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'questarrng-runtime-probe-contract-'));
  temporaryRoots.push(root);
  const actualRoot = path.join(root, 'actual-temp');
  const aliasRoot = path.join(root, 'temp-alias');
  mkdirSync(actualRoot);
  symlinkSync(actualRoot, aliasRoot, process.platform === 'win32' ? 'junction' : 'dir');

  const probe = runtimeProbeDirectory(aliasRoot);
  assert.equal(path.dirname(probe), realpathSync(actualRoot));
  rmSync(probe, { recursive: true, force: true });
});

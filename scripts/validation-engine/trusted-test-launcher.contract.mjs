// Copyright (c) snapetech and SeerrNG contributors.
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { URL, fileURLToPath } from 'node:url';
import {
  HOST_PATHS_TO_HIDE,
  SYSTEM_PATHS_TO_MOUNT,
  hostPathsToHide,
  isSensitiveCandidatePath,
  sandboxMountOperations,
} from './trusted-test-sandbox-policy.mjs';

const launcher = fileURLToPath(
  new URL(
    './trusted-test-launcher.mjs',
    import.meta.url
  )
);
const launcherSource = readFileSync(launcher, 'utf8');
assert.doesNotMatch(
  launcherSource,
  /['"]--ro-bind['"]\s*,\s*['"]\/['"]\s*,\s*['"]\/['"]/u,
  'the launcher must not bind the host root into the candidate sandbox'
);
assert.match(
  launcherSource,
  /if \(separator === -1\)\s*throw new Error\('Pass a candidate test command after --\.'\)/u,
  'the launcher must require an explicit candidate command'
);
assert.doesNotMatch(launcherSource, /run-local-validation\.mjs/u);
assert.match(
  launcherSource,
  /sandboxHostsFile,[\s\S]*?127\.0\.0\.1 localhost\\n::1 localhost ip6-localhost\\n[\s\S]*?sandboxNsswitchFile,[\s\S]*?hosts: files dns\\n[\s\S]*?source: networkAccess \? realpathSync\('\/etc\/resolv\.conf'\) : sandboxResolvFile/u,
  'the sandbox must supply synthetic host lookup rules and only the resolver file needed for dependency prefetch'
);
assert.match(
  launcherSource,
  /npmDependencyPrewarm: true,[\s\S]*?networkAccess: true/u,
  'candidate-selected packages must be prefetched with lifecycle scripts disabled inside Bubblewrap'
);
assert.match(
  launcherSource,
  /const npmInstallArguments = \[[\s\S]*?'--ignore-scripts=true'/u,
  'dependency prefetch must disable lifecycle scripts'
);
assert.match(
  launcherSource,
  /if \(networkAccess !== npmDependencyPrewarm\)[\s\S]*?Network access is reserved for dependency prewarming/u,
  'network access must not be enabled for candidate validation commands'
);
assert.match(
  launcherSource,
  /if \(!networkAccess\) args\.push\('--unshare-net'\)/u,
  'network access is enabled only for the dependency prewarm command'
);
assert.match(
  launcherSource,
  /source: sandboxHostsFile,\s*target: '\/etc\/hosts'/u,
  'candidate validation uses a synthetic localhost hosts file'
);
assert.match(
  launcherSource,
  /source: sandboxNsswitchFile,\s*target: '\/etc\/nsswitch\.conf'/u,
  'candidate validation uses an isolated resolver lookup order'
);
assert.match(
  launcherSource,
  /source: networkAccess \? realpathSync\('\/etc\/resolv\.conf'\) : sandboxResolvFile/u,
  'only dependency prewarming receives resolver configuration'
);
for (const hostPath of ['/etc', '/opt', '/srv', '/usr/local'])
  assert.ok(
    HOST_PATHS_TO_HIDE.includes(hostPath),
    `the sandbox must hide host path ${hostPath}`
  );
const bwrap = ['/usr/bin/bwrap', '/bin/bwrap'].find(existsSync);
const sandboxAvailable = (() => {
  if (process.platform !== 'linux' || !bwrap) return false;
  return (
    spawnSync(
      bwrap,
      [
        '--die-with-parent',
        '--unshare-user',
        '--ro-bind',
        '/',
        '/',
        '--',
        '/bin/true',
      ],
      { stdio: 'ignore' }
    ).status === 0
  );
})();
const sandboxRequired = process.env.REQUIRE_VALIDATION_SANDBOX === '1';

function createDedicatedNodeRuntime(parent) {
  const source = realpathSync(process.execPath);
  const sourceRoot = path.dirname(path.dirname(source));
  const runtimeRoot = path.join(parent, `node-v${process.versions.node}`);
  const runtime = path.join(runtimeRoot, path.relative(sourceRoot, source));
  if (sourceRoot === '/usr') {
    mkdirSync(path.dirname(runtime), { recursive: true, mode: 0o700 });
    copyFileSync(source, runtime);
  } else {
    cpSync(sourceRoot, runtimeRoot, { recursive: true, dereference: false });
  }
  chmodSync(runtime, 0o555);
  return runtime;
}

test(
  'requires Bubblewrap when the validation sandbox is mandatory',
  { skip: !sandboxRequired && 'mandatory sandbox mode is not enabled' },
  () => {
    assert.equal(
      sandboxAvailable,
      true,
      'Bubblewrap user namespaces must work when REQUIRE_VALIDATION_SANDBOX=1'
    );
  }
);

test('preserves tracked source files with token-like names and excludes credential files', () => {
  assert.equal(isSensitiveCandidatePath('web/src/lib/token.js'), false);
  assert.equal(isSensitiveCandidatePath('vendor/mainline/src/rpc/server/tokens.rs'), false);
  assert.equal(isSensitiveCandidatePath('src/authentication.ts'), false);
  assert.equal(isSensitiveCandidatePath('src/auth.ts'), false);
  assert.equal(isSensitiveCandidatePath('auth'), true);
  assert.equal(isSensitiveCandidatePath('nested/tokens'), true);
  assert.equal(isSensitiveCandidatePath('credentials'), true);
  assert.equal(isSensitiveCandidatePath('secrets'), true);
  assert.equal(isSensitiveCandidatePath('nested/secrets.env'), true);
  assert.equal(isSensitiveCandidatePath('auth.json'), true);
  assert.equal(isSensitiveCandidatePath('nested/config/secrets.yaml'), true);
  assert.equal(isSensitiveCandidatePath('.env.local'), true);
  assert.equal(isSensitiveCandidatePath('nested/credentials.txt'), true);
  assert.equal(isSensitiveCandidatePath('tokens.env'), true);
  assert.equal(isSensitiveCandidatePath('tokens.env.local'), true);
  assert.equal(isSensitiveCandidatePath('secrets.env.production'), true);
  assert.equal(isSensitiveCandidatePath('tokens.env.example'), false);
  assert.equal(isSensitiveCandidatePath('.token'), true);
  assert.equal(isSensitiveCandidatePath('.auth'), true);
  assert.equal(isSensitiveCandidatePath('.credentials'), true);
  assert.equal(isSensitiveCandidatePath('.secrets'), true);
  assert.equal(isSensitiveCandidatePath('api-key.json'), true);
  assert.equal(isSensitiveCandidatePath('access-token.json'), true);
  assert.equal(isSensitiveCandidatePath('refresh_token.yaml'), true);
  assert.equal(isSensitiveCandidatePath('client-secret.ts'), true);
  assert.equal(isSensitiveCandidatePath('nested/private-key.ts'), true);
  assert.equal(isSensitiveCandidatePath('.private-key.ts'), true);
  assert.equal(isSensitiveCandidatePath('token.dat'), true);
  assert.equal(
    isSensitiveCandidatePath('nested/credentials/private-key'),
    true,
  );
  assert.equal(
    isSensitiveCandidatePath('nested/credentials/settings.json'),
    true,
  );
  assert.equal(isSensitiveCandidatePath('src/tokens/index.ts'), false);
  assert.equal(
    isSensitiveCandidatePath('nested/credentials/TokenStore.ts'),
    false,
  );
  assert.equal(isSensitiveCandidatePath('server/routes/api-keys.ts'), false);
  assert.equal(isSensitiveCandidatePath('charts/questarr/templates/secret.yaml'), false);
  assert.equal(isSensitiveCandidatePath('docs/SECRETS.md'), false);
  assert.equal(isSensitiveCandidatePath('docs/secrets.json'), true);
});

test('keeps system runtime directories while remasking checkouts beneath them', () => {
  const checkout = '/usr/bin/QuestarrNG';
  const hiddenDirectories = hostPathsToHide(checkout).filter(
    (directory) => directory === checkout
  );
  assert.deepEqual(hiddenDirectories, [checkout]);
  const operations = sandboxMountOperations({
    sourceRoot: checkout,
    workspace: '/mnt/workspace',
    runDirectory: '/mnt/run-data',
    externalMounts: [],
    dependencyMounts: [],
    systemMounts: [['/usr/bin', '/usr/bin']],
    hiddenDirectories,
    guestWorkspace: '/mnt/workspace',
    guestRun: '/mnt/run-data',
    markerFile: '/run/validation-engine-sandbox',
    guestMarker: '/run/validation-engine-sandbox',
  });
  const systemBind = operations.findIndex(
    (operation) => operation.type === 'ro-bind-fd' && operation.target === '/usr/bin'
  );
  const checkoutMask = operations.findLastIndex(
    (operation) => operation.type === 'tmpfs' && operation.path === checkout
  );
  assert.ok(systemBind >= 0);
  assert.ok(checkoutMask > systemBind);

  const aliasedSystemOperations = sandboxMountOperations({
    sourceRoot: checkout,
    workspace: '/mnt/workspace',
    runDirectory: '/mnt/run-data',
    externalMounts: [],
    dependencyMounts: [],
    systemMounts: [['/usr/bin', '/bin']],
    hiddenDirectories,
    guestWorkspace: '/mnt/workspace',
    guestRun: '/mnt/run-data',
    markerFile: '/run/validation-engine-sandbox',
    guestMarker: '/run/validation-engine-sandbox',
  });
  const aliasedSystemBind = aliasedSystemOperations.findIndex(
    (operation) => operation.type === 'ro-bind-fd' && operation.target === '/bin'
  );
  const aliasedCheckoutMask = aliasedSystemOperations.findLastIndex(
    (operation) => operation.type === 'tmpfs' && operation.path === '/bin/QuestarrNG'
  );
  assert.ok(aliasedCheckoutMask > aliasedSystemBind);

  const nestedAliasOperations = sandboxMountOperations({
    sourceRoot: checkout,
    workspace: '/mnt/workspace',
    runDirectory: '/mnt/run-data',
    externalMounts: [],
    dependencyMounts: [],
    systemMounts: [['/usr', '/usr/bin']],
    hiddenDirectories,
    guestWorkspace: '/mnt/workspace',
    guestRun: '/mnt/run-data',
    markerFile: '/run/validation-engine-sandbox',
    guestMarker: '/run/validation-engine-sandbox',
  });
  assert.ok(
    nestedAliasOperations.findLastIndex(
      (operation) =>
        operation.type === 'tmpfs' &&
        operation.path === '/usr/bin/bin/QuestarrNG'
    ) >
      nestedAliasOperations.findIndex(
        (operation) => operation.type === 'ro-bind-fd' && operation.target === '/usr/bin'
      )
  );
  assert.throws(
    () =>
      sandboxMountOperations({
        sourceRoot: checkout,
        workspace: '/mnt/workspace',
        runDirectory: '/mnt/run-data',
        externalMounts: [],
        dependencyMounts: [],
        systemMounts: [['/usr', '/usr/bin']],
        hiddenDirectories: [checkout, '/usr/local'],
        guestWorkspace: '/mnt/workspace',
        guestRun: '/mnt/run-data',
        markerFile: '/run/validation-engine-sandbox',
        guestMarker: '/run/validation-engine-sandbox',
      }),
    /System runtime mount source overlaps a hidden host path/u,
    'a broad runtime source must not restore a separate hidden host root'
  );

  const topLevelCheckout = '/usr/QuestarrNG';
  const topLevelHidden = hostPathsToHide(topLevelCheckout);
  assert.equal(topLevelHidden.includes('/usr'), false);
  assert.equal(topLevelHidden.at(-1), topLevelCheckout);
  assert.throws(
    () => hostPathsToHide('/usr'),
    /cannot contain a system runtime mount/u
  );
  assert.throws(
    () => hostPathsToHide('/usr/share'),
    /cannot contain a system runtime mount/u
  );

  assert.throws(
    () =>
      sandboxMountOperations({
        sourceRoot: '/opt/nodejs/QuestarrNG',
        workspace: '/mnt/workspace',
        runDirectory: '/mnt/run-data',
        externalMounts: [],
        dependencyMounts: [],
        systemMounts: [['/opt/nodejs', '/usr/share/nodejs']],
        hiddenDirectories: ['/opt'],
        guestWorkspace: '/mnt/workspace',
        guestRun: '/mnt/run-data',
        markerFile: '/run/validation-engine-sandbox',
        guestMarker: '/run/validation-engine-sandbox',
      }),
    /System runtime mount source overlaps a hidden host path/u,
    'a canonical source reached through a symlink must not expose a masked checkout'
  );
});

test('binds open sources only after masking their host directories', () => {
  const hiddenDirectories = hostPathsToHide('/home/runner/work/project')
    .filter((directory) => ['/home', '/tmp', '/mnt'].includes(directory));
  const operations = sandboxMountOperations({
    sourceRoot: '/home/runner/work/project',
    workspace: '/home/runner/work/project',
    runDirectory: '/home/runner/work/_temp/validation-run',
    externalMounts: [['/usr/local/bin/node', '/mnt/run-data/dependencies/0']],
    dependencyMounts: [['/home/runner/work/project/node_modules/react', '/mnt/workspace/node_modules/react']],
    systemMounts: SYSTEM_PATHS_TO_MOUNT.map((directory) => [directory, directory]),
    hiddenDirectories,
    guestWorkspace: '/mnt/workspace',
    guestRun: '/mnt/run-data',
    markerFile: '/home/runner/work/_temp/validation-run/sandbox-marker',
    guestMarker: '/run/validation-engine-sandbox',
  });
  const finalHostMask = Math.max(...operations
    .map((operation, index) => operation.hostMask ? index : -1));
  const descriptorBinds = operations.filter((operation) =>
    operation.type === 'bind-fd' || operation.type === 'ro-bind-fd');

  assert.equal(operations.filter((operation) => operation.hostMask).length, hiddenDirectories.length);
  assert.ok(SYSTEM_PATHS_TO_MOUNT.includes('/usr/bin'));
  assert.ok(SYSTEM_PATHS_TO_MOUNT.includes('/usr/lib'));
  assert.ok(descriptorBinds.length > 0);
  const systemBinBind = operations.findIndex(
    (operation) => operation.type === 'ro-bind-fd' && operation.target === '/usr/bin'
  );
  const workspaceBind = operations.find(
    (operation) => operation.type === 'bind-fd' && operation.target === '/mnt/workspace'
  );
  assert.ok(systemBinBind > finalHostMask);
  assert.ok(operations.indexOf(workspaceBind) > finalHostMask);
  assert.equal(workspaceBind.source, '/home/runner/work/project');
  assert.equal(workspaceBind.target, '/mnt/workspace');
  const metadataBind = operations.find(
    (operation) => operation.type === 'ro-bind-fd' && operation.target === '/mnt/workspace/.git'
  );
  assert.ok(metadataBind);
  assert.ok(operations.indexOf(metadataBind) > operations.indexOf(workspaceBind));
  assert.equal(metadataBind.source, '/home/runner/work/project/.git');
  assert.equal(
    operations.some((operation) => operation.source === '/' && operation.target === '/'),
    false
  );
  assert.equal(descriptorBinds.at(-1).source, '/home/runner/work/_temp/validation-run/sandbox-marker');
});

test('rejects run-data mounts that contain or overlap the candidate workspace', () => {
  const shared = {
    sourceRoot: '/home/runner/work/project',
    externalMounts: [],
    dependencyMounts: [],
    systemMounts: [],
    hiddenDirectories: ['/home'],
    guestWorkspace: '/mnt/workspace',
    guestRun: '/mnt/run-data',
    markerFile: '/run/validation-engine-sandbox',
    guestMarker: '/run/validation-engine-sandbox',
  };

  assert.throws(
    () =>
      sandboxMountOperations({
        ...shared,
        workspace: '/tmp/trusted-validation-run/workspace',
        runDirectory: '/tmp/trusted-validation-run',
      }),
    /workspace and sandbox run data must use disjoint host directories/u,
    'binding the parent run directory would expose a writable alias of workspace/.git'
  );
  assert.throws(
    () =>
      sandboxMountOperations({
        ...shared,
        workspace: '/tmp/trusted-validation-run',
        runDirectory: '/tmp/trusted-validation-run/run-data',
      }),
    /workspace and sandbox run data must use disjoint host directories/u
  );
});

test('rejects external runtime mounts that overlap the candidate checkout', () => {
  const shared = {
    sourceRoot: '/opt/node-v26/candidates/repo',
    workspace: '/mnt/workspace',
    runDirectory: '/mnt/run-data',
    dependencyMounts: [],
    systemMounts: [],
    hiddenDirectories: ['/opt'],
    guestWorkspace: '/mnt/workspace',
    guestRun: '/mnt/run-data',
    markerFile: '/run/validation-engine-sandbox',
    guestMarker: '/run/validation-engine-sandbox',
  };

  assert.throws(
    () =>
      sandboxMountOperations({
        ...shared,
        externalMounts: [['/opt/node-v26', '/mnt/run-data/dependencies/0']],
      }),
    /External runtime mount source overlaps the candidate checkout/u,
    'a runtime root containing the checkout must not restore its filtered files'
  );

  assert.throws(
    () =>
      sandboxMountOperations({
        ...shared,
        externalMounts: [
          ['/opt/node-v26/candidates/repo/toolchain', '/mnt/run-data/dependencies/0'],
        ],
      }),
    /External runtime mount source overlaps the candidate checkout/u,
    'a runtime root within the checkout must not expose unsnapshotted files'
  );
});

test(
  'trusted launcher contains import-time candidate code before it runs',
  { skip: !sandboxAvailable && 'bubblewrap user namespaces are unavailable' },
  async (t) => {
    const parent = mkdtempSync(
      path.join(tmpdir(), 'trusted-validation-launcher-')
    );
    const socketParent = mkdtempSync(
      path.join('/tmp', 'trusted-validation-socket-')
    );
    const source = path.join(parent, 'candidate');
    const hostFile = path.join(parent, 'host-canary.txt');
    const browserCache = path.join(parent, 'playwright-cache');
    const outsideDependencies = path.join(parent, 'outside-dependencies');
    const npmCache = path.join(parent, 'npm-cache');
    const invalidNpmCache = path.join(parent, 'npm-cache-with-link');
    const receiptOutput = path.join(parent, 'receipt-output', 'test.json');
    const installReceiptOutput = path.join(parent, 'install-receipt-output', 'test.json');
    const reportsOutput = path.join(parent, 'test-reports');
    const linkedReportsOutput = path.join(parent, 'linked-test-reports');
    const trustedNpmRuntime = path.join(parent, 'trusted-npm-runtime');
    const linkedRunnerTemp = path.join(parent, 'runner-temp-link');
    const outsideReceipt = path.join(
      path.dirname(parent),
      `trusted-validation-outside-receipt-${process.pid}.json`
    );
    const hostSocket = path.join(socketParent, 'host-canary.sock');
    const candidateWrite = path.join(source, 'launcher-write-canary.txt');
    const runtimeRoot = path.dirname(path.dirname(realpathSync(process.execPath)));
    const systemNode = runtimeRoot === '/usr' ? process.execPath : undefined;
    const launcherNode = createDedicatedNodeRuntime(parent);
    const hostOnlyProbe =
      ['/usr/share/doc', '/usr/share/man'].find(existsSync) ?? '/usr/share/doc';
    assert.ok(
      Buffer.byteLength(hostSocket) < 108,
      'the Unix socket path must fit Linux sun_path'
    );
    const tcpServer = createServer();
    const socketServer = createServer();
    t.after(async () => {
      if (tcpServer.listening)
        await new Promise((resolve) => tcpServer.close(resolve));
      if (socketServer.listening)
        await new Promise((resolve) => socketServer.close(resolve));
      rmSync(parent, { recursive: true, force: true });
      rmSync(socketParent, { recursive: true, force: true });
      rmSync(outsideReceipt, { force: true });
    });
    mkdirSync(path.join(source, 'bin'), { recursive: true });
    writeFileSync(
      path.join(source, 'package.json'),
      JSON.stringify({ name: 'candidate' })
    );
    writeFileSync(
      path.join(source, 'package-lock.json'),
      JSON.stringify({
        name: 'candidate',
        lockfileVersion: 3,
        requires: true,
        packages: { '': { name: 'candidate' } },
      })
    );
    mkdirSync(browserCache, { recursive: true });
    mkdirSync(outsideDependencies, { recursive: true });
    mkdirSync(npmCache, { recursive: true });
    mkdirSync(path.join(trustedNpmRuntime, '.bin'), { recursive: true });
    writeFileSync(
      path.join(trustedNpmRuntime, '.bin', 'npm'),
      '#!/bin/sh\nif [ "$1" = "ci" ]; then mkdir -p node_modules; printf installed > node_modules/sandbox-install-marker; else printf "trusted npm runtime\\n"; fi\n',
      { mode: 0o755 }
    );
    mkdirSync(invalidNpmCache, { recursive: true });
    symlinkSync(path.join(npmCache, 'cache-canary.txt'), path.join(invalidNpmCache, 'linked-cache-entry'));
    symlinkSync(parent, linkedRunnerTemp, 'dir');
    tcpServer.listen(0, '127.0.0.1');
    await once(tcpServer, 'listening');
    socketServer.listen(hostSocket);
    await once(socketServer, 'listening');
    mkdirSync(path.join(source, 'web/src/lib'), { recursive: true });
    writeFileSync(path.join(source, 'web/src/lib/token.js'), 'export const token = "source code";\n');
    mkdirSync(path.join(source, 'vendor/mainline/src/rpc/server'), { recursive: true });
    writeFileSync(path.join(source, 'vendor/mainline/src/rpc/server/tokens.rs'), 'pub fn tokens() {}\n');
    mkdirSync(path.join(source, 'nested/config'), { recursive: true });
    writeFileSync(hostFile, 'host canary stays unchanged');
    writeFileSync(path.join(browserCache, 'browser-canary.txt'), 'read-only browser');
    writeFileSync(path.join(npmCache, 'cache-canary.txt'), 'isolated npm cache');
    writeFileSync(path.join(source, '.gitignore'), 'node_modules/\n');
    writeFileSync(path.join(source, '.env'), 'PRIVATE_ENV_CANARY=hidden\n');
    writeFileSync(path.join(source, 'config.json'), '{"private":true}\n');
    writeFileSync(
      path.join(source, 'nested/.env.local'),
      'NESTED_ENV_CANARY=hidden\n'
    );
    writeFileSync(
      path.join(source, 'nested/config/secrets.json'),
      '{"secret":"hidden"}\n'
    );
    writeFileSync(path.join(source, 'auth.json'), '{"token":"private"}\n');
    writeFileSync(path.join(source, 'token.json'), '{"token":"private"}\n');
    writeFileSync(path.join(source, 'tokens.env'), 'PRIVATE_TOKENS_CANARY=hidden\n');
    writeFileSync(path.join(source, 'tokens.env.local'), 'SUFFIXED_TOKEN_CANARY=hidden\n');
    writeFileSync(path.join(source, 'secrets.env.production'), 'SUFFIXED_SECRET_CANARY=hidden\n');
    writeFileSync(path.join(source, 'tokens.env.example'), 'EXAMPLE_TOKEN_TEMPLATE=visible\n');
    writeFileSync(path.join(source, '.token'), 'DOT_TOKEN_CANARY=hidden\\n');
    writeFileSync(path.join(source, 'api-key.json'), '{"api_key":"hidden"}\\n');
    writeFileSync(path.join(source, 'access-token.json'), '{"access_token":"hidden"}\\n');
    writeFileSync(path.join(source, 'refresh_token.yaml'), 'refresh_token: hidden\\n');
    writeFileSync(path.join(source, 'client-secret.ts'), 'CLIENT_SECRET_CANARY=hidden\\n');
    writeFileSync(path.join(source, '.private-key.ts'), 'PRIVATE_KEY_CANARY=hidden\\n');
    mkdirSync(path.join(source, 'nested/credentials'), { recursive: true });
    writeFileSync(path.join(source, 'nested/credentials/private-key'), 'private credential\n');
    writeFileSync(path.join(source, 'nested/credentials/settings.json'), '{"secret":"hidden"}\n');
    writeFileSync(path.join(source, 'nested/credentials/TokenStore.ts'), 'export const tokenStore = true;\n');
    mkdirSync(path.join(source, 'src/tokens'), { recursive: true });
    writeFileSync(path.join(source, 'src/tokens/index.ts'), 'export const source = "token directory source";\n');
    writeFileSync(path.join(source, 'credentials'), 'private credential\n');
    mkdirSync(path.join(source, 'node_modules'), { recursive: true });
    writeFileSync(
      path.join(source, 'node_modules/marker.txt'),
      'read-only dependency'
    );
    mkdirSync(path.join(source, 'node_modules/fixture-dependency'));
    writeFileSync(
      path.join(source, 'node_modules/fixture-dependency/package.json'),
      '{"name":"fixture-dependency","type":"module","exports":"./index.js"}\n'
    );
    writeFileSync(
      path.join(source, 'node_modules/fixture-dependency/index.js'),
      'export default "sibling dependency resolved";\n'
    );
    writeFileSync(
      path.join(source, 'bin/run-local-validation.mjs'),
      `import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import fixtureDependency from 'fixture-dependency';
const hostFile = ${JSON.stringify(hostFile)};
const hostSocket = ${JSON.stringify(hostSocket)};
const hostPort = ${tcpServer.address().port};
assert.throws(() => readFileSync(hostFile), { code: 'ENOENT' });
assert.equal(process.env.SECRET_CANARY, undefined);
assert.equal(existsSync('/mnt/workspace/.env'), false);
assert.equal(existsSync('/mnt/workspace/config.json'), true);
assert.equal(existsSync('/mnt/workspace/nested/config/operator.json'), false);
assert.equal(existsSync('/mnt/workspace/auth.json'), false);
assert.equal(existsSync('/mnt/workspace/token.json'), false);
assert.equal(existsSync('/mnt/workspace/tokens.env'), false);
assert.equal(existsSync('/mnt/workspace/tokens.env.local'), false);
assert.equal(existsSync('/mnt/workspace/secrets.env.production'), false);
assert.match(readFileSync('/mnt/workspace/tokens.env.example', 'utf8'), /EXAMPLE_TOKEN_TEMPLATE=visible/u);
assert.equal(existsSync('/mnt/workspace/.token'), false);
assert.equal(existsSync('/mnt/workspace/api-key.json'), false);
assert.equal(existsSync('/mnt/workspace/access-token.json'), false);
assert.equal(existsSync('/mnt/workspace/refresh_token.yaml'), false);
assert.equal(existsSync('/mnt/workspace/client-secret.ts'), false);
assert.equal(existsSync('/mnt/workspace/.private-key.ts'), false);
assert.equal(existsSync('/mnt/workspace/token.dat'), false);
assert.equal(existsSync('/mnt/workspace/nested/credentials/private-key'), false);
assert.equal(existsSync('/mnt/workspace/nested/credentials/settings.json'), false);
assert.match(readFileSync('/mnt/workspace/nested/credentials/TokenStore.ts', 'utf8'), /tokenStore/u);
assert.match(readFileSync('/mnt/workspace/src/tokens/index.ts', 'utf8'), /token directory source/u);
assert.equal(existsSync('/mnt/workspace/credentials'), false);
assert.match(readFileSync('/mnt/workspace/web/src/lib/token.js', 'utf8'), /source code/u);
assert.ok(
  execFileSync('git', ['-C', '/mnt/workspace', 'ls-files'], { encoding: 'utf8' })
    .split(/\\r?\\n/u)
    .includes('web/src/lib/token.js')
);
assert.match(readFileSync('/mnt/workspace/vendor/mainline/src/rpc/server/tokens.rs', 'utf8'), /pub fn tokens/u);
assert.equal(existsSync('/mnt/workspace/nested/.env.local'), false);
assert.equal(existsSync('/mnt/workspace/nested/config/secrets.json'), false);
assert.equal(existsSync('/etc/os-release'), false);
assert.equal(readFileSync('/etc/hosts', 'utf8'), '127.0.0.1 localhost\\n::1 localhost ip6-localhost\\n');
assert.equal(readFileSync('/etc/nsswitch.conf', 'utf8'), 'hosts: files dns\\n');
assert.equal(readFileSync('/etc/resolv.conf', 'utf8'), '# External DNS is unavailable in the validation sandbox.\\n');
assert.equal(existsSync(${JSON.stringify(hostOnlyProbe)}), false);
const originalCheckout = ${JSON.stringify(source)};
assert.throws(() => readFileSync(path.join(originalCheckout, 'auth.json')), { code: 'ENOENT' });
assert.throws(() => writeFileSync(hostFile, 'escaped'));
assert.equal(readFileSync('/run/validation-engine-sandbox', 'utf8'), process.env.VALIDATION_OUTER_SANDBOX_TOKEN);
assert.equal(fixtureDependency, 'sibling dependency resolved');
assert.equal(process.env.NPM_CONFIG_CACHE, undefined);
assert.equal(process.env.NPM_CONFIG_OFFLINE, undefined);
assert.equal(process.env.RUNNER_TEMP, '/mnt/run-data/validation-output');
writeFileSync(process.env.VALIDATION_RECEIPT_EXPORT, JSON.stringify({ status: 'passed' }));
const connectionResults = await Promise.all([
  new Promise((resolve) => { const socket = net.connect(hostPort, '127.0.0.1'); socket.once('connect', () => { socket.destroy(); resolve('connected'); }); socket.once('error', () => resolve('blocked')); socket.setTimeout(1000, () => { socket.destroy(); resolve('blocked'); }); }),
  new Promise((resolve) => { const socket = net.createConnection(hostSocket); socket.once('connect', () => { socket.destroy(); resolve('connected'); }); socket.once('error', () => resolve('blocked')); socket.setTimeout(1000, () => { socket.destroy(); resolve('blocked'); }); }),
]);
assert.deepEqual(connectionResults, ['blocked', 'blocked']);
const loopbackServer = net.createServer((socket) => socket.end('sandbox loopback'));
await new Promise((resolve, reject) => {
  loopbackServer.once('error', reject);
  loopbackServer.listen(0, 'localhost', resolve);
});
const loopbackResult = await new Promise((resolve, reject) => {
  const socket = net.connect(loopbackServer.address().port, 'localhost');
  let response = '';
  socket.setEncoding('utf8');
  socket.on('data', (data) => { response += data; });
  socket.once('end', () => resolve(response));
  socket.once('error', reject);
});
await new Promise((resolve) => loopbackServer.close(resolve));
assert.equal(loopbackResult, 'sandbox loopback');
assert.equal(readFileSync(path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'browser-canary.txt'), 'utf8'), 'read-only browser');
assert.throws(() => writeFileSync(path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'browser-canary.txt'), 'changed'));
writeFileSync('/mnt/workspace/launcher-write-canary.txt', 'candidate only');
assert.equal(readFileSync('/mnt/workspace/node_modules/marker.txt', 'utf8'), 'read-only dependency');
assert.throws(() => writeFileSync('/mnt/workspace/node_modules/marker.txt', 'changed'));
`
    );
    writeFileSync(
      path.join(source, 'bin/run-install-validation.mjs'),
      `import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
assert.equal(existsSync('/mnt/workspace/node_modules/marker.txt'), false);
assert.equal(process.env.CI, 'true');
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.GITHUB_EVENT_NAME, 'pull_request');
assert.match(process.env.GITHUB_SHA, /^[a-f0-9]{40}$/u);
assert.equal(process.env.VALIDATION_CANDIDATE_SHA, process.env.GITHUB_SHA);
assert.equal(process.env.GITHUB_RUN_ID, '4242');
assert.equal(process.env.GITHUB_RUN_ATTEMPT, '1');
assert.equal(process.env.GITHUB_REPOSITORY, 'snapetech-org/QuestarrNG');
assert.equal(process.env.GITHUB_WORKFLOW, 'CI');
assert.equal(process.env.GITHUB_JOB, 'test');
assert.equal(process.env.SECRET_CANARY, undefined);
assert.equal(process.env.NPM_CONFIG_CACHE, '/mnt/run-data/npm-cache');
assert.equal(process.env.NPM_CONFIG_OFFLINE, 'true');
assert.match(readFileSync(path.join(process.env.NPM_CONFIG_CACHE, 'cache-canary.txt'), 'utf8'), /isolated npm cache/u);
execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--offline']);
assert.equal(readFileSync('/mnt/workspace/node_modules/sandbox-install-marker', 'utf8'), 'installed');
assert.equal(execFileSync('npm', ['--version'], { encoding: 'utf8' }), 'trusted npm runtime\\n');
mkdirSync('/mnt/workspace/coverage', { recursive: true });
writeFileSync('/mnt/workspace/coverage/summary.json', '{"total":true}');
writeFileSync('/mnt/workspace/test-report.junit.xml', '<testsuites/>');
writeFileSync(process.env.VALIDATION_RECEIPT_EXPORT, JSON.stringify({ status: 'passed' }));
`
    );
    writeFileSync(
      path.join(source, 'bin/run-linked-report.mjs'),
      `import { symlinkSync } from 'node:fs';
symlinkSync('/etc', '/mnt/workspace/coverage');
`
    );
    execFileSync('git', ['init', '--quiet', '--initial-branch=main'], {
      cwd: source,
    });
    execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: source });
    execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], {
      cwd: source,
    });
    execFileSync('git', ['add', '--all'], { cwd: source });
    execFileSync('git', ['commit', '--quiet', '-m', 'Fixture'], {
      cwd: source,
    });
    const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: source,
      encoding: 'utf8',
    }).trim();
    writeFileSync(path.join(source, '.gitignore'), '*\n');
    mkdirSync(path.join(source, 'nested/config'), { recursive: true });
    writeFileSync(
      path.join(source, 'nested/config/operator.json'),
      '{"private":true}\n'
    );
    const missingCommandResult = spawnSync(launcherNode, [launcher, source], {
      encoding: 'utf8',
      env: { ...process.env, RUNNER_TEMP: parent },
      timeout: 30_000,
    });
    assert.equal(missingCommandResult.status, 1);
    assert.match(missingCommandResult.stderr, /Pass a candidate test command after --/u);

    const linkedCacheResult = spawnSync(
      launcherNode,
      [
        launcher,
        source,
        '--npm-cache',
        invalidNpmCache,
        '--trusted-npm-runtime',
        trustedNpmRuntime,
        '--install-dependencies',
        '--',
        '/bin/true',
      ],
      { encoding: 'utf8', timeout: 30_000 }
    );
    assert.equal(linkedCacheResult.status, 1);
    assert.match(linkedCacheResult.stderr, /cannot contain symbolic links/u);

    const npmResult = spawnSync(
      launcherNode,
      [launcher, source, '--trusted-npm-runtime', trustedNpmRuntime, '--', 'npm', '--version'],
      {
        encoding: 'utf8',
        timeout: 30_000,
      }
    );
    assert.equal(npmResult.error, undefined, npmResult.error?.message);
    assert.equal(npmResult.status, 0, `${npmResult.stdout ?? ''}${npmResult.stderr ?? ''}`);
    assert.equal(npmResult.stdout, 'trusted npm runtime\n');

    const isolatedInstallResult = spawnSync(
      launcherNode,
      [
        launcher,
        source,
        '--npm-cache',
        npmCache,
        '--trusted-npm-runtime',
        trustedNpmRuntime,
        '--github-actions-context',
        '--install-dependencies',
        '--receipt-output',
        installReceiptOutput,
        '--reports-output',
        reportsOutput,
        '--',
        launcherNode,
        'bin/run-install-validation.mjs',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CI: 'true',
          GITHUB_ACTIONS: 'true',
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_REPOSITORY: 'snapetech-org/QuestarrNG',
          GITHUB_SHA: sourceSha,
          GITHUB_RUN_ID: '4242',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_WORKFLOW: 'CI',
          GITHUB_JOB: 'test',
          RUNNER_TEMP: parent,
        },
        timeout: 30_000,
      }
    );
    assert.equal(isolatedInstallResult.error, undefined, isolatedInstallResult.error?.message);
    assert.equal(
      isolatedInstallResult.status,
      0,
      `${isolatedInstallResult.stdout ?? ''}${isolatedInstallResult.stderr ?? ''}`
    );
    assert.equal(
      readFileSync(path.join(reportsOutput, 'coverage', 'summary.json'), 'utf8'),
      '{"total":true}'
    );
    assert.equal(
      readFileSync(path.join(reportsOutput, 'test-report.junit.xml'), 'utf8'),
      '<testsuites/>'
    );
    assert.deepEqual(
      JSON.parse(readFileSync(installReceiptOutput, 'utf8')),
      { status: 'passed' }
    );
    assert.equal(existsSync(path.join(source, 'node_modules/sandbox-install-marker')), false);

    const mismatchedShaResult = spawnSync(
      launcherNode,
      [launcher, source, '--github-actions-context', '--', '/bin/true'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_ACTIONS: 'true',
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_REPOSITORY: 'snapetech-org/QuestarrNG',
          GITHUB_RUN_ID: '4242',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_WORKFLOW: 'CI',
          GITHUB_JOB: 'test',
          GITHUB_SHA: 'f'.repeat(40),
          RUNNER_TEMP: parent,
        },
        timeout: 30_000,
      }
    );
    assert.equal(mismatchedShaResult.status, 1);
    assert.match(mismatchedShaResult.stderr, /source checkout does not match GITHUB_SHA/u);

    const linkedReportsResult = spawnSync(
      launcherNode,
      [
        launcher,
        source,
        '--reports-output',
        linkedReportsOutput,
        '--',
        launcherNode,
        'bin/run-linked-report.mjs',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, RUNNER_TEMP: parent },
        timeout: 30_000,
      }
    );
    assert.equal(linkedReportsResult.status, 1);
    assert.match(linkedReportsResult.stderr, /cannot contain symbolic links/u);
    assert.equal(existsSync(path.join(linkedReportsOutput, 'coverage')), false);

    if (systemNode) {
      const systemRuntimeResult = spawnSync(
        systemNode,
        [launcher, source, '--', systemNode, '--version'],
        { encoding: 'utf8', timeout: 30_000 }
      );
      assert.equal(systemRuntimeResult.error, undefined, systemRuntimeResult.error?.message);
      assert.equal(
        systemRuntimeResult.status,
        0,
        `${systemRuntimeResult.stdout ?? ''}${systemRuntimeResult.stderr ?? ''}`
      );
    }

    const result = spawnSync(
      launcherNode,
      [
        launcher,
        source,
        '--playwright-cache',
        browserCache,
        '--receipt-output',
        receiptOutput,
        '--',
        launcherNode,
        'bin/run-local-validation.mjs',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          SECRET_CANARY: 'must-not-be-inherited',
          RUNNER_TEMP: parent,
        },
        timeout: 30_000,
      }
    );
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(
      result.status,
      0,
      `${result.stdout ?? ''}${result.stderr ?? ''}`
    );
    assert.equal(readFileSync(hostFile, 'utf8'), 'host canary stays unchanged');
    assert.equal(existsSync(candidateWrite), false);
    assert.equal(readFileSync(path.join(npmCache, 'cache-canary.txt'), 'utf8'), 'isolated npm cache');
    assert.equal(existsSync(path.join(npmCache, 'candidate-cache-write.txt')), false);
    assert.deepEqual(JSON.parse(readFileSync(receiptOutput, 'utf8')), { status: 'passed' });
    assert.equal(statSync(receiptOutput).mode & 0o777, 0o600);

    const unusedCacheResult = spawnSync(
      launcherNode,
      [launcher, source, '--npm-cache', npmCache, '--', '/bin/true'],
      { encoding: 'utf8', timeout: 30_000 }
    );
    assert.equal(unusedCacheResult.status, 1);
    assert.match(unusedCacheResult.stderr, /--npm-cache requires --install-dependencies/u);

    const existingReceiptResult = spawnSync(
      launcherNode,
      [launcher, source, '--receipt-output', receiptOutput, '--', '/bin/true'],
      {
        encoding: 'utf8',
        env: { ...process.env, RUNNER_TEMP: parent },
        timeout: 30_000,
      }
    );
    assert.equal(existingReceiptResult.status, 1);
    assert.match(existingReceiptResult.stderr, /must not already exist/u);

    const outsideReceiptResult = spawnSync(
      launcherNode,
      [launcher, source, '--receipt-output', outsideReceipt, '--', '/bin/true'],
      {
        encoding: 'utf8',
        env: { ...process.env, RUNNER_TEMP: parent },
        timeout: 30_000,
      }
    );
    assert.equal(outsideReceiptResult.status, 1);
    assert.match(outsideReceiptResult.stderr, /must be below RUNNER_TEMP/u);

    const candidateReceiptResult = spawnSync(
      launcherNode,
      [
        launcher,
        source,
        '--receipt-output',
        path.join(source, 'receipt.json'),
        '--',
        '/bin/true',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, RUNNER_TEMP: parent },
        timeout: 30_000,
      }
    );
    assert.equal(candidateReceiptResult.status, 1);
    assert.match(candidateReceiptResult.stderr, /cannot write inside the candidate checkout/u);

    const linkedRunnerTempResult = spawnSync(
      launcherNode,
      [
        launcher,
        source,
        '--receipt-output',
        path.join(linkedRunnerTemp, 'linked-receipt.json'),
        '--',
        '/bin/true',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, RUNNER_TEMP: linkedRunnerTemp },
        timeout: 30_000,
      }
    );
    assert.equal(linkedRunnerTempResult.status, 1);
    assert.match(linkedRunnerTempResult.stderr, /RUNNER_TEMP must be a directory/u);

    rmSync(path.join(source, 'web/src/lib/token.js'));
    const deletedFileResult = spawnSync(
      launcherNode,
      [
        launcher,
        source,
        '--',
        launcherNode,
        '-e',
        `import assert from 'node:assert/strict'; import { existsSync } from 'node:fs'; assert.equal(existsSync('/mnt/workspace/web/src/lib/token.js'), false);`,
      ],
      { encoding: 'utf8', timeout: 30_000 }
    );
    assert.equal(deletedFileResult.error, undefined, deletedFileResult.error?.message);
    assert.equal(
      deletedFileResult.status,
      0,
      `${deletedFileResult.stdout ?? ''}${deletedFileResult.stderr ?? ''}`
    );

    rmSync(path.join(source, 'node_modules'), { recursive: true, force: true });
    symlinkSync(outsideDependencies, path.join(source, 'node_modules'), 'dir');
    const linkedDependencyResult = spawnSync(
      launcherNode,
      [launcher, source, '--', launcherNode, '-e', 'process.exit(99)'],
      { encoding: 'utf8', timeout: 30_000 }
    );
    assert.equal(linkedDependencyResult.error, undefined);
    assert.equal(linkedDependencyResult.status, 1);
    assert.match(
      linkedDependencyResult.stderr,
      /Root node_modules must be a real directory/u
    );
  }
);

test(
  'trusted mode installs with trusted npm and runs the base validator against the exact isolated snapshot',
  { skip: !sandboxAvailable && 'bubblewrap user namespaces are unavailable' },
  (t) => {
    const parent = mkdtempSync(path.join(tmpdir(), 'trusted-pr-launcher-'));
    const launcherNode = createDedicatedNodeRuntime(parent);
    const candidateRoot = path.join(parent, 'candidate');
    const trustedRoot = path.join(parent, 'trusted');
    const gitTemplate = path.join(parent, 'git-template');
    const runnerTemp = path.join(parent, 'runner-temp');
    const receiptOutput = path.join(runnerTemp, 'receipts', 'test.json');
    const trustedLauncher = path.join(
      trustedRoot,
      'scripts/validation-engine/trusted-test-launcher.mjs'
    );
    const trustedPolicy = path.join(
      trustedRoot,
      'scripts/validation-engine/trusted-test-sandbox-policy.mjs'
    );
    const trustedSourcePolicy = path.join(
      trustedRoot,
      'scripts/validation-engine/trusted-test-source-policy.mjs'
    );
    const npmCli = path.join(
      trustedRoot,
      '.github/npm-runtime/node_modules/.questarr-npm-cli/bin/npm-cli.mjs'
    );
    const baseValidator = path.join(
      trustedRoot,
      'scripts/validate-development.mjs'
    );
    const outsideCandidateSecret = path.join(candidateRoot, '.env');
    const sandboxPolicy = fileURLToPath(
      new URL('./trusted-test-sandbox-policy.mjs', import.meta.url)
    );
    const sourcePolicy = fileURLToPath(
      new URL('./trusted-test-source-policy.mjs', import.meta.url)
    );
    const hostResolvConf = readFileSync('/etc/resolv.conf', 'utf8');
    t.after(() => rmSync(parent, { recursive: true, force: true }));
    mkdirSync(candidateRoot, { recursive: true });
    mkdirSync(path.dirname(trustedLauncher), { recursive: true });
    mkdirSync(path.dirname(npmCli), { recursive: true });
    mkdirSync(runnerTemp, { recursive: true });
    mkdirSync(gitTemplate);

    writeFileSync(
      path.join(candidateRoot, 'package.json'),
      JSON.stringify({ name: 'candidate' })
    );
    writeFileSync(
      path.join(candidateRoot, 'package-lock.json'),
      JSON.stringify({
        name: 'candidate',
        lockfileVersion: 3,
        requires: true,
        packages: { '': { name: 'candidate' } },
      })
    );
    writeFileSync(outsideCandidateSecret, 'CANDIDATE_SECRET_CANARY=private\n');
    mkdirSync(path.join(candidateRoot, 'src'));
    writeFileSync(
      path.join(candidateRoot, 'src/app.js'),
      'export const candidate = true;\n'
    );

    writeFileSync(trustedLauncher, launcherSource);
    writeFileSync(trustedPolicy, readFileSync(sandboxPolicy, 'utf8'));
    writeFileSync(trustedSourcePolicy, readFileSync(sourcePolicy, 'utf8'));
    writeFileSync(npmCli, [
      "import assert from 'node:assert/strict';",
      "import { readFileSync, writeFileSync } from 'node:fs';",
      "assert.equal(process.argv[2], 'ci');",
      "assert.ok(process.argv.includes('--ignore-scripts=true'));",
      "assert.equal(process.env.NPM_CONFIG_IGNORE_SCRIPTS, 'true');",
      "assert.equal(process.env.NPM_CONFIG_REGISTRY, 'https://registry.npmjs.org/');",
      "assert.notEqual(process.env.NPM_CONFIG_USERCONFIG, process.env.NPM_CONFIG_GLOBALCONFIG);",
      "assert.equal(process.env.NPM_CONFIG_OFFLINE, undefined);",
      "assert.equal(readFileSync('/etc/hosts', 'utf8'), '127.0.0.1 localhost\\n::1 localhost ip6-localhost\\n');",
      "assert.equal(readFileSync('/etc/nsswitch.conf', 'utf8'), 'hosts: files dns\\n');",
      "assert.equal(readFileSync('/etc/resolv.conf', 'utf8'), readFileSync('/mnt/trusted-validation/scripts/expected-host-resolv.conf', 'utf8'));",
      "writeFileSync('/mnt/run-data/npm-prefetch.json', JSON.stringify({ args: process.argv.slice(2), registry: process.env.NPM_CONFIG_REGISTRY, userConfig: process.env.NPM_CONFIG_USERCONFIG, globalConfig: process.env.NPM_CONFIG_GLOBALCONFIG, dnsConfigPresent: true }));",
    ].join('\n'));
    writeFileSync(baseValidator, [
      "import assert from 'node:assert/strict';",
      "import { spawnSync } from 'node:child_process';",
      "import { existsSync, readFileSync, writeFileSync } from 'node:fs';",
      "assert.equal(process.argv[2], '--root');",
      "assert.equal(process.argv[3], '/mnt/workspace');",
      "assert.equal(process.argv[4], '--tests-only');",
      "assert.equal(process.env.GITHUB_EVENT_NAME, 'pull_request_target');",
      "assert.match(process.env.GITHUB_SHA, /^[a-f0-9]{40}$/u);",
      "assert.equal(process.env.VALIDATION_CANDIDATE_SHA, process.env.GITHUB_SHA);",
      "assert.match(process.env.VALIDATION_TRUSTED_BASE_SHA, /^[a-f0-9]{40}$/u);",
      "assert.equal(process.env.GITHUB_RUN_ID, 'trusted-run-42');",
      "assert.equal(process.env.GITHUB_RUN_ATTEMPT, '2');",
      "assert.equal(process.env.GITHUB_REPOSITORY, 'snapetech-org/QuestarrNG');",
      "assert.equal(process.env.GITHUB_WORKFLOW, 'Trusted PR validation');",
      "assert.equal(process.env.GITHUB_JOB, 'trusted-pr-validation');",
      "assert.equal(existsSync('/mnt/run-data/workspace/.git'), false, 'run data must not alias the candidate Git metadata');",
      "const gitConfigWrite = spawnSync('git', ['config', '--local', 'diff.external', '/bin/true'], { cwd: '/mnt/workspace', encoding: 'utf8' });",
      "assert.notEqual(gitConfigWrite.status, 0, 'candidate tasks cannot change synthetic Git metadata');",
      'assert.equal(process.env.GITHUB_TOKEN, undefined);',
      'assert.equal(process.env.SECRET_CANARY, undefined);',
      "assert.equal(readFileSync('/etc/resolv.conf', 'utf8'), '# External DNS is unavailable in the validation sandbox.\\n');",
      "const prefetch = JSON.parse(readFileSync('/mnt/run-data/npm-prefetch.json', 'utf8'));",
      "assert.ok(prefetch.args.includes('--ignore-scripts=true'));",
      "assert.equal(prefetch.registry, 'https://registry.npmjs.org/');",
      "assert.equal(prefetch.globalConfig, '/dev/null');",
      "assert.equal(existsSync('/mnt/trusted-validation/scripts/validate-development.mjs'), true);",
      "assert.equal(readFileSync('/mnt/workspace/src/app.js', 'utf8'), 'export const candidate = true;\\n');",
      "assert.equal(existsSync('/mnt/workspace/.env'), false);",
      "const outsideCandidateSecretPath = JSON.parse(readFileSync('/mnt/trusted-validation/scripts/outside-candidate-secret-path.json', 'utf8'));",
      "assert.throws(() => readFileSync(outsideCandidateSecretPath, 'utf8'), { code: 'ENOENT' });",
      "assert.equal(existsSync('/mnt/workspace/node_modules'), false);",
      "assert.equal(process.env.RUNNER_TEMP, '/mnt/run-data/validation-output');",
      "assert.equal(process.env.VALIDATION_RECEIPT_EXPORT, '/mnt/run-data/validation-output/test.json');",
      'writeFileSync(process.env.VALIDATION_RECEIPT_EXPORT, JSON.stringify({ marker: "trusted-base-validator", candidateSha: process.env.GITHUB_SHA, baseSha: process.env.VALIDATION_TRUSTED_BASE_SHA, prefetch }));',
    ].join('\n'));
    writeFileSync(
      path.join(trustedRoot, 'scripts/outside-candidate-secret-path.json'),
      JSON.stringify(outsideCandidateSecret)
    );
    writeFileSync(path.join(trustedRoot, 'scripts/expected-host-resolv.conf'), hostResolvConf);

    const commitFixture = (root) => {
      const env = {
        PATH: process.env.PATH,
        HOME: root,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TEMPLATE_DIR: gitTemplate,
        GIT_TERMINAL_PROMPT: '0',
      };
      const git = (args) => execFileSync('git', args, { cwd: root, env });
      git(['init', '--quiet', '--initial-branch=main']);
      git(['config', 'user.name', 'Trusted launcher contract']);
      git(['config', 'user.email', 'trusted-launcher@example.invalid']);
      git(['add', '--all']);
      git(['commit', '--quiet', '-m', 'Fixture']);
      return execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        env,
        encoding: 'utf8',
      }).trim();
    };
    const baseSha = commitFixture(trustedRoot);
    const candidateSha = commitFixture(candidateRoot);
    const launch = spawnSync(
      launcherNode,
      [
        trustedLauncher,
        candidateRoot,
        '--trusted-root', trustedRoot,
        '--trusted-base-sha', baseSha,
        '--candidate-sha', candidateSha,
        '--trusted-npm-cli', npmCli,
        '--install-dependencies',
        '--receipt-output', receiptOutput,
        '--',
        'node', '/mnt/trusted-validation/scripts/validate-development.mjs',
        '--root', '/mnt/workspace', '--tests-only',
      ],
      {
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          ...process.env,
          RUNNER_TEMP: runnerTemp,
          GITHUB_EVENT_NAME: 'pull_request_target',
          GITHUB_RUN_ID: 'trusted-run-42',
          GITHUB_RUN_ATTEMPT: '2',
          GITHUB_REPOSITORY: 'snapetech-org/QuestarrNG',
          GITHUB_WORKFLOW: 'Trusted PR validation',
          GITHUB_JOB: 'trusted-pr-validation',
          SECRET_CANARY: 'must-not-enter-sandbox',
        },
      }
    );
    assert.equal(launch.error, undefined, launch.error?.message);
    assert.equal(launch.status, 0, `${launch.stdout ?? ''}${launch.stderr ?? ''}`);
    const receipt = JSON.parse(readFileSync(receiptOutput, 'utf8'));
    assert.deepEqual(receipt, {
      marker: 'trusted-base-validator',
      candidateSha,
      baseSha,
      prefetch: {
        args: [
          'ci',
          '--ignore-scripts=true',
          '--no-audit',
          '--no-fund',
          '--strict-ssl=true',
          '--registry=https://registry.npmjs.org/',
          '--userconfig=/mnt/run-data/npm-install-home/user.npmrc',
          '--globalconfig=/dev/null',
          '--cache=/mnt/run-data/npm-cache-seed',
        ],
        registry: 'https://registry.npmjs.org/',
        userConfig: '/mnt/run-data/npm-install-home/user.npmrc',
        globalConfig: '/dev/null',
        dnsConfigPresent: true,
      },
    });
    assert.equal(statSync(receiptOutput).mode & 0o777, 0o600);
    assert.equal(existsSync(path.join(candidateRoot, 'node_modules')), false);
  }
);

test('sandbox masks candidate checkouts outside the standard host paths', () => {
  assert.ok(hostPathsToHide('/projects/QuestarrNG').includes('/projects'));
  assert.ok(hostPathsToHide('/QuestarrNG').includes('/QuestarrNG'));
  assert.equal(
    hostPathsToHide('/home/keith/QuestarrNG').includes('/home/keith'),
    false
  );
  assert.throws(() => hostPathsToHide('/'), /cannot be the filesystem root/u);
});

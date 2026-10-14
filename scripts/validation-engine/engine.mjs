#!/usr/bin/env node
// Copyright (c) QuestarrNG contributors. All rights reserved.
import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import { clearInterval, clearTimeout, setInterval, setTimeout } from 'node:timers';
import {
  accessSync,
  chmodSync,
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  readlinkSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ENGINE_VERSION = 1;
const ENGINE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(ENGINE_DIR, '..', '..');
const MAX_BUFFER = 8 * 1024 * 1024;
const MAX_FAILURE_DIAGNOSTIC_BYTES = 16 * 1024;
const PROGRESS_INTERVAL_MS = 60_000;
const IGNORED_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  'node_modules',
  'obj',
  'dist',
  'target',
  'coverage',
  '_output',
  '_tests',
  'TestResults',
]);
const INHERITED_ENVIRONMENT_KEYS = new Set([
  'ASDF_DATA_DIR', 'ASDF_DIR', 'COMSPEC', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'MISE_DATA_DIR', 'MISE_HOME', 'NVM_DIR', 'PATH', 'PATHEXT',
  'VOLTA_HOME', 'SYSTEMROOT', 'TZ', 'WINDIR',
]);
const APPROVED_TASK_PASS_ENVIRONMENT = new Map();
APPROVED_TASK_PASS_ENVIRONMENT.set(
  'install-dependencies',
  new Set(['NPM_CONFIG_CACHE', 'NPM_CONFIG_OFFLINE'])
);

function fail(message) {
  throw new Error(message);
}

export function acquireRunLock(root, repository) {
  const workspaceKey = hash(path.resolve(root)).slice(0, 16);
  const lockPath = path.join(os.tmpdir(), repository + '-validation-' + workspaceKey + '.lock');
  const lock = { pid: process.pid, startedAt: new Date().toISOString(), workspaceKey };
  const contents = JSON.stringify(lock) + '\n';
  let descriptor;
  try {
    descriptor = openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let existing;
    try {
      existing = JSON.parse(readFileSync(lockPath, 'utf8'));
    } catch {
      fail('A validation lock exists but cannot be read safely: ' + lockPath);
    }
    let alive = false;
    if (Number.isInteger(existing.pid) && existing.pid > 0) {
      try {
        process.kill(existing.pid, 0);
        alive = true;
      } catch (probeError) {
        alive = probeError.code === 'EPERM';
      }
    }
    fail(alive
      ? 'Another validation engine run is active for this workspace (pid ' + existing.pid + ').'
      : 'A stale validation lock exists for this workspace. Confirm its process is gone, then remove ' + lockPath + '.');
  }
  writeFileSync(descriptor, contents, { encoding: 'utf8' });
  closeSync(descriptor);
  return { lockPath, contents };
}

export function releaseRunLock(lock) {
  try {
    if (readFileSync(lock.lockPath, 'utf8') === lock.contents) unlinkSync(lock.lockPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ':' + stable(value[key])
    ).join(',') + '}';
  }
  return JSON.stringify(value);
}

function git(root, args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'buffer',
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    fail('Unable to bind validation to Git source: ' +
      (result.error?.message ?? result.stderr?.toString('utf8').trim() ?? 'git failed'));
  }
  return result.stdout;
}

function gitText(root, args) {
  return git(root, args).toString('utf8').trim();
}

export function globRegex(glob) {
  let result = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === '*' && glob[index + 1] === '*') {
      index += 1;
      if (glob[index + 1] === '/') {
        index += 1;
        result += '(?:.*/)?';
      } else {
        result += '.*';
      }
    } else if (character === '*') {
      result += '[^/]*';
    } else if (character === '?') {
      result += '[^/]';
    } else {
      result += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(result + '$');
}

function walk(root, relative = '') {
  const directory = path.join(root, relative);
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = relative ? relative + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) {
      files.push({ path: child, symlink: true });
    } else if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) files.push(...walk(root, child));
    } else if (entry.isFile()) {
      files.push({ path: child, symlink: false });
    }
  }
  return files;
}

function fileDigest(root, relative) {
  const filePath = path.join(root, relative);
  const info = lstatSync(filePath);
  if (info.isSymbolicLink() || !info.isFile()) {
    fail('Validation inventory contains a non-regular file: ' + relative);
  }
  return hash(readFileSync(filePath));
}

export function discoverInventory(root, rules) {
  const files = walk(root);
  const entriesByPath = new Map();
  const laneCounts = {};
  for (const rule of rules) {
    const pattern = globRegex(rule.glob);
    const matches = files.filter(({ path: name }) => pattern.test(name));
    if (rule.required !== false && matches.length === 0) {
      fail('Required test inventory is empty: ' + rule.id);
    }
    laneCounts[rule.id] = matches.length;
    for (const match of matches) {
      if (match.symlink) fail('Symlink in test discovery scope: ' + match.path);
      if (entriesByPath.has(match.path)) {
        fail('Test file has duplicate ownership: ' + match.path);
      }
      entriesByPath.set(match.path, {
        file: match.path,
        framework: rule.framework,
        owner: rule.owner,
        lane: rule.id,
        sha256: fileDigest(root, match.path),
      });
    }
  }
  return {
    entries: [...entriesByPath.values()].sort((left, right) =>
      left.file.localeCompare(right.file)
    ),
    laneCounts,
  };
}

function untrackedDigests(root) {
  const raw = git(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  const paths = raw.toString('utf8').split('\0').filter(Boolean).sort();
  return paths.map((relative) => {
    const fullPath = path.join(root, relative);
    const info = lstatSync(fullPath);
    if (info.isSymbolicLink()) {
      return { file: relative, sha256: hash('symlink:' + readlinkSync(fullPath)) };
    }
    if (!info.isFile()) return { file: relative, sha256: 'not-regular' };
    return { file: relative, sha256: fileDigest(root, relative) };
  });
}

export function captureCandidate(root, inputs, inventory) {
  const snapshotCommit = gitText(root, ['rev-parse', 'HEAD']);
  const commit = process.env.VALIDATION_CANDIDATE_SHA ?? snapshotCommit;
  if (!/^[a-f0-9]{40}$/.test(commit)) {
    fail('Trusted candidate source identity must be a full Git commit SHA.');
  }
  const tree = gitText(root, ['rev-parse', 'HEAD^{tree}']);
  const diffSha256 = hash(git(root, [
    '-c', 'diff.external=',
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    '--binary',
    'HEAD',
  ]));
  const untracked = untrackedDigests(root);
  const inputDigests = inputs.map((relative) => ({
    file: relative,
    sha256: fileDigest(root, relative),
  }));
  const inventorySha256 = hash(stable(inventory.entries));
  const sourceSha256 = hash(stable({
    commit,
    tree,
    diffSha256,
    untracked,
    inputDigests,
    inventorySha256,
  }));
  const status = gitText(root, ['status', '--porcelain=v1', '--untracked-files=all']);
  return {
    commit,
    snapshotCommit,
    tree,
    sourceSha256,
    inventorySha256,
    inputDigests,
    dirty: status.length > 0,
    untrackedCount: untracked.length,
  };
}

function commandAvailable(command) {
  const executable = (file) => {
    try {
      accessSync(file, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };
  if (path.isAbsolute(command)) {
    return executable(command);
  }
  const candidates = (process.env.PATH ?? '').split(path.delimiter);
  return candidates.some((directory) => {
    const file = path.join(directory, command);
    return executable(file) || (process.platform === 'win32' &&
      ['.exe', '.cmd', '.bat'].some((extension) => executable(file + extension)));
  });
}

function sanitizedEnvironment(inherited = process.env) {
  const values = new Map();
  for (const [key, value] of Object.entries(inherited)) {
    const normalized = key.toUpperCase();
    if (!INHERITED_ENVIRONMENT_KEYS.has(normalized) || typeof value !== 'string') continue;
    if (!values.has(normalized) || key === normalized) values.set(normalized, value);
  }
  return Object.fromEntries(values);
}

function preserveVersionManagerDataDirectories(env, inherited) {
  const originalHome = inherited.HOME || inherited.USERPROFILE;
  if (!env.ASDF_DATA_DIR && originalHome) {
    const defaultAsdfDataDir = path.join(originalHome, '.asdf');
    env.ASDF_DATA_DIR = existsSync(defaultAsdfDataDir)
      ? defaultAsdfDataDir
      : (env.ASDF_DIR || defaultAsdfDataDir);
  }
  if (!env.MISE_DATA_DIR) {
    const originalDataHome = inherited.XDG_DATA_HOME || (
      process.platform === 'win32'
        ? inherited.LOCALAPPDATA || (originalHome && path.join(originalHome, 'AppData', 'Local'))
        : (originalHome && path.join(originalHome, '.local', 'share'))
    );
    if (originalDataHome) env.MISE_DATA_DIR = path.join(originalDataHome, 'mise');
  }
  return env;
}

export function runtimeProbeDirectory(root = process.platform === 'win32'
  ? path.join(process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows', 'Temp')
  : '/tmp') {
  // Runtime probes must not trust TMPDIR/TMP/TEMP from the invoking process.
  // The Linux sandbox exposes its own private /tmp here; on Windows use the
  // OS temp directory instead of the caller-selected temporary path. Resolve
  // trusted aliases such as macOS's /tmp before requiring a real directory.
  const resolvedRoot = realpathSync(root);
  const metadata = lstatSync(resolvedRoot);
  if (!metadata.isDirectory())
    fail('The trusted runtime probe temporary root is not a directory: ' + root);
  return mkdtempSync(path.join(resolvedRoot, 'questarr-runtime-probe-'));
}

function inspectRuntime(runtime) {
  const available = commandAvailable(runtime.command);
  if (!available) return { ...runtime, available, version: null, exitCode: null };
  const probeHome = runtimeProbeDirectory();
  const userConfig = path.join(probeHome, 'user.npmrc');
  const globalConfig = path.join(probeHome, 'global.npmrc');
  writeFileSync(userConfig, '', { mode: 0o600 });
  writeFileSync(globalConfig, '', { mode: 0o600 });
  let result;
  try {
    const env = preserveVersionManagerDataDirectories(
      sanitizedEnvironment(),
      process.env
    );
    Object.assign(env, {
      HOME: probeHome,
      USERPROFILE: probeHome,
      NPM_CONFIG_USERCONFIG: userConfig,
      NPM_CONFIG_GLOBALCONFIG: globalConfig,
    });
    result = spawnSync(runtime.command, runtime.args ?? ['--version'], {
      cwd: probeHome,
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      env,
    });
  } finally {
    rmSync(probeHome, { recursive: true, force: true });
  }
  const version = (result.stdout ?? '') + (result.stderr ?? '');
  const versionLine = version.trim().split(/\r?\n/, 1)[0] ?? '';
  const versionCompatible = !runtime.versionPattern ||
    new RegExp(runtime.versionPattern).test(versionLine);
  return {
    ...runtime,
    available: !result.error && result.status === 0,
    version: versionLine,
    versionCompatible,
    required: runtime.required !== false,
    exitCode: result.status,
    error: result.error?.message,
  };
}

function validateConfig(config) {
  if (!config || typeof config.repository !== 'string' || !config.repository) {
    fail('Validation config must declare a repository identifier.');
  }
  if (!Array.isArray(config.inventory) || !Array.isArray(config.tasks)) {
    fail('Validation config must declare inventory rules and native tasks.');
  }
  const maxConcurrentTasks = config.maxConcurrentTasks ?? 1;
  if (!Number.isInteger(maxConcurrentTasks) || maxConcurrentTasks < 1 || maxConcurrentTasks > 8) {
    fail('Validation maxConcurrentTasks must be an integer from 1 through 8.');
  }
  const ids = new Set();
  for (const task of config.tasks) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(task.id) || ids.has(task.id)) {
      fail('Task IDs must be unique lowercase identifiers: ' + task.id);
    }
    ids.add(task.id);
    if (!Array.isArray(task.command) || task.command.length === 0) {
      fail('Task must use a registered native command array: ' + task.id);
    }
    if (typeof (task.stage ?? 'default') !== 'string' || !(task.stage ?? 'default').trim() ||
        typeof (task.concurrencyGroup ?? task.id) !== 'string' || !(task.concurrencyGroup ?? task.id).trim()) {
      fail('Task stage and concurrency group must be nonempty strings: ' + task.id);
    }
    if (task.kind === 'test' && (!task.casePattern || task.minimumCases < 1)) {
      fail('Test tasks must require active-case evidence: ' + task.id);
    }
    if (!Array.isArray(task.passEnv ?? [])) {
      fail('Explicitly inherited environment variables must be listed by task: ' + task.id);
    }
    if ((task.passEnv ?? []).some((name) => typeof name !== 'string' ||
        !APPROVED_TASK_PASS_ENVIRONMENT.get(task.id)?.has(name))) {
      fail('Task requests an unapproved inherited environment variable: ' + task.id);
    }
  }
  const laneIds = new Set(config.inventory.map((rule) => rule.id));
  const ownedLanes = new Set();
  for (const task of config.tasks) {
    for (const lane of task.inventoryLanes ?? []) {
      if (!laneIds.has(lane)) fail('Task references an unknown inventory lane: ' + task.id + '/' + lane);
      ownedLanes.add(lane);
    }
  }
  for (const rule of config.inventory) {
    if (rule.required !== false && !ownedLanes.has(rule.id)) {
      fail('Required test inventory has no registered native task: ' + rule.id);
    }
  }
  if (!Array.isArray(config.requiredCommands ?? [])) {
    fail('Required commands must be declared as an array.');
  }
  for (const runtime of config.runtimes ?? []) {
    if (!runtime || typeof runtime.command !== 'string' || !runtime.command ||
        !Array.isArray(runtime.args ?? [])) {
      fail('Runtime declarations require an executable and an argument array.');
    }
  }
  for (const task of config.tasks) {
    for (const dependency of task.dependsOn ?? []) {
      if (!ids.has(dependency)) fail('Unknown task dependency: ' + dependency);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) fail('Validation task dependency cycle includes: ' + id);
    if (visited.has(id)) return;
    visiting.add(id);
    const task = config.tasks.find((item) => item.id === id);
    for (const dependency of task.dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of config.tasks) visit(task.id);
}

export function createPlan(root, config, options = {}) {
  validateConfig(config);
  const inventory = discoverInventory(root, config.inventory);
  const candidate = captureCandidate(root, config.inputs ?? [], inventory);
  const inventoryLaneDigests = Object.fromEntries(config.inventory.map((rule) => [
    rule.id,
    hash(stable(inventory.entries.filter((entry) => entry.lane === rule.id))),
  ]));
  const selectedIds = new Set();
  const addTaskAndDependencies = (id) => {
    const task = config.tasks.find((item) => item.id === id);
    if (!task) fail('Unknown validation task: ' + id);
    if (selectedIds.has(id)) return;
    selectedIds.add(id);
    for (const dependency of task.dependsOn ?? []) addTaskAndDependencies(dependency);
  };
  if (options.task) addTaskAndDependencies(options.task);
  else if (options.testsOnly) {
    for (const task of config.tasks) {
      if (task.kind === 'test' && task.defaultSelected !== false) addTaskAndDependencies(task.id);
    }
  } else {
    for (const task of config.tasks) {
      if (task.defaultSelected !== false) addTaskAndDependencies(task.id);
    }
  }
  if (options.testsOnly && selectedIds.size === 0) fail('No test tasks are registered.');
  const taskById = new Map(config.tasks.map((task) => [task.id, task]));
  const orderedIds = [];
  const orderedSeen = new Set();
  const orderTask = (id) => {
    if (orderedSeen.has(id)) return;
    orderedSeen.add(id);
    for (const dependency of taskById.get(id).dependsOn ?? []) {
      if (selectedIds.has(dependency)) orderTask(dependency);
    }
    orderedIds.push(id);
  };
  for (const task of config.tasks) if (selectedIds.has(task.id)) orderTask(task.id);
  const selectedTasks = orderedIds.map((id) => taskById.get(id));
  const prerequisites = [...new Set([
    ...(config.requiredCommands ?? []),
    ...selectedTasks.map((task) => task.command[0]),
  ])]
    .map((command) => ({ command, available: commandAvailable(command) }));
  const runtimes = (config.runtimes ?? []).map((runtime) => inspectRuntime(runtime));
  const executionContext = {
    executor: process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local',
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    github: process.env.GITHUB_ACTIONS === 'true' ? {
      workflow: process.env.GITHUB_WORKFLOW ?? null,
      job: process.env.GITHUB_JOB ?? null,
      runId: process.env.GITHUB_RUN_ID ?? null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      eventName: process.env.GITHUB_EVENT_NAME ?? null,
      sha: process.env.GITHUB_SHA ?? null,
    } : null,
    trustedBaseSha: process.env.VALIDATION_TRUSTED_BASE_SHA ?? null,
  };
  const plan = {
    schemaVersion: ENGINE_VERSION,
    repository: config.repository,
    selection: options.task ? 'task:' + options.task : options.testsOnly ? 'tests-only' : 'full',
    maxConcurrentTasks: config.maxConcurrentTasks ?? 1,
    candidate,
    inventory: inventory.entries,
    inventoryCounts: inventory.laneCounts,
    inventoryLaneDigests,
    prerequisites,
    runtimes,
    executionContext,
    tasks: [...selectedTasks, ...config.tasks.filter((task) => !selectedIds.has(task.id))].map((task) => ({
      id: task.id,
      name: task.name,
      stage: task.stage ?? 'default',
      concurrencyGroup: task.concurrencyGroup ?? task.id,
      kind: task.kind,
      required: task.required !== false,
      selected: selectedIds.has(task.id),
      exclusionReason: task.exclusionReason ?? null,
      dependsOn: task.dependsOn ?? [],
      timeoutSeconds: task.timeoutSeconds ?? 3600,
      command: task.command,
      cwd: task.cwd ?? '.',
      casePattern: task.casePattern ?? null,
      minimumCases: task.minimumCases ?? null,
      envKeys: [...new Set([
        ...Object.keys(task.env ?? {}),
        ...(task.passEnv ?? []),
      ])].sort(),
      inventoryLanes: task.inventoryLanes ?? [],
    })),
  };
  plan.planSha256 = hash(stable(plan));
  return plan;
}

export function isolatedTaskEnvironment(task, runRoot, inherited = process.env) {
  if (typeof task?.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(task.id)) {
    fail('Validation task ID must be a safe lowercase identifier.');
  }
  const env = sanitizedEnvironment(inherited);
  const approvedPassEnv = APPROVED_TASK_PASS_ENVIRONMENT.get(task.id) ?? new Set();
  const passEnv = task.passEnv ?? [];
  if (!Array.isArray(passEnv) || passEnv.some((name) =>
    typeof name !== 'string' || !approvedPassEnv.has(name))) {
    fail('Task requests an unapproved inherited environment variable: ' + task.id);
  }
  for (const name of passEnv) {
    const match = Object.entries(inherited).find(([key]) => key.toUpperCase() === name.toUpperCase());
    if (match && typeof match[1] === 'string') env[name] = match[1];
  }
  for (const [key, value] of Object.entries(task.env ?? {})) {
    if (typeof value === 'string') env[key] = value;
  }

  // Keep version-manager shims pointed at their host installs after HOME is isolated.
  preserveVersionManagerDataDirectories(env, inherited);
  const environmentRoot = path.join(runRoot, `${task.id}-environment`);
  const directories = {
    HOME: path.join(environmentRoot, 'home'),
    USERPROFILE: path.join(environmentRoot, 'home'),
    TMPDIR: path.join(environmentRoot, 'tmp'),
    TMP: path.join(environmentRoot, 'tmp'),
    TEMP: path.join(environmentRoot, 'tmp'),
    XDG_CONFIG_HOME: path.join(environmentRoot, 'xdg-config'),
    XDG_CACHE_HOME: path.join(environmentRoot, 'xdg-cache'),
    APPDATA: path.join(environmentRoot, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(environmentRoot, 'AppData', 'Local'),
  };
  for (const directory of new Set(Object.values(directories))) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  Object.assign(env, directories, {
    CI: 'true',
    NO_COLOR: '1',
  });
  if (task.kind === 'test') env.NODE_ENV = 'test';
  return env;
}

function formatElapsed(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
}

export function formatValidationProgress(repository, tasks, results, currentTask = null, elapsedMs = 0) {
  const receipts = tasks.map((task) => results.get(task.id)).filter(Boolean);
  const passed = receipts.filter((receipt) => receipt.status === 'passed').length;
  const failed = receipts.filter((receipt) => ['failed', 'incomplete'].includes(receipt.status)).length;
  const blocked = receipts.filter((receipt) => receipt.status === 'blocked').length;
  const notRun = receipts.filter((receipt) => receipt.status === 'not-run').length;
  const completed = passed + failed;
  const pending = Math.max(0, tasks.length - completed - blocked - notRun);
  const activeTasks = currentTask instanceof Map
    ? [...currentTask].map(([id, startedAt]) => {
      const task = tasks.find((item) => item.id === id);
      return `${task?.name ?? id} (${formatElapsed(Date.now() - startedAt)})`;
    })
    : currentTask ? [`${currentTask.name ?? currentTask.id} (${formatElapsed(elapsedMs)})`] : [];
  const active = activeTasks.length ? `; running ${activeTasks.join(', ')}` : '';
  return `[validation] ${repository}: ${completed}/${tasks.length} selected tasks complete (${passed} passed, ${failed} failed, ${blocked} blocked, ${notRun} not-run, ${pending} pending)${active}`;
}

export async function runTaskPool(tasks, {
  maxConcurrentTasks = 1,
  results = new Map(),
  runTask,
  checkSource = () => true,
  onTaskStart = () => {},
  onTaskFinish = () => {},
  onProgress = () => {},
} = {}) {
  if (!Number.isInteger(maxConcurrentTasks) || maxConcurrentTasks < 1 || maxConcurrentTasks > 8) {
    fail('maxConcurrentTasks must be an integer from 1 through 8.');
  }
  if (typeof runTask !== 'function' || typeof checkSource !== 'function') {
    fail('runTask and checkSource must be functions.');
  }

  const pending = [...tasks];
  const selectedIds = new Set(pending.map((task) => task.id));
  const metadata = (task) => ({
    stage: task.stage ?? 'default',
    concurrencyGroup: task.concurrencyGroup ?? task.id,
    dependsOn: task.dependsOn ?? [],
  });
  const block = (task, reason) => results.set(task.id, {
    taskId: task.id,
    ...metadata(task),
    status: 'blocked',
    reason,
    required: task.required !== false,
  });
  let sourceChanged = false;
  const active = new Map();
  const activeGroups = new Set();
  const sourceBoundTasks = new Set();

  const blockPending = (reason) => {
    for (const task of pending.splice(0)) block(task, reason);
    onProgress();
  };

  const invalidateSourceBoundPasses = () => {
    for (const taskId of sourceBoundTasks) {
      const result = results.get(taskId);
      if (result?.status === 'passed') {
        results.set(taskId, {
          ...result,
          status: 'blocked',
          reason: 'candidate source changed during concurrent execution',
        });
      }
    }
  };

  const blockUnavailableDependencies = () => {
    let blockedAny = false;
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const task = pending[index];
      const unavailableDependency = (task.dependsOn ?? []).find((dependency) => {
        const result = results.get(dependency);
        return result ? result.status !== 'passed' : !selectedIds.has(dependency);
      });
      if (!unavailableDependency) continue;
      block(task, 'dependency did not pass');
      pending.splice(index, 1);
      blockedAny = true;
    }
    if (blockedAny) onProgress();
  };

  const startTask = (task) => {
    const group = task.concurrencyGroup ?? task.id;
    const startedAt = Date.now();
    activeGroups.add(group);
    sourceBoundTasks.add(task.id);
    onTaskStart(task, startedAt);
    const promise = (async () => {
      let result;
      try {
        result = await runTask(task);
        if (!result || result.taskId !== task.id ||
            !['passed', 'failed', 'incomplete', 'blocked', 'not-run'].includes(result.status)) {
          throw new Error('task runner returned an invalid receipt');
        }
      } catch (error) {
        result = {
          taskId: task.id,
          status: 'failed',
          error: error.message,
          required: task.required !== false,
        };
      }
      return { task, group, result };
    })();
    active.set(task.id, { task, group, promise });
    onProgress();
  };

  while (pending.length || active.size) {
    blockUnavailableDependencies();

    while (!sourceChanged && active.size < maxConcurrentTasks) {
      const runnableIndex = pending.findIndex((task) =>
        (task.dependsOn ?? []).every((dependency) => results.get(dependency)?.status === 'passed') &&
        !activeGroups.has(task.concurrencyGroup ?? task.id));
      if (runnableIndex < 0) break;

      if (!checkSource()) {
        sourceChanged = true;
        invalidateSourceBoundPasses();
        blockPending('candidate source changed during task execution');
        break;
      }

      const [task] = pending.splice(runnableIndex, 1);
      startTask(task);
    }

    if (active.size === 0) {
      if (pending.length) {
        for (const task of pending.splice(0)) {
          block(task, 'required dependency did not pass or no task is runnable');
        }
        onProgress();
      }
      break;
    }

    const settled = await Promise.race([...active.values()].map(({ promise }) => promise));
    active.delete(settled.task.id);
    activeGroups.delete(settled.group);
    results.set(settled.task.id, { ...settled.result, ...metadata(settled.task) });
    onTaskFinish(settled.task, results.get(settled.task.id));
    onProgress();

    if (sourceChanged) {
      invalidateSourceBoundPasses();
      onProgress();
    } else if (!checkSource()) {
      sourceChanged = true;
      invalidateSourceBoundPasses();
      blockPending('candidate source changed during task execution');
    } else if (active.size === 0) {
      // Every task in this concurrent wave completed against the same source.
      sourceBoundTasks.clear();
    }
  }
  return { results, sourceChanged };
}

function terminate(child) {
  if (child.pid && process.platform !== 'win32') {
    try {
      process.kill(-child.pid, 'SIGTERM');
      return;
    } catch {
      // The process group may exit between the child status check and this signal.
    }
  }
  child.kill('SIGTERM');
}

function failureDiagnostic(output, outputBytes) {
  const buffer = Buffer.from(output, 'utf8');
  const truncated = outputBytes > MAX_FAILURE_DIAGNOSTIC_BYTES;
  let excerpt = buffer.subarray(-MAX_FAILURE_DIAGNOSTIC_BYTES).toString('utf8');
  if (truncated) {
    const firstNewline = excerpt.indexOf('\n');
    if (firstNewline >= 0) excerpt = excerpt.slice(firstNewline + 1);
  }
  excerpt = excerpt
    .replace(/\r\n?/gu, '\n')
    // eslint-disable-next-line no-control-regex -- strip terminal controls from untrusted test output.
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/gu, '')
    .trimEnd();
  let formatted = excerpt
    ? excerpt.split('\n').map((line) => '| ' + line).join('\n')
    : '';
  let outputTruncated = truncated;
  while (Buffer.byteLength(formatted, 'utf8') > MAX_FAILURE_DIAGNOSTIC_BYTES) {
    outputTruncated = true;
    const firstNewline = formatted.indexOf('\n');
    if (firstNewline >= 0) {
      formatted = formatted.slice(firstNewline + 1);
      continue;
    }
    let line = formatted.startsWith('| ') ? formatted.slice(2) : formatted;
    line = Buffer.from(line, 'utf8')
      .subarray(-(MAX_FAILURE_DIAGNOSTIC_BYTES - 2))
      .toString('utf8');
    while (Buffer.byteLength(line, 'utf8') > MAX_FAILURE_DIAGNOSTIC_BYTES - 2)
      line = line.slice(1);
    formatted = '| ' + line;
  }
  return { output: formatted, outputBytes, truncated: outputTruncated };
}

export async function runCommand(task, root, logPath, onFailure) {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const command = task.command[0];
  const args = task.command.slice(1);
  const cwd = path.resolve(root, task.cwd ?? '.');
  if (cwd !== root && !cwd.startsWith(root + path.sep)) {
    fail('Task working directory escapes the repository: ' + task.id);
  }
  const timeout = task.timeoutSeconds ?? 3600;
  let stdout = '';
  let stderr = '';
  let outputBytes = 0;
  let timedOut = false;
  const child = spawn(command, args, {
    cwd,
    env: isolatedTaskEnvironment(task, path.dirname(logPath)),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    windowsHide: true,
  });
  const append = (chunk, target) => {
    outputBytes += chunk.length;
    target.value += chunk.toString('utf8');
    if (target.value.length > MAX_BUFFER) target.value = target.value.slice(-MAX_BUFFER);
  };
  const out = { value: stdout };
  const err = { value: stderr };
  child.stdout.on('data', (chunk) => append(chunk, out));
  child.stderr.on('data', (chunk) => append(chunk, err));
  const timer = setTimeout(() => {
    timedOut = true;
    terminate(child);
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        if (child.pid && process.platform !== 'win32') {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            // The process group may exit between the child status check and this signal.
          }
        } else {
          child.kill('SIGKILL');
        }
      }
    }, 2000).unref();
  }, timeout * 1000);
  const exit = await new Promise((resolve) => {
    child.once('error', (error) => resolve({ code: null, signal: null, error }));
    child.once('close', (code, signal) => resolve({ code, signal, error: null }));
  }).finally(() => clearTimeout(timer));
  stdout = out.value;
  stderr = err.value;
  const combined = stdout + (stdout && stderr ? '\n' : '') + stderr;
  const logBuffer = Buffer.from(combined);
  writeFileSync(logPath, logBuffer, { mode: 0o600 });
  const casePattern = task.casePattern ? new RegExp(task.casePattern, 'g') : null;
  let activeCases = null;
  if (casePattern) {
    activeCases = 0;
    for (const match of combined.matchAll(casePattern)) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) activeCases += parsed;
    }
  }
  const status = timedOut || exit.error || exit.code !== 0
    ? 'failed'
    : task.kind === 'test' && activeCases < task.minimumCases
      ? 'incomplete'
      : 'passed';
  if (task.kind === 'test' && status !== 'passed' && typeof onFailure === 'function') {
    onFailure({
      taskId: task.id,
      status,
      ...failureDiagnostic(combined, outputBytes),
    });
  }
  return {
    taskId: task.id,
    status,
    startedAt,
    durationMs: Date.now() - started,
    exitCode: exit.code,
    signal: exit.signal,
    error: exit.error?.message,
    timedOut,
    outputBytes,
    logSha256: hash(logBuffer),
    logFile: path.basename(logPath),
    activeCases,
    envKeys: [...new Set([
      ...Object.keys(task.env ?? {}),
      ...(task.passEnv ?? []),
    ])].sort(),
    required: task.required !== false,
  };
}

export async function executePlan(root, config, plan, options = {}) {
  const { planSha256, ...planBody } = plan;
  if (plan.repository !== config.repository || !planSha256 || hash(stable(planBody)) !== planSha256) {
    fail('Validation plan digest does not match its contents.');
  }
  const runRoot = options.runRoot ?? mkdtempSync(path.join(os.tmpdir(), config.repository + '-validation-'));
  mkdirSync(runRoot, { recursive: true, mode: 0o700 });
  chmodSync(runRoot, 0o700);
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const receiptById = new Map();
  const selectedIds = new Set(plan.tasks.filter((task) => task.selected).map((task) => task.id));
  for (const task of plan.tasks) {
    if (!task.selected) {
      receiptById.set(task.id, {
        taskId: task.id,
        stage: task.stage,
        concurrencyGroup: task.concurrencyGroup,
        dependsOn: task.dependsOn,
        status: 'excluded',
        reason: task.exclusionReason ?? plan.selection,
        required: task.required,
      });
    }
  }
  const missing = [
    ...plan.prerequisites.filter((item) => !item.available),
    ...(plan.runtimes ?? []).filter((item) => item.required !== false &&
      (!item.available || !item.versionCompatible)),
    ...(plan.executionContext?.executor === 'github-actions' &&
      plan.executionContext.github?.sha !== plan.candidate.commit
      ? [{ command: 'GITHUB_SHA', available: false, expected: plan.candidate.commit,
        actual: plan.executionContext.github?.sha ?? null }]
      : []),
  ];
  if (missing.length > 0) {
    const receipt = {
      schemaVersion: ENGINE_VERSION,
      runId,
      startedAt,
      completedAt: new Date().toISOString(),
      planSha256: plan.planSha256,
      candidate: plan.candidate,
      executionContext: plan.executionContext,
      maxConcurrentTasks: plan.maxConcurrentTasks,
      status: 'incomplete',
      prerequisites: missing,
      tasks: plan.tasks.map((task) => task.selected ? ({
        taskId: task.id,
        stage: task.stage,
        concurrencyGroup: task.concurrencyGroup,
        dependsOn: task.dependsOn,
        status: 'not-run',
        reason: 'required command is unavailable',
        required: task.required,
      }) : receiptById.get(task.id)),
      totals: { planned: selectedIds.size, executed: 0, passed: 0, failed: 0, blocked: 0, excluded: plan.tasks.length - selectedIds.size, activeCases: 0 },
    };
    writeFileSync(path.join(runRoot, 'receipt.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 });
    options.onProgress?.(formatValidationProgress(
      config.repository,
      plan.tasks.filter((task) => task.selected),
      new Map(receipt.tasks.map((task) => [task.taskId, task])),
    ));
    return { receipt, runRoot, exitCode: 1 };
  }

  let sourceChanged;
  const selectedTasks = plan.tasks.filter((item) => item.selected);
  const runningTasks = new Map();
  let lastProgressSummary = null;
  const reportProgress = () => {
    if (typeof options.onProgress !== 'function') return;
    const summary = formatValidationProgress(
      config.repository,
      selectedTasks,
      receiptById,
      runningTasks,
    );
    if (summary === lastProgressSummary) return;
    lastProgressSummary = summary;
    options.onProgress(summary);
  };
  const heartbeat = setInterval(
    reportProgress,
    options.progressIntervalMs ?? PROGRESS_INTERVAL_MS,
  );
  heartbeat.unref();
  try {
    const pool = await runTaskPool(selectedTasks, {
      maxConcurrentTasks: plan.maxConcurrentTasks,
      results: receiptById,
      checkSource: () => captureCandidate(root, config.inputs ?? [], {
        entries: plan.inventory,
      }).sourceSha256 === plan.candidate.sourceSha256,
      runTask: async (task) => {
        const configuredTask = config.tasks.find((item) => item.id === task.id);
        if (!configuredTask) fail('Selected task is missing from the registered configuration: ' + task.id);
        let taskReceipt;
        try {
          taskReceipt = await runCommand(
            configuredTask,
            root,
            path.join(runRoot, task.id + '.log'),
            options.onTaskFailure,
          );
        } finally {
          rmSync(path.join(runRoot, `${task.id}-environment`), { recursive: true, force: true });
        }
        taskReceipt.inventory = (configuredTask.inventoryLanes ?? []).map((lane) => ({
          lane,
          discoveredFiles: plan.inventoryCounts[lane] ?? 0,
          inventorySha256: plan.inventoryLaneDigests[lane],
        }));
        return taskReceipt;
      },
      onTaskStart: (task, startedAt) => runningTasks.set(task.id, startedAt),
      onTaskFinish: (task) => runningTasks.delete(task.id),
      onProgress: reportProgress,
    });
    sourceChanged = pool.sourceChanged;
  } finally {
    clearInterval(heartbeat);
  }
  for (const task of plan.tasks) {
    if (!receiptById.has(task.id)) {
      receiptById.set(task.id, {
        taskId: task.id,
        stage: task.stage,
        concurrencyGroup: task.concurrencyGroup,
        dependsOn: task.dependsOn,
        status: sourceChanged ? 'blocked' : 'excluded',
        reason: sourceChanged ? 'candidate source changed during execution' : 'not selected',
        required: task.required,
      });
    }
  }
  const tasks = plan.tasks.map((task) => ({
    ...receiptById.get(task.id),
    stage: task.stage,
    concurrencyGroup: task.concurrencyGroup,
    dependsOn: task.dependsOn,
  }));
  const totals = {
    planned: selectedIds.size,
    executed: tasks.filter((task) => task.startedAt).length,
    passed: tasks.filter((task) => task.status === 'passed').length,
    failed: tasks.filter((task) => task.status === 'failed' || task.status === 'incomplete').length,
    blocked: tasks.filter((task) => task.status === 'blocked').length,
    excluded: tasks.filter((task) => task.status === 'excluded').length,
    activeCases: tasks.reduce((sum, task) => sum + (task.activeCases ?? 0), 0),
  };
  const status = sourceChanged || missing.length > 0 ||
    plan.tasks.some((task) => task.selected && task.required !== false && receiptById.get(task.id)?.status !== 'passed')
    ? 'failed'
    : 'passed';
  const receipt = {
    schemaVersion: ENGINE_VERSION,
    repository: config.repository,
    selection: plan.selection,
    runId,
    startedAt,
    completedAt: new Date().toISOString(),
    planSha256: plan.planSha256,
    candidate: plan.candidate,
    inventoryCounts: plan.inventoryCounts,
    inventoryLaneDigests: plan.inventoryLaneDigests,
    executionContext: plan.executionContext,
    status,
    maxConcurrentTasks: plan.maxConcurrentTasks,
    prerequisites: plan.prerequisites,
    runtimes: plan.runtimes,
    tasks,
    totals,
  };
  writeFileSync(path.join(runRoot, 'receipt.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  reportProgress();
  return { receipt, runRoot, exitCode: status === 'passed' ? 0 : 1 };
}

function help(config) {
  return [
    config.repository + ' validation engine',
    '',
    'Usage:',
    '  node scripts/validate-development.mjs --help',
    '  node scripts/validate-development.mjs --plan [--json]',
    '  node scripts/validate-development.mjs --tests-only',
    '  node scripts/validate-development.mjs',
    '',
    'The plan is read-only. Native test commands and assertions remain authoritative.',
    'Every run binds the current Git source snapshot, executes without test-result reuse,',
    'and writes attempt evidence under the operating system temporary directory.',
  ].join('\n');
}

export async function main(argv = process.argv.slice(2), root = DEFAULT_ROOT, config) {
  const loaded = config ?? (await import(pathToFileURL(path.join(ENGINE_DIR, 'config.mjs')).href)).validation;
  const args = [...argv];
  let rootPath = root;
  const rootIndex = args.indexOf('--root');
  if (rootIndex >= 0) {
    const requestedRoot = args[rootIndex + 1];
    if (!requestedRoot || requestedRoot.startsWith('--') || !path.isAbsolute(requestedRoot))
      fail('--root requires an absolute checkout path.');
    if (process.env.VALIDATION_CANDIDATE_SHA && requestedRoot !== '/mnt/workspace')
      fail('Trusted CI validation must use the isolated candidate workspace.');
    rootPath = realpathSync(requestedRoot);
    if (!lstatSync(rootPath).isDirectory()) fail('--root must name a directory.');
    args.splice(rootIndex, 2);
  }
  if (args.includes('--help')) {
    process.stdout.write(help(loaded) + '\n');
    return 0;
  }
  const planIndex = args.indexOf('--plan');
  const json = args.includes('--json');
  const testsOnly = args.includes('--tests-only');
  let taskId;
  const taskIndex = args.indexOf('--task');
  if (taskIndex >= 0) {
    taskId = args[taskIndex + 1];
    if (!taskId) fail('--task requires a registered task ID.');
  }
  const known = new Set(['--plan', '--json', '--tests-only', '--task']);
  for (let index = 0; index < args.length; index += 1) {
    if (!known.has(args[index])) fail('Unknown option: ' + args[index]);
    if (args[index] === '--task') index += 1;
  }
  if (planIndex >= 0 && testsOnly) fail('--plan and --tests-only cannot be combined.');
  const plan = createPlan(rootPath, loaded, { testsOnly, task: taskId });
  if (planIndex >= 0) {
    process.stdout.write(json
      ? JSON.stringify(plan, null, 2) + '\n'
      : loaded.repository + ': ' + plan.inventory.length + ' test files; ' +
        plan.tasks.length + ' planned tasks; max concurrency ' + plan.maxConcurrentTasks + '; ' +
        plan.prerequisites.filter((item) => item.available).length + '/' +
        plan.prerequisites.length + ' command prerequisites available.\n');
    return 0;
  }
  const lock = acquireRunLock(rootPath, loaded.repository);
  let result;
  try {
    result = await executePlan(rootPath, loaded, plan, {
      onProgress: (summary) => process.stderr.write(summary + '\n'),
      onTaskFailure: ({ taskId, status, output, outputBytes, truncated }) => {
        const retainedBytes = Buffer.byteLength(output, 'utf8');
        process.stderr.write(
          `[validation] ${taskId} ${status}; ${retainedBytes} of ${outputBytes} output bytes retained${truncated ? ' (truncated)' : ''}:\n`
        );
        if (output) process.stderr.write(output + '\n');
      },
    });
  } finally {
    releaseRunLock(lock);
  }
  const receiptExport = process.env.VALIDATION_RECEIPT_EXPORT;
  if (receiptExport) {
    const target = path.resolve(receiptExport);
    const exportRoots = [os.tmpdir(), process.env.RUNNER_TEMP]
      .filter(Boolean)
      .map((directory) => path.resolve(directory));
    if (!exportRoots.some((directory) => target.startsWith(directory + path.sep))) {
      fail('Validation receipts may only be exported beneath the system or runner temporary directory.');
    }
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    const actualParent = realpathSync(path.dirname(target));
    const realRoots = exportRoots.filter((directory) => existsSync(directory)).map((directory) => realpathSync(directory));
    if (!realRoots.some((directory) => actualParent === directory || actualParent.startsWith(directory + path.sep))) {
      fail('Validation receipt export resolves outside the system or runner temporary directory.');
    }
    try {
      if (lstatSync(target).isSymbolicLink()) fail('Validation receipt export cannot replace a symbolic link.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    writeFileSync(target, JSON.stringify(result.receipt, null, 2), { mode: 0o600 });
  }
  process.stdout.write(JSON.stringify({
    repository: loaded.repository,
    status: result.receipt.status,
    planSha256: result.receipt.planSha256,
    totals: result.receipt.totals,
    evidenceDirectory: result.runRoot,
  }, null, 2) + '\n');
  return result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(String(error?.stack ?? error) + '\n');
    process.exitCode = 1;
  });
}

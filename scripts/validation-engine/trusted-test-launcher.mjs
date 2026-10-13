#!/usr/bin/env node
// Copy this file outside the checkout from a reviewed revision before using it
// to execute a candidate tree. It runs no candidate JavaScript until bubblewrap
// has isolated the candidate workspace, home, service sockets, and network.
import { Buffer } from 'node:buffer';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  constants,
  chmodSync,
  closeSync,
  cpSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  rmSync,
  fsyncSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  hostPathsToHide,
  isSensitiveCandidatePath,
  SYSTEM_PATHS_TO_MOUNT,
  sandboxMountOperations,
} from './trusted-test-sandbox-policy.mjs';
import { validateCandidateLockfile } from './trusted-test-source-policy.mjs';

const GUEST_WORKSPACE = '/mnt/workspace';
const GUEST_RUN = '/mnt/run-data';
const GUEST_TRUSTED = '/mnt/trusted-validation';
const GUEST_MARKER = '/run/validation-engine-sandbox';
const GIT = ['/usr/bin/git', '/bin/git'].find(existsSync);
const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;
function isSensitive(relativePath, tracked) {
  const segments = relativePath.replaceAll(String.fromCharCode(92), '/').split('/');
  if (
    !tracked &&
    (segments.includes('config') || /^config\.[^/]+$/iu.test(segments[0]))
  )
    return true;
  return isSensitiveCandidatePath(relativePath);
}

function gitEnvironment(home, template) {
  const env = {};
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'SYSTEMROOT'])
    if (typeof process.env[key] === 'string') env[key] = process.env[key];
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_ATTR_NOSYSTEM: '1',
    GIT_TEMPLATE_DIR: template,
    GIT_TERMINAL_PROMPT: '0',
    HOME: home,
  };
}

function indexedFiles(root, env) {
  const trackedOutput = execFileSync(
    GIT,
    ['-c', 'core.fsmonitor=false', '-C', root, 'ls-files', '--cached', '-z'],
    { encoding: 'buffer', env, maxBuffer: 64 * 1024 * 1024 }
  );
  const files = trackedOutput.toString('utf8').split('\0').filter(Boolean);
  return {
    files: files.sort(),
    tracked: new Set(files),
  };
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function gitText(root, args, env) {
  return execFileSync(GIT, ['-c', 'core.fsmonitor=false', '-C', root, ...args], {
    encoding: 'utf8',
    env,
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function githubActionsEnvironment(sourceRoot) {
  if (process.env.GITHUB_ACTIONS !== 'true') return {};

  const names = [
    'GITHUB_EVENT_NAME',
    'GITHUB_REPOSITORY',
    'GITHUB_RUN_ID',
    'GITHUB_RUN_ATTEMPT',
    'GITHUB_WORKFLOW',
    'GITHUB_JOB',
    'GITHUB_SHA',
  ];
  const context = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  if (names.some((name) => typeof context[name] !== 'string' || context[name] === ''))
    throw new Error('GitHub Actions validation requires complete workflow metadata.');
  if (!COMMIT_PATTERN.test(context.GITHUB_SHA) ||
    !/^\d+$/u.test(context.GITHUB_RUN_ID) ||
    !/^\d+$/u.test(context.GITHUB_RUN_ATTEMPT)) {
    throw new Error('GitHub Actions validation metadata contains an invalid run identity.');
  }

  const gitEnv = gitEnvironment(sourceRoot, sourceRoot);
  const checkoutSha = gitText(
    sourceRoot,
    ['rev-parse', '--verify', 'HEAD^{commit}'],
    gitEnv
  );
  if (checkoutSha !== context.GITHUB_SHA)
    throw new Error('GitHub Actions source checkout does not match GITHUB_SHA.');

  return {
    CI: 'true',
    GITHUB_ACTIONS: 'true',
    ...context,
    VALIDATION_CANDIDATE_SHA: context.GITHUB_SHA,
  };
}

function assertCleanCheckout(root, expectedSha, label, env) {
  if (!COMMIT_PATTERN.test(expectedSha ?? ''))
    throw new Error(`${label} commit must be a full 40-character Git SHA.`);
  const actualSha = gitText(root, ['rev-parse', '--verify', 'HEAD^{commit}'], env);
  if (actualSha !== expectedSha)
    throw new Error(`${label} checkout does not match its expected commit.`);
  const status = gitText(root, ['status', '--porcelain=v1', '--untracked-files=all'], env);
  if (status)
    throw new Error(`${label} checkout must be clean before trusted validation.`);
  return actualSha;
}

function copyCandidateFile(sourceRoot, workspaceRoot, relativePath, tracked) {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/u).includes('..') ||
    isSensitive(relativePath, tracked)
  )
    return;
  const source = path.resolve(sourceRoot, relativePath);
  const target = path.resolve(workspaceRoot, relativePath);
  if (!target.startsWith(`${workspaceRoot}${path.sep}`))
    throw new Error('Candidate file escaped the disposable workspace');

  let ancestor = sourceRoot;
  const components = relativePath.split(/[\\/]/u);
  for (const component of components.slice(0, -1)) {
    ancestor = path.join(ancestor, component);
    let ancestorMetadata;
    try {
      ancestorMetadata = lstatSync(ancestor);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (ancestorMetadata.isSymbolicLink())
      throw new Error(
        `Candidate source contains a linked parent: ${relativePath}`
      );
  }
  let metadata;
  try {
    metadata = lstatSync(source);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (metadata.isSymbolicLink())
    throw new Error(
      `Candidate source contains a symbolic link: ${relativePath}`
    );
  if (!metadata.isFile())
    throw new Error(`Candidate source is not a regular file: ${relativePath}`);
  mkdirSync(path.dirname(target), { recursive: true });
  try {
    cpSync(source, target, { preserveTimestamps: true });
  } catch (error) {
    if (error.code === 'ENOENT' && !existsSync(source)) {
      rmSync(target, { force: true });
      return;
    }
    throw error;
  }
  chmodSync(target, metadata.mode & 0o777);
}

function createSyntheticGitRepository(workspace, runDirectory) {
  const template = path.join(runDirectory, 'synthetic-git-template');
  mkdirSync(template, { mode: 0o700 });
  const env = gitEnvironment(workspace, template);
  const git = (args) => execFileSync(GIT, ['-C', workspace, ...args], { env });
  git(['init', '--quiet', '--initial-branch=main']);
  git(['config', 'user.name', 'Disposable Validation']);
  git(['config', 'user.email', 'validation@example.invalid']);
  git(['config', 'core.hooksPath', '/dev/null']);
  git(['add', '--force', '--all']);
  git([
    'commit',
    '--quiet',
    '--no-verify',
    '-m',
    'Disposable validation snapshot',
  ]);
}

function copyNpmCache(source, destination) {
  const rootMetadata = lstatSync(source);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory())
    throw new Error('The npm cache must be a real directory.');
  mkdirSync(destination, { mode: 0o700 });

  const copyDirectory = (sourceDirectory, destinationDirectory) => {
    for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
      const sourcePath = path.join(sourceDirectory, entry.name);
      const destinationPath = path.join(destinationDirectory, entry.name);
      const metadata = lstatSync(sourcePath);
      if (metadata.isSymbolicLink())
        throw new Error('The npm cache cannot contain symbolic links.');
      if (metadata.isDirectory()) {
        mkdirSync(destinationPath, { mode: 0o700 });
        copyDirectory(sourcePath, destinationPath);
      } else if (metadata.isFile()) {
        cpSync(sourcePath, destinationPath, { preserveTimestamps: true });
        chmodSync(destinationPath, 0o600);
      } else {
        throw new Error(
          'The npm cache can contain only regular files and directories.'
        );
      }
    }
  };

  copyDirectory(source, destination);
}

function prepareReceiptOutput(requestedOutput, sourceRoot) {
  if (!path.isAbsolute(requestedOutput))
    throw new Error('--receipt-output must be an absolute path.');
  if (!process.env.RUNNER_TEMP)
    throw new Error('--receipt-output requires RUNNER_TEMP.');

  const runnerTempInput = path.resolve(process.env.RUNNER_TEMP);
  const runnerTempMetadata = lstatSync(runnerTempInput);
  if (
    runnerTempMetadata.isSymbolicLink() ||
    !runnerTempMetadata.isDirectory()
  )
    throw new Error('RUNNER_TEMP must be a directory.');
  const runnerTemp = realpathSync(runnerTempInput);
  if (runnerTemp !== runnerTempInput)
    throw new Error('RUNNER_TEMP must resolve to its real directory.');
  const requested = path.resolve(requestedOutput);
  const relativeOutput = path.relative(runnerTemp, requested);
  if (
    relativeOutput === '' ||
    relativeOutput === '..' ||
    relativeOutput.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeOutput)
  )
    throw new Error('--receipt-output must be below RUNNER_TEMP.');

  const output = path.join(runnerTemp, relativeOutput);
  if (isWithin(sourceRoot, output))
    throw new Error('--receipt-output cannot write inside the candidate checkout.');

  const relativeParent = path.relative(runnerTemp, path.dirname(output));
  let parent = runnerTemp;
  for (const component of relativeParent.split(path.sep).filter(Boolean)) {
    parent = path.join(parent, component);
    try {
      mkdirSync(parent, { mode: 0o700 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const metadata = lstatSync(parent);
    if (
      metadata.isSymbolicLink() ||
      !metadata.isDirectory() ||
      !isWithin(runnerTemp, realpathSync(parent))
    )
      throw new Error('--receipt-output parent must remain inside RUNNER_TEMP.');
  }

  try {
    lstatSync(output);
    throw new Error('--receipt-output must not already exist.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return output;
}

function prepareReportsOutput(requestedOutput, sourceRoot) {
  if (!path.isAbsolute(requestedOutput))
    throw new Error('--reports-output must be an absolute path.');
  if (!process.env.RUNNER_TEMP)
    throw new Error('--reports-output requires RUNNER_TEMP.');

  const runnerTempInput = path.resolve(process.env.RUNNER_TEMP);
  const runnerTempMetadata = lstatSync(runnerTempInput);
  if (runnerTempMetadata.isSymbolicLink() || !runnerTempMetadata.isDirectory())
    throw new Error('RUNNER_TEMP must be a directory.');
  const runnerTemp = realpathSync(runnerTempInput);
  if (runnerTemp !== runnerTempInput)
    throw new Error('RUNNER_TEMP must resolve to its real directory.');

  const output = path.resolve(requestedOutput);
  const relativeOutput = path.relative(runnerTemp, output);
  if (
    relativeOutput === '' ||
    relativeOutput === '..' ||
    relativeOutput.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeOutput)
  )
    throw new Error('--reports-output must be below RUNNER_TEMP.');
  if (isWithin(sourceRoot, output))
    throw new Error('--reports-output cannot write inside the candidate checkout.');

  const relativeParent = path.relative(runnerTemp, path.dirname(output));
  let parent = runnerTemp;
  for (const component of relativeParent.split(path.sep).filter(Boolean)) {
    parent = path.join(parent, component);
    try {
      mkdirSync(parent, { mode: 0o700 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const metadata = lstatSync(parent);
    if (
      metadata.isSymbolicLink() ||
      !metadata.isDirectory() ||
      !isWithin(runnerTemp, realpathSync(parent))
    )
      throw new Error('--reports-output parent must remain inside RUNNER_TEMP.');
  }

  try {
    mkdirSync(output, { mode: 0o700 });
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error('--reports-output must name a new directory.', { cause: error });
    throw error;
  }
  const metadata = lstatSync(output);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isDirectory() ||
    !isWithin(runnerTemp, realpathSync(output))
  )
    throw new Error('--reports-output must be a real directory inside RUNNER_TEMP.');
  return output;
}

function exportReceipt(runDirectory, output) {
  const receipt = path.join(runDirectory, 'validation-output', 'test.json');
  const maximumSize = 16 * 1024 * 1024;
  const sourceDescriptor = openSync(receipt, constants.O_RDONLY | constants.O_NOFOLLOW);
  let destinationDescriptor;
  try {
    const sourceMetadata = fstatSync(sourceDescriptor);
    if (
      !sourceMetadata.isFile() ||
      sourceMetadata.size > maximumSize
    )
      throw new Error(
        'The sandbox did not produce a regular validation receipt within the size limit.'
      );
    const buffer = Buffer.allocUnsafe(maximumSize + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const count = readSync(
        sourceDescriptor,
        buffer,
        bytesRead,
        buffer.length - bytesRead,
        null
      );
      if (count === 0) break;
      bytesRead += count;
    }
    if (bytesRead > maximumSize || fstatSync(sourceDescriptor).size > maximumSize)
      throw new Error('The sandbox validation receipt exceeds the size limit.');
    if (!fstatSync(sourceDescriptor).isFile())
      throw new Error('The sandbox validation receipt is not a regular file.');
    const contents = buffer.subarray(0, bytesRead);
    destinationDescriptor = openSync(
      output,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600
    );
    writeFileSync(destinationDescriptor, contents);
    fsyncSync(destinationDescriptor);
  } finally {
    closeSync(sourceDescriptor);
    if (destinationDescriptor !== undefined) closeSync(destinationDescriptor);
  }
}

function exportTestReports(workspace, output) {
  const maximumFiles = 10_000;
  const maximumBytes = 256 * 1024 * 1024;
  const state = { files: 0, bytes: 0 };

  const copyEntry = (source, destination) => {
    const metadata = lstatSync(source);
    if (metadata.isSymbolicLink())
      throw new Error('Test reports cannot contain symbolic links.');
    if (metadata.isDirectory()) {
      mkdirSync(destination, { mode: 0o700 });
      for (const entry of readdirSync(source, { withFileTypes: true })) {
        const childSource = path.join(source, entry.name);
        const childDestination = path.join(destination, entry.name);
        if (!isWithin(output, path.resolve(childDestination)))
          throw new Error('Test report path escaped its export directory.');
        copyEntry(childSource, childDestination);
      }
      return;
    }
    if (!metadata.isFile())
      throw new Error('Test reports may contain only regular files and directories.');
    state.files += 1;
    if (state.files > maximumFiles || metadata.size > maximumBytes - state.bytes)
      throw new Error('Test report output exceeds its size limits.');

    const sourceDescriptor = openSync(source, constants.O_RDONLY | constants.O_NOFOLLOW);
    let destinationDescriptor;
    try {
      const sourceMetadata = fstatSync(sourceDescriptor);
      if (!sourceMetadata.isFile() || sourceMetadata.size > maximumBytes - state.bytes)
        throw new Error('Test report changed while it was being exported.');
      const contents = readFileSync(sourceDescriptor);
      const afterReadMetadata = fstatSync(sourceDescriptor);
      if (!afterReadMetadata.isFile() || afterReadMetadata.size !== contents.length ||
        contents.length > maximumBytes - state.bytes) {
        throw new Error('Test report changed while it was being exported.');
      }
      destinationDescriptor = openSync(
        destination,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600
      );
      writeFileSync(destinationDescriptor, contents);
      fsyncSync(destinationDescriptor);
      state.bytes += contents.length;
    } finally {
      closeSync(sourceDescriptor);
      if (destinationDescriptor !== undefined) closeSync(destinationDescriptor);
    }
  };

  for (const relative of ['coverage', 'test-report.junit.xml']) {
    const source = path.join(workspace, relative);
    let metadata;
    try {
      metadata = lstatSync(source);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (metadata.isSymbolicLink())
      throw new Error('Test reports cannot contain symbolic links.');
    if (relative === 'coverage' && !metadata.isDirectory())
      throw new Error('Coverage output must be a directory.');
    if (relative !== 'coverage' && !metadata.isFile())
      throw new Error('JUnit output must be a regular file.');
    copyEntry(source, path.join(output, relative));
  }
}

function linkDependencies(sourceRoot, workspace, installDependencies) {
  if (installDependencies) return [];
  const absolute = path.join(sourceRoot, 'node_modules');
  let metadata;
  try {
    metadata = lstatSync(absolute);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory())
    throw new Error('Root node_modules must be a real directory, not a symbolic link.');
  const dependency = realpathSync(absolute);
  if (!isWithin(sourceRoot, dependency) || !lstatSync(dependency).isDirectory())
    throw new Error('Root node_modules must remain inside the candidate checkout.');
  mkdirSync(path.join(workspace, 'node_modules'), { mode: 0o700 });
  return [{ relative: 'node_modules', source: dependency }];
}

function bubblewrapPath() {
  for (const candidate of ['/usr/bin/bwrap', '/bin/bwrap'])
    if (existsSync(candidate)) return candidate;
  throw new Error('bubblewrap is required; candidate code was not started.');
}

function makeSandboxCommand({
  sourceRoot,
  workspace,
  runDirectory,
  dependencies,
  playwrightCache,
  npmCache,
  trustedNpmRuntime,
  githubActionsContext,
  receiptOutput,
  trustedRoot,
  candidateSha,
  trustedBaseSha,
  npmDependencyPrewarm = false,
  networkAccess = false,
  targetCommand,
}) {
  if (networkAccess !== npmDependencyPrewarm)
    throw new Error('Network access is reserved for dependency prewarming.');
  if (process.platform !== 'linux')
    throw new Error(
      'The trusted local test launcher requires Linux bubblewrap.'
    );
  const runtimePath = realpathSync(process.execPath);
  const runtimeDirectory = path.dirname(runtimePath);
  if (path.basename(runtimeDirectory) !== 'bin')
    throw new Error('The Node runtime must be inside a dedicated bin directory.');
  const runtimeRoot = path.dirname(runtimeDirectory);
  const systemRuntime = runtimeRoot === '/usr';
  const runtimeRootSegments = runtimeRoot.split(path.sep).filter(Boolean);
  const hasVersionedNodeName = runtimeRootSegments.some((segment) =>
    /^node(?:js)?[-_]v?\d+(?:[.].*)?$/iu.test(segment)
  );
  const hasNodeManagerAndVersion =
    runtimeRootSegments.some((segment) => /^node(?:js)?$/iu.test(segment)) &&
    runtimeRootSegments.some((segment) => /^v?\d+\.\d+\.\d+(?:[-+].*)?$/u.test(segment));
  if (!systemRuntime && !hasVersionedNodeName && !hasNodeManagerAndVersion)
    throw new Error('The Node runtime must be inside a dedicated installation directory.');
  const runtimeRelativePath = path.relative(runtimeRoot, runtimePath);
  if (
    path.isAbsolute(runtimeRelativePath) ||
    runtimeRelativePath === '..' ||
    runtimeRelativePath.startsWith(`..${path.sep}`)
  )
    throw new Error('The Node runtime must be contained by its installation directory.');
  const systemMounts = SYSTEM_PATHS_TO_MOUNT.filter((directory) => existsSync(directory)).map(
    (directory) => [realpathSync(directory), directory]
  );
  if (networkAccess && !existsSync('/etc/resolv.conf'))
    throw new Error('Network-enabled dependency prefetch requires host DNS configuration.');
  const externalRoots = [];
  let playwrightCacheIndex = -1;
  if (playwrightCache) {
    playwrightCacheIndex = externalRoots.indexOf(playwrightCache);
    if (playwrightCacheIndex === -1) {
      playwrightCacheIndex = externalRoots.length;
      externalRoots.push(playwrightCache);
    }
  }
  let trustedNpmRuntimeIndex = -1;
  if (trustedNpmRuntime) {
    trustedNpmRuntimeIndex = externalRoots.indexOf(trustedNpmRuntime);
    if (trustedNpmRuntimeIndex === -1) {
      trustedNpmRuntimeIndex = externalRoots.length;
      externalRoots.push(trustedNpmRuntime);
    }
  }
  let runtimeIndex = -1;
  if (!systemRuntime) {
    runtimeIndex = externalRoots.indexOf(runtimeRoot);
    if (runtimeIndex === -1) {
      runtimeIndex = externalRoots.length;
      externalRoots.push(runtimeRoot);
    }
  }
  const mounts = externalRoots.map((source, index) => [
    realpathSync(source),
    `${GUEST_RUN}/dependencies/${index}${index === trustedNpmRuntimeIndex ? '/node_modules' : ''}`,
  ]);
  const trustedMount = trustedRoot
    ? [realpathSync(trustedRoot), GUEST_TRUSTED]
    : undefined;
  const externalMounts = trustedMount ? [...mounts, trustedMount] : mounts;
  const dependencyMounts = dependencies.map(({ relative, source }) => [
    realpathSync(source),
    path.posix.join(GUEST_WORKSPACE, relative.split(path.sep).join('/')),
  ]);
  mkdirSync(path.join(runDirectory, 'dependencies'), { recursive: true });
  for (let index = 0; index < mounts.length; index++) {
    mkdirSync(path.join(runDirectory, 'dependencies', String(index)), {
      recursive: true,
      mode: 0o700,
    });
    if (index === trustedNpmRuntimeIndex)
      mkdirSync(path.join(runDirectory, 'dependencies', String(index), 'node_modules'), {
        recursive: true,
        mode: 0o700,
      });
  }

  const runtimeGuest = systemRuntime ? undefined : mounts[runtimeIndex][1];
  const runtimeRelativePosix = runtimeRelativePath.split(path.sep).join('/');
  const runtimeExecutable = systemRuntime
    ? runtimePath
    : path.posix.join(runtimeGuest, runtimeRelativePosix);
  const runtimeBin = systemRuntime
    ? runtimeDirectory
    : path.posix.join(runtimeGuest, path.posix.dirname(runtimeRelativePosix));
  const npmRuntimeBin = trustedRoot
    ? `${GUEST_TRUSTED}/.github/npm-runtime/node_modules/.bin`
    : trustedNpmRuntimeIndex !== -1
      ? path.posix.join(mounts[trustedNpmRuntimeIndex][1], '.bin')
      : `${GUEST_WORKSPACE}/.github/npm-runtime/node_modules/.bin`;
  const markerToken = randomBytes(32).toString('hex');
  const markerFile = path.join(runDirectory, `sandbox-marker-${markerToken}`);
  writeFileSync(markerFile, markerToken, { mode: 0o600, flag: 'wx' });
  const sandboxHostsFile = path.join(runDirectory, `sandbox-hosts-${markerToken}`);
  writeFileSync(
    sandboxHostsFile,
    '127.0.0.1 localhost\n::1 localhost ip6-localhost\n',
    { mode: 0o444, flag: 'wx' }
  );
  const sandboxResolvFile = path.join(runDirectory, `sandbox-resolv-${markerToken}.conf`);
  writeFileSync(
    sandboxResolvFile,
    '# External DNS is unavailable in the validation sandbox.\n',
    { mode: 0o444, flag: 'wx' }
  );
  const sandboxNsswitchFile = path.join(runDirectory, `sandbox-nsswitch-${markerToken}.conf`);
  writeFileSync(sandboxNsswitchFile, 'hosts: files dns\n', { mode: 0o444, flag: 'wx' });
  const networkConfigFiles = [
    { source: sandboxHostsFile, target: '/etc/hosts' },
    { source: sandboxNsswitchFile, target: '/etc/nsswitch.conf' },
    {
      source: networkAccess ? realpathSync('/etc/resolv.conf') : sandboxResolvFile,
      target: '/etc/resolv.conf',
    },
  ];

  const env = {
    PATH: `${npmRuntimeBin}:${runtimeBin}:/usr/bin:/bin:/usr/sbin:/sbin`,
    NODE_ENV: 'test',
    HOME: `${GUEST_RUN}/home`,
    USERPROFILE: `${GUEST_RUN}/home`,
    DOTNET_CLI_HOME: `${GUEST_RUN}/dotnet-cli`,
    TMPDIR: '/tmp',
    TMP: '/tmp',
    TEMP: '/tmp',
    APPDATA: `${GUEST_RUN}/AppData/Roaming`,
    LOCALAPPDATA: `${GUEST_RUN}/AppData/Local`,
    XDG_CONFIG_HOME: `${GUEST_RUN}/xdg-config`,
    XDG_CACHE_HOME: `${GUEST_RUN}/xdg-cache`,
    CONFIG_DIRECTORY: `${GUEST_RUN}/config`,
    VALIDATION_OUTER_SANDBOX_TOKEN: markerToken,
  };
  if (npmCache)
    env.NPM_CONFIG_CACHE = `${GUEST_RUN}/${path.basename(npmCache)}`;
  if (npmDependencyPrewarm) {
    env.NPM_CONFIG_USERCONFIG = `${GUEST_RUN}/npm-install-home/user.npmrc`;
    env.NPM_CONFIG_GLOBALCONFIG = '/dev/null';
    env.NPM_CONFIG_REGISTRY = 'https://registry.npmjs.org/';
    env.NPM_CONFIG_STRICT_SSL = 'true';
    env.NPM_CONFIG_IGNORE_SCRIPTS = 'true';
    env.NPM_CONFIG_AUDIT = 'false';
    env.NPM_CONFIG_FUND = 'false';
  } else if (npmCache) {
    env.NPM_CONFIG_OFFLINE = 'true';
    env.NPM_CONFIG_USERCONFIG = '/dev/null';
    env.NPM_CONFIG_GLOBALCONFIG = '/dev/null';
  }
  if (receiptOutput) {
    env.RUNNER_TEMP = `${GUEST_RUN}/validation-output`;
    env.VALIDATION_RECEIPT_EXPORT = `${env.RUNNER_TEMP}/test.json`;
  }
  if (githubActionsContext) {
    if (trustedRoot)
      throw new Error('Do not combine --github-actions-context with --trusted-root.');
    Object.assign(env, githubActionsEnvironment(sourceRoot));
  }
  if (trustedRoot) {
    env.CI = 'true';
    env.GITHUB_ACTIONS = 'true';
    env.GITHUB_EVENT_NAME = 'pull_request_target';
    env.GITHUB_SHA = candidateSha;
    env.GITHUB_RUN_ID = process.env.GITHUB_RUN_ID;
    env.GITHUB_RUN_ATTEMPT = process.env.GITHUB_RUN_ATTEMPT;
    env.GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;
    env.GITHUB_WORKFLOW = process.env.GITHUB_WORKFLOW;
    env.GITHUB_JOB = process.env.GITHUB_JOB;
    env.VALIDATION_CANDIDATE_SHA = candidateSha;
    env.VALIDATION_TRUSTED_BASE_SHA = trustedBaseSha;
  }
  if (playwrightCacheIndex !== -1)
    env.PLAYWRIGHT_BROWSERS_PATH = mounts[playwrightCacheIndex][1];
  for (const key of ['LANG', 'LC_ALL', 'LC_CTYPE', 'TZ'])
    if (typeof process.env[key] === 'string') env[key] = process.env[key];

  const args = [
    '--die-with-parent',
    '--new-session',
    '--unshare-user',
    '--unshare-pid',
    '--unshare-ipc',
    '--unshare-uts',
  ];
  if (!networkAccess) args.push('--unshare-net');
  const hiddenDirectories = hostPathsToHide(sourceRoot)
    .filter((directory) => directory === '/mnt' || existsSync(directory));
  const mountOperations = sandboxMountOperations({
    sourceRoot,
    workspace,
    runDirectory,
    externalMounts,
    dependencyMounts,
    systemMounts,
    networkConfigFiles,
    hiddenDirectories,
    guestWorkspace: GUEST_WORKSPACE,
    guestRun: GUEST_RUN,
    trustedGuest: trustedRoot ? GUEST_TRUSTED : undefined,
    markerFile,
    guestMarker: GUEST_MARKER,
  });
  const commandPath = bubblewrapPath();
  const sourceDescriptors = [];
  try {
    for (const operation of mountOperations) {
      if (operation.type === 'dir') {
        args.push('--dir', operation.path);
      } else if (operation.type === 'tmpfs') {
        args.push('--tmpfs', operation.path);
      } else if (
        operation.type === 'bind-fd' ||
        operation.type === 'ro-bind-fd'
      ) {
        const descriptor = openSync(operation.source, 'r');
        sourceDescriptors.push(descriptor);
        const childDescriptor = sourceDescriptors.length + 2;
        // The inherited fd pins the source even when its host path is masked.
        args.push(
          operation.type === 'bind-fd' ? '--bind' : '--ro-bind',
          '/proc/self/fd/' + childDescriptor,
          operation.target
        );
      } else if (operation.type === 'file-fd') {
        const descriptor = openSync(operation.source, constants.O_RDONLY | constants.O_NOFOLLOW);
        sourceDescriptors.push(descriptor);
        const childDescriptor = sourceDescriptors.length + 2;
        if (!fstatSync(descriptor).isFile())
          throw new Error('Sandbox network configuration source must be a regular file.');
        args.push('--file', String(childDescriptor), operation.target);
      } else {
        throw new Error('Unknown sandbox mount operation: ' + operation.type);
      }
    }
  } catch (error) {
    for (const descriptor of sourceDescriptors) closeSync(descriptor);
    throw error;
  }
  args.push(
    '--proc',
    '/proc',
    '--dev',
    '/dev',
    '--tmpfs',
    '/dev/shm',
  );
  for (const directory of [
    env.HOME,
    env.DOTNET_CLI_HOME,
    env.APPDATA,
    env.LOCALAPPDATA,
    env.XDG_CONFIG_HOME,
    env.XDG_CACHE_HOME,
    env.CONFIG_DIRECTORY,
  ])
    args.push('--dir', directory);
  args.push('--chdir', GUEST_WORKSPACE);
  for (const [name, value] of Object.entries(env))
    args.push('--setenv', name, value);
  const [requestedCommand, ...requestedArgs] = targetCommand;
  const executable =
    requestedCommand === process.execPath
      ? runtimeExecutable
      : requestedCommand;
  args.push('--', executable, ...requestedArgs);
  return { command: commandPath, args, sourceDescriptors };
}

async function executeSandboxed(command, env) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command.command, command.args, {
        env,
        stdio: ['inherit', 'inherit', 'inherit', ...command.sourceDescriptors],
      });
    } catch (error) {
      for (const descriptor of command.sourceDescriptors) closeSync(descriptor);
      reject(error);
      return;
    }
    for (const descriptor of command.sourceDescriptors) closeSync(descriptor);
    const forward = (signal) => child.kill(signal);
    process.once('SIGINT', forward);
    process.once('SIGTERM', forward);
    let spawnError;
    child.once('error', (error) => { spawnError = error; });
    child.once('close', (code, signal) => {
      process.removeListener('SIGINT', forward);
      process.removeListener('SIGTERM', forward);
      if (spawnError) reject(spawnError);
      else if (signal) resolve(128 + (signal === 'SIGINT' ? 2 : 15));
      else resolve(code ?? 1);
    });
  });
}

async function main() {
  if (!GIT) throw new Error('A trusted system Git executable is required.');
  const separator = process.argv.indexOf('--');
  const launcherArguments = process.argv.slice(
    2,
    separator === -1 ? process.argv.length : separator
  );
  const requestedRoot = launcherArguments[0]?.startsWith('--')
    ? process.cwd()
    : launcherArguments.shift() ?? process.cwd();
  let playwrightCache;
  let npmCache;
  let trustedNpmRuntime;
  let receiptOutput;
  let reportsOutput;
  let trustedRoot;
  let candidateSha;
  let trustedBaseSha;
  let npmCli;
  let installDependencies = false;
  let githubActionsContext = false;
  for (let index = 0; index < launcherArguments.length; index += 1) {
    if (launcherArguments[index] === '--github-actions-context') {
      if (githubActionsContext)
        throw new Error('--github-actions-context may only be provided once.');
      githubActionsContext = true;
      continue;
    }
    if (launcherArguments[index] === '--install-dependencies') {
      if (installDependencies)
        throw new Error('--install-dependencies may only be provided once.');
      installDependencies = true;
      continue;
    }
    if (launcherArguments[index] === '--playwright-cache') {
      const requestedCache = launcherArguments[index + 1];
      if (!requestedCache)
        throw new Error('--playwright-cache requires a directory path.');
      if (playwrightCache)
        throw new Error('--playwright-cache may only be provided once.');
      if (lstatSync(requestedCache).isSymbolicLink())
        throw new Error('--playwright-cache cannot be a symbolic link.');
      const cacheStat = lstatSync(requestedCache);
      if (!cacheStat.isDirectory())
        throw new Error('--playwright-cache must name a directory.');
      playwrightCache = realpathSync(requestedCache);
      index += 1;
      continue;
    }
    if (launcherArguments[index] === '--npm-cache') {
      const requestedCache = launcherArguments[index + 1];
      if (!requestedCache)
        throw new Error('--npm-cache requires a directory path.');
      if (npmCache)
        throw new Error('--npm-cache may only be provided once.');
      const cacheMetadata = lstatSync(requestedCache);
      if (cacheMetadata.isSymbolicLink() || !cacheMetadata.isDirectory())
        throw new Error('--npm-cache must name a real directory.');
      npmCache = realpathSync(requestedCache);
      index += 1;
      continue;
    }
    if (launcherArguments[index] === '--trusted-npm-runtime') {
      const requestedRuntime = launcherArguments[index + 1];
      if (!requestedRuntime)
        throw new Error('--trusted-npm-runtime requires a directory path.');
      if (trustedNpmRuntime)
        throw new Error('--trusted-npm-runtime may only be provided once.');
      const metadata = lstatSync(requestedRuntime);
      if (metadata.isSymbolicLink() || !metadata.isDirectory())
        throw new Error('--trusted-npm-runtime must name a real directory.');
      trustedNpmRuntime = realpathSync(requestedRuntime);
      index += 1;
      continue;
    }
    if (launcherArguments[index] === '--receipt-output') {
      const requestedOutput = launcherArguments[index + 1];
      if (!requestedOutput)
        throw new Error('--receipt-output requires a file path.');
      if (receiptOutput)
        throw new Error('--receipt-output may only be provided once.');
      receiptOutput = requestedOutput;
      index += 1;
      continue;
    }
    if (launcherArguments[index] === '--reports-output') {
      const requestedOutput = launcherArguments[index + 1];
      if (!requestedOutput)
        throw new Error('--reports-output requires a directory path.');
      if (reportsOutput)
        throw new Error('--reports-output may only be provided once.');
      reportsOutput = requestedOutput;
      index += 1;
      continue;
    }
    if (launcherArguments[index] === '--trusted-root') {
      const requestedTrustedRoot = launcherArguments[index + 1];
      if (!requestedTrustedRoot)
        throw new Error('--trusted-root requires a checkout path.');
      if (trustedRoot)
        throw new Error('--trusted-root may only be provided once.');
      if (lstatSync(requestedTrustedRoot).isSymbolicLink())
        throw new Error('--trusted-root cannot be a symbolic link.');
      trustedRoot = realpathSync(requestedTrustedRoot);
      index += 1;
      continue;
    }
    if (launcherArguments[index] === '--candidate-sha') {
      candidateSha = launcherArguments[index + 1];
      if (!candidateSha)
        throw new Error('--candidate-sha requires a commit SHA.');
      index += 1;
      continue;
    }
    if (launcherArguments[index] === '--trusted-base-sha') {
      trustedBaseSha = launcherArguments[index + 1];
      if (!trustedBaseSha)
        throw new Error('--trusted-base-sha requires a commit SHA.');
      index += 1;
      continue;
    }
    if (launcherArguments[index] === '--trusted-npm-cli') {
      const requestedCli = launcherArguments[index + 1];
      if (!requestedCli)
        throw new Error('--trusted-npm-cli requires a file path.');
      if (npmCli)
        throw new Error('--trusted-npm-cli may only be provided once.');
      npmCli = requestedCli;
      index += 1;
      continue;
    }
    throw new Error(`Unknown launcher option: ${launcherArguments[index]}`);
  }
  if (separator === -1)
    throw new Error('Pass a candidate test command after --.');
  const targetCommand = process.argv.slice(separator + 1);
  if (targetCommand.length === 0)
    throw new Error('Pass a candidate test command after --.');
  const trustedMode = Boolean(
    trustedRoot || candidateSha || trustedBaseSha || npmCli
  );
  if (trustedMode &&
    !(trustedRoot && candidateSha && trustedBaseSha && npmCli && installDependencies))
    throw new Error('Trusted CI mode requires --trusted-root, --trusted-base-sha, --candidate-sha, --trusted-npm-cli, and --install-dependencies together.');
  if (installDependencies && !trustedRoot && !(npmCache && trustedNpmRuntime))
    throw new Error('--install-dependencies requires --npm-cache and --trusted-npm-runtime.');
  if (npmCache && !installDependencies)
    throw new Error('--npm-cache requires --install-dependencies.');
  const sourceRoot = realpathSync(requestedRoot);
  if (installDependencies) validateCandidateLockfile(sourceRoot);
  if (trustedRoot && (trustedNpmRuntime || npmCache))
    throw new Error('Trusted-root mode manages the npm runtime and cache; do not pass external npm paths.');
  if (githubActionsContext && process.env.GITHUB_ACTIONS !== 'true')
    throw new Error('--github-actions-context requires a GitHub Actions runner.');
  if (githubActionsContext && trustedRoot)
    throw new Error('Do not combine --github-actions-context with --trusted-root.');
  if (trustedRoot && (isWithin(sourceRoot, trustedRoot) || isWithin(trustedRoot, sourceRoot)))
    throw new Error('Trusted and candidate checkouts must be separate sibling trees.');
  if (trustedRoot && !COMMIT_PATTERN.test(candidateSha))
    throw new Error('--candidate-sha must be a full 40-character Git SHA.');
  if (trustedRoot && !COMMIT_PATTERN.test(trustedBaseSha))
    throw new Error('--trusted-base-sha must be a full 40-character Git SHA.');
  if (trustedRoot) {
    if (process.env.GITHUB_EVENT_NAME !== 'pull_request_target' ||
      !process.env.GITHUB_RUN_ID || !process.env.GITHUB_RUN_ATTEMPT ||
      !process.env.GITHUB_REPOSITORY || !process.env.GITHUB_WORKFLOW ||
      !process.env.GITHUB_JOB) {
      throw new Error('Trusted CI mode requires pull_request_target workflow metadata.');
    }
    const launcherPath = realpathSync(fileURLToPath(import.meta.url));
    if (!isWithin(trustedRoot, launcherPath))
      throw new Error('The trusted launcher must run from the trusted checkout.');
    npmCli = realpathSync(npmCli);
    if (!isWithin(trustedRoot, npmCli) || !lstatSync(npmCli).isFile())
      throw new Error('The trusted npm CLI must be a regular file inside the trusted checkout.');
    const expectedCli = `${GUEST_TRUSTED}/scripts/validate-development.mjs`;
    if (targetCommand[0] !== 'node' || targetCommand[1] !== expectedCli ||
      targetCommand[targetCommand.indexOf('--root') + 1] !== GUEST_WORKSPACE) {
      throw new Error('Trusted CI mode must invoke the base validator against the candidate workspace.');
    }
  }
  const requestedRootMetadata = lstatSync(requestedRoot);
  if (requestedRootMetadata.isSymbolicLink() || !requestedRootMetadata.isDirectory())
    throw new Error('Candidate checkout must be a real directory.');
  const receiptOutputPath = receiptOutput
    ? prepareReceiptOutput(receiptOutput, sourceRoot)
    : undefined;
  const reportsOutputPath = reportsOutput
    ? prepareReportsOutput(reportsOutput, sourceRoot)
    : undefined;
  const temporaryRoot = mkdtempSync(
    path.join(tmpdir(), 'trusted-validation-run-')
  );
  const runDirectory = path.join(temporaryRoot, 'run-data');
  const workspace = path.join(temporaryRoot, 'workspace');
  try {
    mkdirSync(runDirectory, { mode: 0o700 });
    mkdirSync(workspace, { mode: 0o700 });
    mkdirSync(path.join(runDirectory, 'validation-output'), { mode: 0o700 });
    const hostTemplate = path.join(runDirectory, 'trusted-git-template');
    const hostEnv = gitEnvironment(sourceRoot, hostTemplate);
    mkdirSync(hostEnv.GIT_TEMPLATE_DIR, { mode: 0o700 });
    if (trustedRoot) {
      assertCleanCheckout(trustedRoot, trustedBaseSha, 'Trusted base', hostEnv);
      assertCleanCheckout(sourceRoot, candidateSha, 'Candidate', hostEnv);
    }
    const candidateFiles = indexedFiles(sourceRoot, hostEnv);
    for (const file of candidateFiles.files)
      copyCandidateFile(
        sourceRoot,
        workspace,
        file,
        candidateFiles.tracked.has(file)
      );
    createSyntheticGitRepository(workspace, runDirectory);
    const dependencies = linkDependencies(sourceRoot, workspace, installDependencies);
    let sandboxNpmCache;
    if (installDependencies) {
      const cacheSeed = path.join(runDirectory, 'npm-cache-seed');
      const cacheSource = npmCache;
      if (cacheSource) copyNpmCache(cacheSource, cacheSeed);
      else mkdirSync(cacheSeed, { mode: 0o700 });

      const installHome = path.join(runDirectory, 'npm-install-home');
      mkdirSync(installHome, { mode: 0o700 });
      writeFileSync(path.join(installHome, 'user.npmrc'), '', { mode: 0o600 });

      const npmInstallArguments = [
        'ci',
        '--ignore-scripts=true',
        '--no-audit',
        '--no-fund',
        '--strict-ssl=true',
        '--registry=https://registry.npmjs.org/',
        `--userconfig=${GUEST_RUN}/npm-install-home/user.npmrc`,
        '--globalconfig=/dev/null',
        `--cache=${GUEST_RUN}/npm-cache-seed`,
      ];
      const npmInstallCommand = trustedRoot
        ? [
            process.execPath,
            `${GUEST_TRUSTED}/${path.relative(trustedRoot, npmCli).split(path.sep).join('/')}`,
            ...npmInstallArguments,
          ]
        : ['npm', ...npmInstallArguments];

      const installCommand = makeSandboxCommand({
        sourceRoot,
        workspace,
        runDirectory,
        dependencies: [],
        playwrightCache,
        npmCache: cacheSeed,
        trustedNpmRuntime,
        githubActionsContext: false,
        receiptOutput: undefined,
        trustedRoot,
        candidateSha,
        trustedBaseSha,
        npmDependencyPrewarm: true,
        networkAccess: true,
        targetCommand: npmInstallCommand,
      });
      const installExitCode = await executeSandboxed(installCommand, {
        PATH: process.env.PATH ?? '',
        ...(typeof process.env.LANG === 'string' ? { LANG: process.env.LANG } : {}),
      });
      if (installExitCode !== 0) return installExitCode;

      sandboxNpmCache = path.join(runDirectory, 'npm-cache');
      copyNpmCache(cacheSeed, sandboxNpmCache);
      rmSync(cacheSeed, { recursive: true, force: true });
      rmSync(installHome, { recursive: true, force: true });
    } else if (npmCache) {
      sandboxNpmCache = path.join(runDirectory, 'npm-cache');
      copyNpmCache(npmCache, sandboxNpmCache);
    }
    const command = makeSandboxCommand({
      sourceRoot,
      workspace,
      runDirectory,
      dependencies,
      playwrightCache,
      npmCache: sandboxNpmCache,
      trustedNpmRuntime,
      githubActionsContext,
      receiptOutput: receiptOutputPath,
      trustedRoot,
      candidateSha,
      trustedBaseSha,
      targetCommand,
    });
    const env = {};
    if (typeof process.env.PATH === 'string') env.PATH = process.env.PATH;
    if (typeof process.env.LANG === 'string') env.LANG = process.env.LANG;
    const exitCode = await executeSandboxed(command, env);
    if (receiptOutputPath) exportReceipt(runDirectory, receiptOutputPath);
    if (reportsOutputPath) exportTestReports(workspace, reportsOutputPath);
    return exitCode;
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`Trusted sandbox launcher failed: ${error.message}\n`);
    process.exitCode = 1;
  });

// The sandbox policy describes Linux paths even when its contract runs on Windows.
import path from 'node:path/posix';

export const HOST_PATHS_TO_HIDE = Object.freeze([
  '/etc',
  '/home',
  '/root',
  '/run',
  '/var',
  '/tmp',
  '/sys',
  '/media',
  '/mnt',
  '/opt',
  '/srv',
  '/usr/local',
  '/workspace',
  '/workspaces',
  '/data',
  '/backup',
  '/backups',
  '/volumes',
  '/secrets',
  '/credentials',
]);

export const SYSTEM_PATHS_TO_MOUNT = Object.freeze([
  '/bin',
  '/sbin',
  '/lib',
  '/lib64',
  '/usr/bin',
  '/usr/sbin',
  '/usr/lib',
  '/usr/lib64',
  '/usr/share/nodejs',
  '/usr/share/zoneinfo',
]);

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

export function hostPathsToHide(sourceRoot) {
  const checkout = path.resolve(sourceRoot);
  const filesystemRoot = path.parse(checkout).root;
  if (checkout === filesystemRoot)
    throw new Error('The candidate checkout cannot be the filesystem root.');

  if (SYSTEM_PATHS_TO_MOUNT.some((directory) => isWithin(checkout, directory)))
    throw new Error(
      'The candidate checkout cannot contain a system runtime mount.'
    );

  if (HOST_PATHS_TO_HIDE.some((directory) => isWithin(directory, checkout)))
    return [...HOST_PATHS_TO_HIDE];

  const parent = path.dirname(checkout);
  const parentOverlapsSystemMount = SYSTEM_PATHS_TO_MOUNT.some(
    (directory) => isWithin(parent, directory) || isWithin(directory, parent)
  );
  return [
    ...HOST_PATHS_TO_HIDE,
    parent === filesystemRoot || parentOverlapsSystemMount ? checkout : parent,
  ];
}

export function sandboxMountOperations({
  sourceRoot,
  workspace,
  runDirectory,
  externalMounts,
  dependencyMounts,
  systemMounts,
  networkConfigFiles = [],
  hiddenDirectories,
  guestWorkspace,
  guestRun,
  trustedGuest,
  markerFile,
  guestMarker,
}) {
  const checkout = path.resolve(sourceRoot);
  const workspaceRoot = path.resolve(workspace);
  const runRoot = path.resolve(runDirectory);
  if (isWithin(runRoot, workspaceRoot) || isWithin(workspaceRoot, runRoot))
    throw new Error(
      'Candidate workspace and sandbox run data must use disjoint host directories.'
    );
  for (const [source] of externalMounts) {
    const externalRoot = path.resolve(source);
    if (isWithin(checkout, externalRoot) || isWithin(externalRoot, checkout))
      throw new Error(
        `External runtime mount source overlaps the candidate checkout: ${source}`
      );
  }
  for (const [source] of systemMounts) {
    for (const directory of hiddenDirectories) {
      if (isWithin(directory, source) || (isWithin(source, directory) && directory !== checkout))
        throw new Error(
          `System runtime mount source overlaps a hidden host path: ${source}`
        );
    }
  }

  const hiddenParents = new Set();
  for (const directory of hiddenDirectories) {
    let parent = path.dirname(directory);
    while (parent !== '/') {
      hiddenParents.add(parent);
      parent = path.dirname(parent);
    }
  }
  const byDepth = (left, right) =>
    left.split('/').length - right.split('/').length || left.localeCompare(right);
  const hiddenDirectoriesToCreate = new Set([...hiddenParents, ...hiddenDirectories]);
  const operations = [...hiddenDirectoriesToCreate]
    .sort(byDepth)
    .map((directory) => ({ type: 'dir', path: directory }));
  operations.push(
    ...hiddenDirectories.map((directory) => ({
      type: 'tmpfs',
      path: directory,
      hostMask: true,
    }))
  );
  const systemParents = new Set();
  for (const [, target] of systemMounts) {
    systemParents.add(target);
    let parent = path.dirname(target);
    while (parent !== '/') {
      systemParents.add(parent);
      parent = path.dirname(parent);
    }
  }
  for (const directory of [...systemParents].sort(byDepth))
    if (!hiddenParents.has(directory)) operations.push({ type: 'dir', path: directory });
  operations.push({ type: 'dir', path: guestWorkspace }, { type: 'dir', path: guestRun });
  if (trustedGuest) operations.push({ type: 'dir', path: trustedGuest });
  for (const [source, target] of systemMounts)
    operations.push({ type: 'ro-bind-fd', source, target });
  operations.push(
    { type: 'bind-fd', source: workspace, target: guestWorkspace },
    {
      type: 'ro-bind-fd',
      source: path.join(workspace, '.git'),
      target: path.join(guestWorkspace, '.git'),
    },
    { type: 'bind-fd', source: runDirectory, target: guestRun }
  );
  for (const [source, target] of externalMounts)
    operations.push({ type: 'ro-bind-fd', source, target });
  for (const [source, target] of dependencyMounts)
    operations.push({ type: 'ro-bind-fd', source, target });
  operations.push({
    type: 'ro-bind-fd',
    source: markerFile,
    target: guestMarker,
  });
  const hiddenPathsRestoredBySystemMounts = new Set();
  for (const [source, target] of systemMounts)
    for (const directory of hiddenDirectories)
      if (isWithin(source, directory))
        hiddenPathsRestoredBySystemMounts.add(
          path.join(target, path.relative(source, directory))
        );
  for (const directory of hiddenPathsRestoredBySystemMounts)
    operations.push({ type: 'tmpfs', path: directory, hostMask: true });
  for (const { source, target } of networkConfigFiles) {
    if (!['/etc/resolv.conf', '/etc/hosts', '/etc/nsswitch.conf'].includes(target))
      throw new Error(`Unsupported sandbox network configuration file: ${target}`);
    operations.push({ type: 'file-fd', source, target });
  }
  return operations;
}

const sensitiveName =
  /^(?:[.]env(?:$|[.](?!example$)[^/]+)|[.]ssh|[.]aws|[.]gnupg|id_(?:rsa|ed25519)|[.]git-credentials|[.]npmrc|[.]pypirc|[.]netrc|[^/]+[.](?:pem|key))$/iu;
const sensitiveCredentialName =
  /^[.]?(?:auth(?:entication)?|tokens?|credentials?|secrets?|private[-_]?keys?|api[-_]?keys?|access[-_]?tokens?|refresh[-_]?tokens?|client[-_]?secrets?)(?:[.][^/]+)?$/iu;
const credentialEnvironmentExample =
  /^[.]?(?:auth(?:entication)?|tokens?|credentials?|secrets?|private[-_]?keys?|api[-_]?keys?|access[-_]?tokens?|refresh[-_]?tokens?|client[-_]?secrets?)[.]env[.]example$/iu;
const sensitiveCredentialMaterialFile =
  /^[.]?(?:private[-_]?keys?|api[-_]?keys?|access[-_]?tokens?|refresh[-_]?tokens?|client[-_]?secrets?)[.][^/]+$/iu;
const sourceCodeFile =
  /[.](?:c|cc|cpp|cs|css|go|h|hpp|java|js|jsx|mjs|php|py|rb|rs|sql|swift|ts|tsx|vue)$/iu;
const credentialNamedRepositoryAssets = new Set([
  // These tracked implementation and documentation files do not contain credentials.
  'server/routes/api-keys.ts',
  'charts/questarr/templates/secret.yaml',
  'docs/SECRETS.md',
]);

export function isSensitiveCandidatePath(relativePath) {
  const segments = relativePath.replaceAll(String.fromCharCode(92), '/').split('/');
  if (segments.includes('.git') || segments.includes('node_modules'))
    return true;
  if (segments.some((segment) => sensitiveName.test(segment)))
    return true;
  if (credentialNamedRepositoryAssets.has(segments.join('/'))) return false;

  const filename = segments.at(-1) ?? '';
  const hasCredentialNamedSegment = segments.some(
    (segment) =>
      sensitiveCredentialName.test(segment) &&
      !credentialEnvironmentExample.test(segment)
  );
  return (
    sensitiveCredentialMaterialFile.test(filename) ||
    (hasCredentialNamedSegment && !sourceCodeFile.test(filename))
  );
}

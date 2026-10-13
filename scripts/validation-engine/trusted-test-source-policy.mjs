// Copyright (c) QuestarrNG contributors. All rights reserved.
import { Buffer } from 'node:buffer';
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  realpathSync,
  readSync,
} from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function readRegularJson(root, name, label) {
  const file = path.join(root, name);
  const maximumBytes = name === 'package-lock.json' ? 32 * 1024 * 1024 : 1024 * 1024;
  const metadata = lstatSync(file);
  if (metadata.isSymbolicLink() || !metadata.isFile())
    throw new Error(`${label} must be a regular file.`);
  const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const openedMetadata = fstatSync(descriptor);
    if (!openedMetadata.isFile() || openedMetadata.size > maximumBytes)
      throw new Error(`${label} exceeds its size limit.`);
    const buffer = Buffer.allocUnsafe(maximumBytes + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const count = readSync(
        descriptor,
        buffer,
        bytesRead,
        buffer.length - bytesRead,
        null
      );
      if (count === 0) break;
      bytesRead += count;
    }
    if (bytesRead > maximumBytes || fstatSync(descriptor).size > maximumBytes)
      throw new Error(`${label} exceeds its size limit.`);
    return JSON.parse(buffer.toString('utf8', 0, bytesRead));
  } finally {
    closeSync(descriptor);
  }
}

function localFileDependencies(manifest) {
  const dependencies = new Map();
  for (const section of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    for (const [name, specifier] of Object.entries(manifest[section] ?? {})) {
      if (typeof specifier === 'string' && specifier.startsWith('file:')) {
        const target = specifier.slice('file:'.length);
        if (!target || path.isAbsolute(target) || target.includes('\\') ||
          target.split('/').some((segment) => segment === '..' || segment === '.')) {
          throw new Error(`Candidate local dependency has an unsafe path: ${name}.`);
        }
        const normalized = path.posix.normalize(target);
        if (normalized !== target)
          throw new Error(`Candidate local dependency has a non-canonical path: ${name}.`);
        dependencies.set(name, target);
      }
    }
  }
  return dependencies;
}

export function validateCandidateLockfile(sourceRoot) {
  const npmrc = path.join(sourceRoot, '.npmrc');
  try {
    lstatSync(npmrc);
    throw new Error('A candidate project .npmrc is not allowed for dependency installation.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const manifest = readRegularJson(sourceRoot, 'package.json', 'Candidate package.json');
  if (manifest.workspaces !== undefined)
    throw new Error('Candidate npm workspaces are not supported by sandboxed dependency installation.');
  const lock = readRegularJson(sourceRoot, 'package-lock.json', 'Candidate package-lock.json');
  if (![2, 3].includes(lock.lockfileVersion) ||
    !lock.packages || typeof lock.packages !== 'object' || Array.isArray(lock.packages)) {
    throw new Error('Candidate package-lock.json must use lockfile version 2 or 3 with a packages map.');
  }

  const localDependencies = localFileDependencies(manifest);
  const linkedDependencies = new Set();
  const localDependencyTargets = new Set(localDependencies.values());
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error(`Candidate lock entry is invalid: ${name || '<root>'}.`);
    if (name === '') continue;

    if (entry.link === true) {
      if (typeof entry.resolved !== 'string' || !name.includes('node_modules/'))
        throw new Error(`Candidate lock link is invalid: ${name}.`);
      const packageName = name.slice(name.lastIndexOf('node_modules/') + 'node_modules/'.length);
      const expectedTarget = localDependencies.get(packageName);
      if (!expectedTarget || entry.resolved !== expectedTarget)
        throw new Error(`Candidate lock entry has an unapproved local dependency: ${name}.`);
      const target = path.resolve(sourceRoot, entry.resolved);
      if (!isWithin(sourceRoot, target))
        throw new Error(`Candidate local dependency escapes the checkout: ${name}.`);
      const targetMetadata = lstatSync(target);
      if (targetMetadata.isSymbolicLink() || !targetMetadata.isDirectory() ||
        !isWithin(sourceRoot, realpathSync(target))) {
        throw new Error(`Candidate local dependency must remain inside the checkout: ${name}.`);
      }
      linkedDependencies.add(packageName);
      continue;
    }

    if (entry.link !== undefined)
      throw new Error(`Candidate lock link flag is invalid: ${name}.`);

    if (localDependencyTargets.has(name)) {
      if (entry.resolved !== undefined || entry.inBundle === true)
        throw new Error(`Candidate local dependency lock entry is invalid: ${name}.`);
      continue;
    }

    if (entry.inBundle === true && !name.includes('/node_modules/'))
      throw new Error(`Candidate bundled dependency path is invalid: ${name}.`);

    if (typeof entry.resolved !== 'string' || entry.resolved === '') {
      if (entry.inBundle === true) continue;
      throw new Error(`Candidate lock entry has no pinned registry URL: ${name}.`);
    }

    let resolved;
    try {
      resolved = new URL(entry.resolved);
    } catch {
      throw new Error(`Candidate lock entry is not a registry URL: ${name}.`);
    }
    if (resolved.protocol !== 'https:' ||
      resolved.hostname !== 'registry.npmjs.org' ||
      resolved.username || resolved.password || resolved.port ||
      resolved.search || resolved.hash) {
      throw new Error(`Candidate lock entry must resolve from registry.npmjs.org: ${name}.`);
    }
  }
  if ([...localDependencies.keys()].some((name) => !linkedDependencies.has(name)))
    throw new Error('Candidate local dependency declarations do not match the lockfile.');

  return { lockfileVersion: lock.lockfileVersion };
}

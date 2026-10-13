// Copyright (c) QuestarrNG contributors. All rights reserved.
import {
  lstatSync,
  realpathSync,
  readFileSync,
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
  const metadata = lstatSync(file);
  if (metadata.isSymbolicLink() || !metadata.isFile())
    throw new Error(`${label} must be a regular file.`);
  return JSON.parse(readFileSync(file, 'utf8'));
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
    throw new Error('A candidate project .npmrc is not allowed for host dependency installation.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const manifest = readRegularJson(sourceRoot, 'package.json', 'Candidate package.json');
  if (manifest.workspaces !== undefined)
    throw new Error('Candidate npm workspaces are not supported by trusted dependency installation.');
  const lock = readRegularJson(sourceRoot, 'package-lock.json', 'Candidate package-lock.json');
  if (![2, 3].includes(lock.lockfileVersion) ||
    !lock.packages || typeof lock.packages !== 'object' || Array.isArray(lock.packages)) {
    throw new Error('Candidate package-lock.json must use lockfile version 2 or 3 with a packages map.');
  }

  const localDependencies = localFileDependencies(manifest);
  const linkedDependencies = new Set();
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error(`Candidate lock entry is invalid: ${name || '<root>'}.`);
    if (!entry.resolved) continue;

    if (entry.link === true) {
      const packageName = name.split('node_modules/').at(-1);
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

// Copyright (c) QuestarrNG contributors. All rights reserved.
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateCandidateLockfile } from './trusted-test-source-policy.mjs';

function fixture(t, { manifest = {}, lock = {}, npmrc = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'questarr-source-policy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(lock));
  if (npmrc) writeFileSync(path.join(root, '.npmrc'), 'registry=https://attacker.invalid/');
  return root;
}

function registryLock() {
  return {
    lockfileVersion: 3,
    packages: {
      '': { name: 'candidate' },
      'node_modules/example': {
        version: '1.2.3',
        resolved: 'https://registry.npmjs.org/example/-/example-1.2.3.tgz',
        integrity: 'sha512-AAAA',
      },
    },
  };
}

test('accepts an ordinary v3 lockfile pinned to the public npm registry', (t) => {
  const root = fixture(t, {
    manifest: { name: 'candidate', devDependencies: { example: '^1.2.0' } },
    lock: registryLock(),
  });
  assert.deepEqual(validateCandidateLockfile(root), { lockfileVersion: 3 });
});

test('rejects candidate npm configuration and workspace install hooks', (t) => {
  const npmrcRoot = fixture(t, {
    manifest: { name: 'candidate' },
    lock: { lockfileVersion: 3, packages: { '': {} } },
    npmrc: true,
  });
  assert.throws(() => validateCandidateLockfile(npmrcRoot), /project \.npmrc is not allowed/u);

  const workspaceRoot = fixture(t, {
    manifest: { name: 'candidate', workspaces: ['packages/*'] },
    lock: { lockfileVersion: 3, packages: { '': {} } },
  });
  assert.throws(() => validateCandidateLockfile(workspaceRoot), /npm workspaces are not supported/u);
});

test('rejects non-registry, non-HTTPS, and credential-bearing tarball URLs', (t) => {
  for (const resolved of [
    'http://registry.npmjs.org/example.tgz',
    'https://packages.example.net/example.tgz',
    'https://user:password@registry.npmjs.org/example.tgz',
    'https://registry.npmjs.org:8443/example.tgz',
    'git+https://github.com/example/example.git',
  ]) {
    const lock = registryLock();
    lock.packages['node_modules/example'].resolved = resolved;
    const root = fixture(t, {
      manifest: { name: 'candidate', devDependencies: { example: '^1.2.0' } },
      lock,
    });
    assert.throws(() => validateCandidateLockfile(root), /registry\.npmjs\.org/u, resolved);
  }
});

test('rejects unpinned external lock entries but accepts declared bundled packages', (t) => {
  const unpinned = registryLock();
  delete unpinned.packages['node_modules/example'].resolved;
  const unpinnedRoot = fixture(t, {
    manifest: { name: 'candidate', devDependencies: { example: '^1.2.0' } },
    lock: unpinned,
  });
  assert.throws(() => validateCandidateLockfile(unpinnedRoot), /no pinned registry URL/u);

  const bundled = fixture(t, {
    manifest: { name: 'candidate' },
    lock: {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/parent': {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/parent/-/parent-1.0.0.tgz',
        },
        'node_modules/parent/node_modules/bundled': {
          version: '1.0.0',
          inBundle: true,
        },
      },
    },
  });
  assert.deepEqual(validateCandidateLockfile(bundled), { lockfileVersion: 3 });

  const misplacedBundle = fixture(t, {
    manifest: { name: 'candidate' },
    lock: {
      lockfileVersion: 3,
      packages: { '': {}, bundled: { version: '1.0.0', inBundle: true } },
    },
  });
  assert.throws(() => validateCandidateLockfile(misplacedBundle), /bundled dependency path/u);
});

test('accepts only declared local dependencies that resolve to real in-checkout directories', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'questarr-local-dependency-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'vendor', 'helper'), { recursive: true });
  writeFileSync(path.join(root, 'vendor', 'helper', 'package.json'), JSON.stringify({ name: 'helper' }));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'candidate',
    devDependencies: { helper: 'file:vendor/helper' },
  }));
  writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': {},
      'node_modules/helper': { resolved: 'vendor/helper', link: true },
    },
  }));
  assert.deepEqual(validateCandidateLockfile(root), { lockfileVersion: 3 });

  const outside = mkdtempSync(path.join(os.tmpdir(), 'questarr-outside-dependency-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  rmSync(path.join(root, 'vendor', 'helper'), { recursive: true });
  symlinkSync(outside, path.join(root, 'vendor', 'helper'));
  assert.throws(() => validateCandidateLockfile(root), /must remain inside the checkout/u);
});

test('rejects local dependency traversal and unmatched lockfile links', (t) => {
  const traversal = fixture(t, {
    manifest: { name: 'candidate', dependencies: { helper: 'file:../helper' } },
    lock: { lockfileVersion: 3, packages: { '': {} } },
  });
  assert.throws(() => validateCandidateLockfile(traversal), /unsafe path/u);

  const missingLink = fixture(t, {
    manifest: { name: 'candidate', dependencies: { helper: 'file:vendor/helper' } },
    lock: {
      lockfileVersion: 3,
      packages: { '': {}, 'node_modules/helper': { resolved: 'vendor/other', link: true } },
    },
  });
  mkdirSync(path.join(missingLink, 'vendor', 'helper'), { recursive: true });
  mkdirSync(path.join(missingLink, 'vendor', 'other'), { recursive: true });
  assert.throws(() => validateCandidateLockfile(missingLink), /unapproved local dependency/u);

  const unresolvedLink = fixture(t, {
    manifest: { name: 'candidate' },
    lock: {
      lockfileVersion: 3,
      packages: { '': {}, 'node_modules/helper': { link: true } },
    },
  });
  assert.throws(() => validateCandidateLockfile(unresolvedLink), /lock link is invalid/u);
});

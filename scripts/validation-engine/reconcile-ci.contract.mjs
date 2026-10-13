// Copyright (c) QuestarrNG contributors. All rights reserved.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  main as reconcileMain,
  reconcileCiReceipts,
  reconcileBuildReceipts,
  validateTrustedPrReceipt,
} from './reconcile-ci.mjs';

const identity = {
  repository: 'questarrng',
  runId: '9842176',
  runAttempt: '3',
  sha: 'a'.repeat(40),
};

const laneCounts = {
  'client-vitest': 108,
  'shared-vitest': 14,
  'server-vitest': 7,
  'scripts-vitest': 3,
  'browser-playwright': 5,
};
const laneDigests = Object.fromEntries(
  Object.keys(laneCounts).map((lane, index) => [lane, String(index + 1).repeat(64)]),
);
const candidate = {
  commit: identity.sha,
  tree: 'b'.repeat(40),
  sourceSha256: 'c'.repeat(64),
  inventorySha256: 'd'.repeat(64),
  inputDigests: [
    { file: 'package.json', sha256: 'e'.repeat(64) },
    { file: 'scripts/validation-engine/config.mjs', sha256: 'f'.repeat(64) },
  ],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function githubContext() {
  return {
    workflow: 'CI',
    job: 'test',
    runId: identity.runId,
    runAttempt: identity.runAttempt,
    eventName: 'workflow_dispatch',
    sha: identity.sha,
  };
}

function testReceipt(overrides = {}) {
  const inventory = Object.entries(laneCounts)
    .filter(([lane]) => lane !== 'browser-playwright')
    .map(([lane, discoveredFiles]) => ({ lane, discoveredFiles, inventorySha256: laneDigests[lane] }));
  return {
    schemaVersion: 1,
    repository: identity.repository,
    selection: 'tests-only',
    runId: 'test-engine-run',
    completedAt: '2026-10-11T20:00:00.000Z',
    status: 'passed',
    candidate: clone(candidate),
    inventoryCounts: { ...laneCounts },
    inventoryLaneDigests: { ...laneDigests },
    executionContext: {
      executor: 'github-actions',
      platform: 'linux',
      architecture: 'x64',
      nodeVersion: 'v26.6.0',
      github: githubContext(),
    },
    tasks: [
      { taskId: 'engine-contract-tests', status: 'passed', activeCases: 16 },
      { taskId: 'ci-node-reconciliation-tests', status: 'passed', activeCases: 9 },
      { taskId: 'install-dependencies', status: 'passed' },
      { taskId: 'vitest-coverage', status: 'passed', activeCases: 3415, inventory },
      { taskId: 'vitest-shard-1', status: 'excluded' },
      { taskId: 'playwright-e2e', status: 'excluded' },
    ],
    totals: { planned: 4, executed: 4, passed: 4, failed: 0, blocked: 0, excluded: 15, activeCases: 3440 },
    ...overrides,
  };
}

function buildReceipt(major, overrides = {}) {
  return {
    schemaVersion: 1,
    repository: identity.repository,
    selection: 'task:build-output',
    runId: 'build-engine-run-' + major,
    completedAt: '2026-10-11T20:00:00.000Z',
    status: 'passed',
    candidate: clone(candidate),
    inventoryCounts: { ...laneCounts },
    inventoryLaneDigests: { ...laneDigests },
    executionContext: {
      executor: 'github-actions',
      platform: 'linux',
      architecture: 'x64',
      nodeVersion: major === 22 ? 'v22.19.0' : 'v26.6.0',
      github: { ...githubContext(), job: 'build' },
    },
    tasks: [
      'install-dependencies', 'lint', 'format-check', 'typecheck', 'build', 'build-output',
    ].map((taskId) => ({ taskId, status: 'passed' })),
    ...overrides,
  };
}

function allReceipts() {
  return [testReceipt(), buildReceipt(22), buildReceipt(26)];
}

test('reconciles the full test job and both Node build nodes from one workflow attempt', () => {
  const result = reconcileCiReceipts({ receipts: allReceipts(), ...identity });
  assert.equal(result.status, 'passed');
  assert.equal(result.test.activeCases, 3415);
  assert.deepEqual(result.buildNodes.map((node) => node.major), [22, 26]);
  assert.equal(result.runId, identity.runId);
});

test('validates trusted PR receipts against the exact head, base, and workflow attempt', () => {
  const baseSha = '9'.repeat(40);
  const receipt = testReceipt();
  receipt.candidate.snapshotCommit = 'b'.repeat(40);
  receipt.executionContext.github.eventName = 'pull_request_target';
  receipt.executionContext.trustedBaseSha = baseSha;
  const result = validateTrustedPrReceipt({ receipt, ...identity, baseSha });
  assert.equal(result.status, 'passed');
  assert.equal(result.baseSha, baseSha);
  assert.equal(result.test.activeCases, 3415);

  const wrongBase = clone(receipt);
  wrongBase.executionContext.trustedBaseSha = '8'.repeat(40);
  assert.throws(
    () => validateTrustedPrReceipt({ receipt: wrongBase, ...identity, baseSha }),
    /does not match the base workflow/u,
  );

  const wrongEvent = clone(receipt);
  wrongEvent.executionContext.github.eventName = 'pull_request';
  assert.throws(
    () => validateTrustedPrReceipt({ receipt: wrongEvent, ...identity, baseSha }),
    /does not match the base workflow/u,
  );

  const wrongSnapshot = clone(receipt);
  wrongSnapshot.candidate.snapshotCommit = 'not-a-commit';
  assert.throws(
    () => validateTrustedPrReceipt({ receipt: wrongSnapshot, ...identity, baseSha }),
    /invalid source identity/u,
  );
});

test('reconciles only the minimum Node build lane for pull request workflows', () => {
  const result = reconcileCiReceipts({
    receipts: [testReceipt(), buildReceipt(22)],
    ...identity,
    expectedNodeMajors: [22],
  });
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.buildNodes.map((node) => node.major), [22]);
});

test('rejects missing, duplicate, or unexpected CI receipt selections', () => {
  assert.throws(() => reconcileCiReceipts({ receipts: allReceipts().slice(1), ...identity }), /Expected one full-suite receipt/);
  const duplicate = allReceipts();
  duplicate[2] = testReceipt();
  assert.throws(() => reconcileCiReceipts({ receipts: duplicate, ...identity }), /exactly one tests-only/);
  const unexpected = allReceipts();
  unexpected[2].selection = 'task:lint';
  assert.throws(() => reconcileCiReceipts({ receipts: unexpected, ...identity }), /exactly one tests-only/);
});

test('rejects failed full-suite tasks, zero cases, and missing Vitest lanes', () => {
  let receipts = allReceipts();
  receipts[0].tasks[1].status = 'failed';
  assert.throws(() => reconcileCiReceipts({ receipts, ...identity }), /missing a passing ci-node-reconciliation-tests/);

  receipts = allReceipts();
  receipts[0].tasks[3].activeCases = 0;
  assert.throws(() => reconcileCiReceipts({ receipts, ...identity }), /recorded no Vitest cases/);

  receipts = allReceipts();
  receipts[0].tasks[3].inventory.pop();
  assert.throws(() => reconcileCiReceipts({ receipts, ...identity }), /does not attest every configured Vitest inventory lane/);
});

test('rejects stale attempts, commits, and source snapshots', () => {
  let receipts = allReceipts();
  receipts[1].executionContext.github.runAttempt = '2';
  assert.throws(() => reconcileCiReceipts({ receipts, ...identity }), /different workflow run or attempt/);

  receipts = allReceipts();
  receipts[0].candidate.commit = '9'.repeat(40);
  assert.throws(() => reconcileCiReceipts({ receipts, ...identity }), /different source commit/);

  receipts = allReceipts();
  receipts[2].candidate.sourceSha256 = '8'.repeat(64);
  assert.throws(() => reconcileCiReceipts({ receipts, ...identity }), /same source snapshot/);
});

test('rejects drift in discovered test inventory between test and build nodes', () => {
  const receipts = allReceipts();
  receipts[1].inventoryCounts['shared-vitest'] += 1;
  assert.throws(() => reconcileCiReceipts({ receipts, ...identity }), /same test inventory/);
});

test('reconciles both supported Node build versions and their required checks', () => {
  const nodes = reconcileBuildReceipts({
    receipts: [buildReceipt(22), buildReceipt(26)],
    ...identity,
  });
  assert.deepEqual(nodes.map((node) => node.major), [22, 26]);
  assert.throws(() => reconcileBuildReceipts({
    receipts: [buildReceipt(22), buildReceipt(26, { tasks: [{ taskId: 'build-output', status: 'passed' }] })],
    ...identity,
  }), /missing a passing install-dependencies/);
  assert.throws(() => reconcileBuildReceipts({
    receipts: [buildReceipt(21), buildReceipt(26)],
    ...identity,
  }), /each configured Node major exactly once/);
});

test('CLI reads and validates the exact receipt set downloaded for the current workflow', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'questarrng-reconcile-ci-'));
  try {
    const names = ['test.json', 'build-node-22.json', 'build-node-26.json'];
    for (const [index, receipt] of allReceipts().entries()) {
      writeFileSync(path.join(directory, names[index]), JSON.stringify(receipt));
    }
    assert.equal(reconcileMain([
      '--receipts', directory,
      '--run-id', identity.runId,
      '--run-attempt', identity.runAttempt,
      '--sha', identity.sha,
      '--expected-node-majors', '22,26',
    ]), 0);
    writeFileSync(path.join(directory, 'unexpected.json'), JSON.stringify(testReceipt()));
    assert.throws(() => reconcileMain([
      '--receipts', directory,
      '--run-id', identity.runId,
      '--run-attempt', identity.runAttempt,
      '--sha', identity.sha,
      '--expected-node-majors', '22,26',
    ]), /Expected one full-suite receipt/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

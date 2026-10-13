#!/usr/bin/env node
// Copyright (c) QuestarrNG contributors. All rights reserved.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const VITEST_LANES = ['client-vitest', 'shared-vitest', 'server-vitest', 'scripts-vitest'];
const TEST_TASKS = [
  'engine-contract-tests',
  'ci-node-reconciliation-tests',
  'install-dependencies',
  'vitest-coverage',
];
const BUILD_TASKS = [
  'install-dependencies',
  'lint',
  'format-check',
  'typecheck',
  'build',
  'build-output',
];

function fail(message) {
  throw new Error(message);
}

function sourceIdentity(candidate) {
  if (!candidate || !Array.isArray(candidate.inputDigests) || candidate.inputDigests.length === 0) {
    fail('A validation receipt is missing its source input digests.');
  }
  if (!/^[a-f0-9]{40}$/.test(candidate.commit ?? '') ||
    !/^[a-f0-9]{40}$/.test(candidate.tree ?? '') ||
    !/^[a-f0-9]{64}$/.test(candidate.sourceSha256 ?? '') ||
    !/^[a-f0-9]{64}$/.test(candidate.inventorySha256 ?? '') ||
    (candidate.snapshotCommit !== undefined && !/^[a-f0-9]{40}$/.test(candidate.snapshotCommit)) ||
    candidate.inputDigests.some((item) => !item?.file || !/^[a-f0-9]{64}$/.test(item.sha256 ?? ''))) {
    fail('A validation receipt has an invalid source identity.');
  }
  return JSON.stringify({
    commit: candidate.commit,
    tree: candidate.tree,
    sourceSha256: candidate.sourceSha256,
    inventorySha256: candidate.inventorySha256,
    inputDigests: [...candidate.inputDigests].sort((left, right) => left.file.localeCompare(right.file)),
  });
}

function inventoryIdentity(receipt) {
  const counts = receipt.inventoryCounts;
  const digests = receipt.inventoryLaneDigests;
  if (!counts || !digests) fail('A validation receipt is missing test inventory metadata.');
  for (const lane of VITEST_LANES) {
    if (!Number.isInteger(counts[lane]) || counts[lane] < 1 ||
      !/^[a-f0-9]{64}$/.test(digests[lane] ?? '')) {
      fail('A validation receipt has an empty or invalid Vitest inventory lane: ' + lane + '.');
    }
  }
  return JSON.stringify({
    counts: Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))),
    digests: Object.fromEntries(Object.entries(digests).sort(([left], [right]) => left.localeCompare(right))),
  });
}

function taskMap(receipt) {
  const tasks = receipt.tasks ?? [];
  const byId = new Map();
  for (const task of tasks) {
    if (!task?.taskId || byId.has(task.taskId)) fail('A validation receipt has missing or duplicate task IDs.');
    byId.set(task.taskId, task);
  }
  return byId;
}

function requirePassedTasks(receipt, requiredTasks, label) {
  const byId = taskMap(receipt);
  for (const id of requiredTasks) {
    if (byId.get(id)?.status !== 'passed') fail(label + ' receipt is missing a passing ' + id + ' task.');
  }
  const failed = [...byId.values()].find((task) => task.status === 'failed' ||
    task.status === 'incomplete' || task.status === 'blocked' || task.status === 'not-run');
  if (failed) fail(label + ' receipt contains an unsuccessful task: ' + failed.taskId + '.');
  return byId;
}

function validateWorkflowReceipt(receipt, {
  repository,
  selection,
  runId,
  runAttempt,
  sha,
  label,
}) {
  if (receipt.schemaVersion !== 1 || receipt.repository !== repository ||
    receipt.selection !== selection || receipt.status !== 'passed') {
    fail(label + ' receipt has an unexpected schema, repository, selection, or status.');
  }
  const github = receipt.executionContext?.github;
  if (receipt.executionContext?.executor !== 'github-actions' ||
    String(github?.runId) !== String(runId) || String(github?.runAttempt) !== String(runAttempt)) {
    fail(label + ' receipt belongs to a different workflow run or attempt.');
  }
  if (github?.sha !== sha || receipt.candidate?.commit !== sha) {
    fail(label + ' receipt belongs to a different source commit.');
  }
  if (receipt.executionContext?.platform !== 'linux' || receipt.executionContext?.architecture !== 'x64') {
    fail(label + ' receipt was not produced on the configured Linux x64 runner.');
  }
  return {
    source: sourceIdentity(receipt.candidate),
    inventory: inventoryIdentity(receipt),
  };
}

function validateVitestReceipt(receipt, workflow) {
  if (!/^v26\./.test(receipt.executionContext?.nodeVersion ?? '')) {
    fail('The full-suite test receipt must run on Node 26.');
  }
  const tasks = requirePassedTasks(receipt, TEST_TASKS, 'Test');
  const vitest = tasks.get('vitest-coverage');
  if (!Number.isInteger(vitest.activeCases) || vitest.activeCases < 1) {
    fail('The full-suite test receipt recorded no Vitest cases.');
  }
  const lanes = new Map((vitest.inventory ?? []).map((item) => [item.lane, item]));
  if (lanes.size !== VITEST_LANES.length || VITEST_LANES.some((lane) => {
    const item = lanes.get(lane);
    return !item || item.discoveredFiles !== receipt.inventoryCounts[lane] ||
      item.inventorySha256 !== receipt.inventoryLaneDigests[lane];
  })) {
    fail('The full-suite receipt does not attest every configured Vitest inventory lane.');
  }
  const selected = [...tasks.values()].filter((task) => task.status !== 'excluded');
  if (selected.some((task) => task.status !== 'passed')) {
    fail('The full-suite test receipt contains a selected task that did not pass.');
  }
  if (workflow.inventory !== inventoryIdentity(receipt)) {
    fail('The full-suite test inventory identity changed during reconciliation.');
  }
  return {
    activeCases: vitest.activeCases,
    runId: receipt.runId,
    completedAt: receipt.completedAt,
    nodeVersion: receipt.executionContext.nodeVersion,
  };
}

export function validateTrustedPrReceipt({
  receipt,
  repository = 'questarrng',
  runId,
  runAttempt,
  sha,
  baseSha,
}) {
  if (!/^[a-f0-9]{40}$/.test(baseSha ?? ''))
    fail('A trusted base commit is required for pull request validation.');
  const workflow = validateWorkflowReceipt(receipt, {
    repository,
    selection: 'tests-only',
    runId,
    runAttempt,
    sha,
    label: 'Trusted pull request test',
  });
  const github = receipt.executionContext?.github;
  if (github?.eventName !== 'pull_request_target' ||
    receipt.executionContext?.trustedBaseSha !== baseSha ||
    !/^[a-f0-9]{40}$/.test(receipt.candidate?.snapshotCommit ?? '')) {
    fail('Trusted pull request receipt does not match the base workflow and isolated source snapshot.');
  }
  const test = validateVitestReceipt(receipt, workflow);
  return {
    schemaVersion: 1,
    repository,
    runId: String(runId),
    runAttempt: String(runAttempt),
    sha,
    baseSha,
    status: 'passed',
    test,
  };
}

export function reconcileBuildReceipts({
  receipts,
  repository = 'questarrng',
  runId,
  runAttempt,
  sha,
  expectedNodeMajors = [22, 26],
}) {
  if (!runId || !runAttempt || !sha) {
    fail('A current workflow run ID, attempt, and source commit are required for build receipts.');
  }
  if (!Array.isArray(receipts) || receipts.length !== expectedNodeMajors.length) {
    fail('Expected one successful build receipt for every supported Node matrix lane.');
  }
  const byMajor = new Map();
  let referenceSource;
  let referenceInventory;
  for (const receipt of receipts) {
    const version = receipt.executionContext?.nodeVersion ?? '';
    const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version);
    const major = Number(match?.[1]);
    if (!match || !expectedNodeMajors.includes(major) || byMajor.has(major) ||
      (major === 22 && Number(match[2]) < 19)) {
      fail('Build receipts must contain each configured Node major exactly once.');
    }
    const workflow = validateWorkflowReceipt(receipt, {
      repository,
      selection: 'task:build-output',
      runId,
      runAttempt,
      sha,
      label: 'Node ' + major + ' build',
    });
    requirePassedTasks(receipt, BUILD_TASKS, 'Node ' + major + ' build');
    if (referenceSource !== undefined && workflow.source !== referenceSource) {
      fail('Node build receipts do not share the same source snapshot.');
    }
    if (referenceInventory !== undefined && workflow.inventory !== referenceInventory) {
      fail('Node build receipts do not share the same test inventory.');
    }
    referenceSource ??= workflow.source;
    referenceInventory ??= workflow.inventory;
    byMajor.set(major, {
      major,
      version,
      runId: receipt.runId,
      completedAt: receipt.completedAt,
    });
  }
  if (expectedNodeMajors.some((major) => !byMajor.has(major))) {
    fail('A supported Node build matrix receipt is missing.');
  }
  return [...byMajor.values()].sort((left, right) => left.major - right.major);
}

export function reconcileCiReceipts({
  receipts,
  repository = 'questarrng',
  runId,
  runAttempt,
  sha,
  expectedNodeMajors = [22, 26],
}) {
  if (!runId || !runAttempt || !sha) {
    fail('A current workflow run ID, attempt, and source commit are required.');
  }
  if (!Array.isArray(receipts) || receipts.length !== 1 + expectedNodeMajors.length) {
    fail('Expected one full-suite receipt and one build receipt for every Node matrix lane.');
  }
  const tests = receipts.filter((receipt) => receipt.selection === 'tests-only');
  const builds = receipts.filter((receipt) => receipt.selection === 'task:build-output');
  if (tests.length !== 1 || builds.length !== expectedNodeMajors.length ||
    tests.length + builds.length !== receipts.length) {
    fail('CI receipts must contain exactly one tests-only result and the configured Node build results.');
  }
  const testReceipt = tests[0];
  const testWorkflow = validateWorkflowReceipt(testReceipt, {
    repository,
    selection: 'tests-only',
    runId,
    runAttempt,
    sha,
    label: 'Full-suite test',
  });
  const testRun = validateVitestReceipt(testReceipt, testWorkflow);
  const buildNodes = reconcileBuildReceipts({
    receipts: builds,
    repository,
    runId,
    runAttempt,
    sha,
    expectedNodeMajors,
  });
  for (const receipt of builds) {
    const buildSource = sourceIdentity(receipt.candidate);
    const buildInventory = inventoryIdentity(receipt);
    if (buildSource !== testWorkflow.source) {
      fail('Test and Node build receipts do not share the same source snapshot.');
    }
    if (buildInventory !== testWorkflow.inventory) {
      fail('Test and Node build receipts do not share the same test inventory.');
    }
  }
  return {
    schemaVersion: 1,
    repository,
    runId: String(runId),
    runAttempt: String(runAttempt),
    sha,
    status: 'passed',
    test: testRun,
    buildNodes,
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) fail('Unexpected argument: ' + arg);
    if (arg === '--trusted-pr') {
      options.trustedPr = true;
      continue;
    }
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail('Missing value for --' + key + '.');
    options[key] = value;
    index += 1;
  }
  return options;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.trustedPr) {
    if (!options.receipt || options.receipts)
      fail('Trusted pull request reconciliation requires exactly one --receipt file.');
    const receipt = JSON.parse(readFileSync(path.resolve(options.receipt), 'utf8'));
    const summary = validateTrustedPrReceipt({
      receipt,
      runId: options['run-id'] ?? process.env.GITHUB_RUN_ID,
      runAttempt: options['run-attempt'] ?? process.env.GITHUB_RUN_ATTEMPT,
      sha: options.sha,
      baseSha: options['base-sha'],
    });
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    return 0;
  }
  if (!options.receipts) fail('Pass --receipts <directory>.');
  const expectedNodeMajors = options['expected-node-majors']
    ?.split(',')
    .map((major) => Number(major));
  if (expectedNodeMajors && (expectedNodeMajors.length === 0 ||
    expectedNodeMajors.some((major) => ![22, 26].includes(major)) ||
    new Set(expectedNodeMajors).size !== expectedNodeMajors.length)) {
    fail('Expected Node majors must be unique supported values: 22,26.');
  }
  const directory = path.resolve(options.receipts);
  const receipts = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(path.join(directory, name), 'utf8')));
  const summary = reconcileCiReceipts({
    receipts,
    runId: options['run-id'] ?? process.env.GITHUB_RUN_ID,
    runAttempt: options['run-attempt'] ?? process.env.GITHUB_RUN_ATTEMPT,
    sha: options.sha ?? process.env.GITHUB_SHA,
    ...(expectedNodeMajors ? { expectedNodeMajors } : {}),
  });
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(String(error?.stack ?? error) + '\n');
    process.exitCode = 1;
  }
}

// Copyright (c) QuestarrNG contributors. All rights reserved.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const workflowPath = fileURLToPath(
  new URL('../../.github/workflows/ci.yml', import.meta.url)
);

test('secret-bearing steps after PR tests run only on trusted main pushes', () => {
  const workflow = readFileSync(workflowPath, 'utf8');
  const testJobStart = workflow.indexOf('\n  test:\n');
  assert.notEqual(testJobStart, -1, 'CI test job is present');
  const testJobEnd = workflow.indexOf('\n  build:\n', testJobStart);
  assert.notEqual(testJobEnd, -1, 'CI test job has a bounded end');
  const testJob = workflow.slice(testJobStart, testJobEnd);
  const testStep = testJob.indexOf('run: node scripts/validate-development.mjs --tests-only');
  assert.notEqual(testStep, -1, 'source-bound tests run in this job');
  assert.doesNotMatch(
    testJob.slice(0, testStep),
    /\$\{\{\s*secrets\./u,
    'no workflow secret is passed before candidate tests'
  );

  const postTestSteps = testJob.slice(testStep);
  const steps = postTestSteps.split(/(?=^      - name: )/mu);
  const secretSteps = steps.filter((step) => /\$\{\{\s*secrets\./u.test(step));
  assert.ok(secretSteps.length > 0, 'the contract covers the current upload steps');
  for (const step of secretSteps) {
    assert.match(
      step,
      /^      - name:[^\n]*\n        if: \$\{\{ github\.event_name == 'push' && github\.ref == 'refs\/heads\/main' \}\}/mu,
      'secret-bearing upload steps must be gated to trusted main pushes'
    );
  }
});

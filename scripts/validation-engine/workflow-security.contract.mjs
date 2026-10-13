// Copyright (c) QuestarrNG contributors. All rights reserved.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';
import test from 'node:test';

const workflowDirectory = new URL('../../.github/workflows/', import.meta.url);
const ciWorkflow = readFileSync(
  fileURLToPath(new URL('ci.yml', workflowDirectory)),
  'utf8'
);
const trustedWorkflow = readFileSync(
  fileURLToPath(new URL('trusted-pr-validation.yml', workflowDirectory)),
  'utf8'
);
const codecovWorkflow = readFileSync(
  fileURLToPath(new URL('codecov-upload.yml', workflowDirectory)),
  'utf8'
);
const releaseWorkflow = readFileSync(
  fileURLToPath(new URL('fork-image.yml', workflowDirectory)),
  'utf8'
);

function jobBlock(workflow, name, nextName) {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `${name} job is present`);
  const end = nextName
    ? workflow.indexOf(`\n  ${nextName}:\n`, start + 1)
    : workflow.length;
  if (nextName) assert.notEqual(end, -1, `${name} job has a bounded section`);
  return workflow.slice(start, end);
}

test('pull-request CI never receives the Codecov secret', () => {
  assert.doesNotMatch(ciWorkflow, /secrets\.CODECOV_TOKEN/u);
  assert.doesNotMatch(ciWorkflow, /codecov\/codecov-action/u);
  assert.match(
    ciWorkflow,
    /name: Upload Codecov reports for the trusted workflow[\s\S]*?name: codecov-reports-attempt-\$\{\{ github\.run_attempt \}\}/u
  );
});

test('Codecov uploads run from the default-branch workflow after trusted main CI', () => {
  assert.match(codecovWorkflow, /workflow_run:[\s\S]*?workflows: \[CI\][\s\S]*?branches: \[main\]/u);
  assert.match(
    codecovWorkflow,
    /github\.event\.workflow_run\.event == 'push'[\s\S]*?github\.event\.workflow_run\.head_branch == 'main'[\s\S]*?github\.event\.workflow_run\.head_repository\.full_name == github\.repository/u
  );
  assert.match(
    codecovWorkflow,
    /^    environment: codecov-main$/mu,
    'Codecov credentials must come from the main-only protected environment'
  );
  assert.match(
    codecovWorkflow,
    /pattern: codecov-reports-attempt-\$\{\{ github\.event\.workflow_run\.run_attempt \}\}/u,
    'the trusted uploader must use reports from the matching run attempt'
  );
  assert.match(codecovWorkflow, /token: \$\{\{ secrets\.CODECOV_TOKEN \}\}/u);
  assert.doesNotMatch(
    codecovWorkflow,
    /skip_validation:\s*true/u,
    'the Codecov CLI integrity check must remain enabled'
  );
  assert.doesNotMatch(codecovWorkflow, /pull_request(?:_target)?\s*:/u);
});

test('Discord release announcements require their protected environment', () => {
  const announceJob = jobBlock(releaseWorkflow, 'announce-release');
  assert.match(announceJob, /environment:\n\s+name: discord-release/u);
  assert.match(announceJob, /DISCORD_WEBHOOK: \$\{\{ secrets\.DISCORD_RELEASE_WEBHOOK \}\}/u);
  assert.match(announceJob, /Discord announcement skipped because discord-release has no webhook secret/u);
});

test('trusted PR validation runs the base validator and launcher on an exact candidate snapshot', () => {
  assert.match(trustedWorkflow, /pull_request_target:[\s\S]*?branches: \[main\]/u);
  assert.match(trustedWorkflow, /permissions:\n  contents: read/u);
  assert.doesNotMatch(trustedWorkflow, /\$\{\{\s*secrets\./u);
  assert.match(trustedWorkflow, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/u);
  assert.match(trustedWorkflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/u);
  assert.equal((trustedWorkflow.match(/persist-credentials: false/gu) ?? []).length, 2);
  assert.match(
    trustedWorkflow,
    /node trusted\/scripts\/validation-engine\/trusted-test-launcher\.mjs candidate[\s\S]*?--trusted-root trusted[\s\S]*?--trusted-base-sha "\$VALIDATION_PR_BASE_SHA"[\s\S]*?--candidate-sha "\$VALIDATION_PR_HEAD_SHA"[\s\S]*?--install-dependencies[\s\S]*?node \/mnt\/trusted-validation\/scripts\/validate-development\.mjs[\s\S]*?--root \/mnt\/workspace[\s\S]*?--tests-only/u
  );
  assert.match(trustedWorkflow, /node trusted\/scripts\/validation-engine\/reconcile-ci\.mjs/u);
});

test('CI receipt reconciliation downloads only artifacts from the current attempt', () => {
  assert.match(
    ciWorkflow,
    /pattern: validation-receipt-\*-attempt-\$\{\{\s*github\.run_attempt\s*\}\}/u
  );
});

test('test and build jobs execute the base-reviewed launcher with isolated dependencies', () => {
  const testJob = jobBlock(ciWorkflow, 'test', 'build');
  const buildJob = jobBlock(ciWorkflow, 'build', 'reconcile-validation');
  for (const [name, job] of [['test', testJob], ['build', buildJob]]) {
    assert.match(job, /runs-on: ubuntu-24\.04/u);
    assert.match(job, /fetch-depth: 0/u);
    assert.match(job, /Prepare reviewed launcher, npm runtime, and offline dependency cache/u);
    assert.match(job, /git show "\$launcher_sha:scripts\/validation-engine\/trusted-test-launcher\.mjs"/u);
    assert.match(job, /--trusted-npm-runtime "\$RUNNER_TEMP\/questarr-trusted-validation\/\.github\/npm-runtime\/node_modules"/u);
    assert.match(job, /--install-dependencies/u);
    assert.match(job, /node "\$RUNNER_TEMP\/questarr-trusted-validation\/launcher\/trusted-test-launcher\.mjs"/u);
    assert.match(job, /--github-actions-context/u);
    assert.match(job, /BOOTSTRAP_LAUNCHER_REF: codex\/trusted-validation-bootstrap-20261013/u);
    assert.match(job, /BOOTSTRAP_LAUNCHER_SHA: [a-f0-9]{40}/u);
    assert.match(job, /git fetch --no-tags origin "refs\/heads\/\$BOOTSTRAP_LAUNCHER_REF"/u);
    assert.match(job, /fetched_launcher_sha" != "\$launcher_sha"/u);
    assert.match(
      job,
      /NPM_CONFIG_USERCONFIG="\$empty_npm_user_config"[\s\\]*NPM_CONFIG_GLOBALCONFIG="\$empty_npm_global_config"/u,
      `${name} uses separate empty npm user and global config files`
    );
    assert.doesNotMatch(job, /run: node scripts\/validate-development\.mjs/u);
    assert.match(job, /Install Bubblewrap for isolated/u, `${name} job installs and preflights Bubblewrap`);
  }
  assert.match(testJob, /--reports-output "\$RUNNER_TEMP\/quest-codecov-reports"/u);
  assert.match(testJob, /path: \$\{\{ runner\.temp \}\}\/quest-codecov-reports/u);
});

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
const trustedDiscordWorkflow = readFileSync(
  fileURLToPath(new URL('trusted-discord-release-announcement.yml', workflowDirectory)),
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
    /^\x20{4}environment:\x20codecov-main$/mu,
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

test('manual Discord release announcements require the main-only protected environment', () => {
  const announceJob = jobBlock(releaseWorkflow, 'announce-release');
  assert.match(announceJob, /github\.event_name == 'workflow_dispatch'/u);
  assert.match(announceJob, /github\.ref == 'refs\/heads\/main'/u);
  assert.doesNotMatch(announceJob, /startsWith\(github\.ref, 'refs\/tags\/v'\)/u);
  assert.match(announceJob, /environment:\n\s+name: discord-release/u);
  assert.match(announceJob, /DISCORD_WEBHOOK: \$\{\{ secrets\.DISCORD_WEBHOOK \}\}/u);
  assert.match(announceJob, /Discord announcement skipped because discord-release has no webhook secret/u);
});

test('tag Discord announcements use the trusted default-branch workflow', () => {
  assert.match(
    trustedDiscordWorkflow,
    /workflow_run:\n\s+workflows: \["Publish QuestarrNG image"\]\n\s+types: \[completed\]/u
  );
  assert.match(trustedDiscordWorkflow, /workflow_id == 368554729/u);
  assert.match(trustedDiscordWorkflow, /workflow_run\.event == 'push'/u);
  assert.match(trustedDiscordWorkflow, /workflow_run\.head_repository\.full_name == github\.repository/u);
  assert.match(trustedDiscordWorkflow, /startsWith\(github\.event\.workflow_run\.head_branch, 'v'\)/u);
  assert.match(trustedDiscordWorkflow, /workflow_run\.conclusion == 'success'/u);
  assert.match(trustedDiscordWorkflow, /environment:\n\s+name: discord-release/u);
  assert.match(trustedDiscordWorkflow, /DISCORD_WEBHOOK: \$\{\{ secrets\.DISCORD_WEBHOOK \}\}/u);
  assert.match(trustedDiscordWorkflow, /TAG: \$\{\{ github\.event\.workflow_run\.head_branch \}\}/u);
  assert.match(trustedDiscordWorkflow, /ref: \$\{\{ github\.sha \}\}/u);
  assert.match(trustedDiscordWorkflow, /persist-credentials: false/u);
  assert.match(trustedDiscordWorkflow, /permissions:\n\x20{2}contents:\x20read/u);
  assert.doesNotMatch(trustedDiscordWorkflow, /pull_request(?:_target)?\s*:/u);
  assert.doesNotMatch(trustedDiscordWorkflow, /secrets\.DISCORD_RELEASE_WEBHOOK/u);
});

test('trusted PR validation runs the base validator and launcher on an exact candidate snapshot', () => {
  assert.match(trustedWorkflow, /pull_request_target:[\s\S]*?branches: \[main\]/u);
  assert.match(trustedWorkflow, /permissions:\n\x20{2}contents:\x20read/u);
  assert.doesNotMatch(trustedWorkflow, /\$\{\{\s*secrets\./u);
  assert.match(trustedWorkflow, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/u);
  assert.match(
    trustedWorkflow,
    /# nosemgrep: yaml\.github-actions\.security\.pull-request-target-code-checkout\.pull-request-target-code-checkout\n\s+# This action checks out only the pull-request base SHA\.\n\s+- name: Checkout trusted base/u,
    'the only checkout action is pinned to the trusted base commit'
  );
  assert.equal((trustedWorkflow.match(/uses: actions\/checkout@/gu) ?? []).length, 1);
  assert.match(trustedWorkflow, /Fetch candidate as data without running checkout actions/u);
  assert.match(trustedWorkflow, /refs\/pull\/\$PR_NUMBER\/head:refs\/remotes\/pull\/\$PR_NUMBER\/head/u);
  assert.match(trustedWorkflow, /fetched_sha.*CANDIDATE_SHA/u);
  assert.equal(
    (trustedWorkflow.match(/# nosemgrep: yaml\.github-actions\.security\.pull-request-target-code-checkout\.pull-request-target-code-checkout/gu) ?? []).length,
    3,
    'only the trusted-base checkout and audited candidate fetch/materialization suppressions are present'
  );
  assert.match(trustedWorkflow, /This stores candidate Git objects only; hooks, LFS smudging, and submodules are disabled/u);
  assert.match(trustedWorkflow, /This materializes untrusted files as data; the trusted launcher isolates them before execution/u);
  assert.match(trustedWorkflow, /worktree add --detach[\s\\\S]*?\$GITHUB_WORKSPACE\/candidate[\s\\\S]*?\$CANDIDATE_SHA/u);
  assert.equal((trustedWorkflow.match(/persist-credentials: false/gu) ?? []).length, 1);
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
    assert.match(job, /Prepare reviewed launcher and npm runtime/u);
    assert.match(job, /git show "\$launcher_sha:scripts\/validation-engine\/trusted-test-launcher\.mjs"/u);
    assert.match(job, /--trusted-npm-runtime "\$RUNNER_TEMP\/questarr-trusted-validation\/\.github\/npm-runtime\/node_modules"/u);
    assert.match(job, /--install-dependencies/u);
    assert.match(job, /node "\$RUNNER_TEMP\/questarr-trusted-validation\/launcher\/trusted-test-launcher\.mjs"/u);
    assert.match(job, /--github-actions-context/u);
    assert.match(job, /BOOTSTRAP_LAUNCHER_REF: codex\/security-trusted-validation-20261013/u);
    assert.match(job, /BOOTSTRAP_LAUNCHER_SHA: [a-f0-9]{40}/u);
    assert.match(job, /git fetch --no-tags origin "refs\/heads\/\$BOOTSTRAP_LAUNCHER_REF"/u);
    assert.match(job, /git merge-base --is-ancestor "\$launcher_sha" FETCH_HEAD/u);
    assert.doesNotMatch(
      job,
      /\.bin\/npm" ci/u,
      `${name} must not unpack candidate-selected packages on the runner host`
    );
    assert.doesNotMatch(job, /run: node scripts\/validate-development\.mjs/u);
    assert.match(job, /Install Bubblewrap for isolated/u, `${name} job installs and preflights Bubblewrap`);
  }
  assert.match(testJob, /--reports-output "\$RUNNER_TEMP\/quest-codecov-reports"/u);
  assert.match(testJob, /path: \$\{\{ runner\.temp \}\}\/quest-codecov-reports/u);
});

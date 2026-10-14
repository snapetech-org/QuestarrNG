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
  assert.match(
    codecovWorkflow,
    /uses: actions\/checkout@[a-f0-9]{40}[\s\S]*?ref: \$\{\{ github\.event\.repository\.default_branch \}\}[\s\S]*?persist-credentials: false/u,
    'the privileged uploader checks out trusted default-branch code without retaining a token'
  );
  const checkoutIndex = codecovWorkflow.indexOf('uses: actions/checkout@');
  const uploadActionIndices = [...codecovWorkflow.matchAll(/uses: codecov\/codecov-action@/gu)]
    .map(({ index }) => index);
  assert.equal(uploadActionIndices.length, 2);
  assert.ok(uploadActionIndices.every((index) => index > checkoutIndex));
  assert.equal(
    (codecovWorkflow.match(/override_commit: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/gu) ?? []).length,
    2,
    'coverage and test uploads must be attributed to the triggering commit'
  );
  const checkoutStart = codecovWorkflow.indexOf(
    '- name: Check out the trusted default branch'
  );
  const coverageUploadStart = codecovWorkflow.indexOf(
    '- name: Upload coverage to Codecov'
  );
  assert.ok(
    checkoutStart >= 0 && coverageUploadStart > checkoutStart,
    'the uploader must check out trusted repository code before invoking Codecov'
  );
  const checkoutStep = codecovWorkflow.slice(checkoutStart, coverageUploadStart);
  assert.match(checkoutStep, /uses: actions\/checkout@[a-f0-9]{40}/u);
  assert.match(
    checkoutStep,
    /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/u
  );
  assert.match(checkoutStep, /persist-credentials: false/u);
  assert.doesNotMatch(
    checkoutStep,
    /workflow_run\.head_sha/u,
    'the secret-bearing job must not check out code from the triggering workflow run'
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
  const trustedRunner = trustedWorkflow
    .split('\n')
    .find((line) => line.startsWith('    runs-on: '));
  assert.ok(trustedRunner, 'trusted PR job has a runner selector');
  assert.ok(trustedRunner.includes('github.event.pull_request.head.repo.full_name == github.repository'));
  assert.ok(trustedRunner.includes("github.event.pull_request.user.login == 'snapetech'"));
  assert.ok(trustedRunner.includes("vars.TRUSTED_MAIN_RUNNERS_ENABLED == 'true'"));
  assert.ok(trustedRunner.includes('"group":"Default"'));
  assert.ok(trustedRunner.includes("|| 'ubuntu-24.04'"));
  assert.match(
    trustedWorkflow,
    /sudo apparmor_parser --replace "\$profile"/u,
    'trusted PR validation can rerun on a persistent host with an existing profile'
  );
  assert.doesNotMatch(trustedWorkflow, /\$\{\{\s*secrets\./u);
  assert.match(
    trustedWorkflow,
    /# nosemgrep: yaml\.github-actions\.security\.pull-request-target-code-checkout\.pull-request-target-code-checkout\n\s+# Fetches Git objects only; system\/global config, hooks, LFS smudging, and submodules are disabled\./u,
    'the only suppressed fetch is read-only and disables Git extension points'
  );
  assert.equal((trustedWorkflow.match(/uses:\s*actions\/checkout@/gu) ?? []).length, 0);
  assert.match(trustedWorkflow, /Fetch trusted base and candidate as data/u);
  assert.match(trustedWorkflow, /\+refs\/heads\/main:refs\/remotes\/origin\/main/u);
  assert.match(trustedWorkflow, /\+refs\/pull\/\$PR_NUMBER\/head:refs\/remotes\/pull\/\$PR_NUMBER\/head/u);
  assert.match(trustedWorkflow, /merge-base --is-ancestor "\$BASE_SHA" "\$main_sha"/u);
  assert.match(trustedWorkflow, /cat-file -e "\$BASE_SHA\^\{commit\}"/u);
  assert.match(trustedWorkflow, /fetched_candidate_sha.*CANDIDATE_SHA/u);
  assert.match(trustedWorkflow, /refs\/pull\/\$PR_NUMBER\/head:refs\/remotes\/pull\/\$PR_NUMBER\/head/u);
  assert.equal(
    (trustedWorkflow.match(/# nosemgrep: yaml\.github-actions\.security\.pull-request-target-code-checkout\.pull-request-target-code-checkout/gu) ?? []).length,
    3,
    'only the audited object fetch and two exact-commit worktree materializations suppress the checkout rule'
  );
  assert.match(trustedWorkflow, /GIT_CONFIG_NOSYSTEM=1/u);
  assert.match(trustedWorkflow, /GIT_CONFIG_GLOBAL=\/dev\/null/u);
  assert.match(trustedWorkflow, /GIT_LFS_SKIP_SMUDGE=1/u);
  assert.match(trustedWorkflow, /unset GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0 GH_TOKEN auth/u);
  assert.match(
    trustedWorkflow,
    /validation_root="\$RUNNER_TEMP\/questarr-trusted-validation-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/u,
    'each trusted validation attempt gets an isolated runner-temp workspace'
  );
  assert.match(trustedWorkflow, /\[\[ "\$GITHUB_RUN_ID" =~ \^\[0-9\]\+\$ \]\]/u);
  assert.match(trustedWorkflow, /\[\[ "\$GITHUB_RUN_ATTEMPT" =~ \^\[0-9\]\+\$ \]\]/u);
  assert.match(trustedWorkflow, /\[\[ "\$RUNNER_TEMP" == \/\* \]\]/u);
  assert.match(
    trustedWorkflow,
    /mkdir -m 700 "\$validation_root"/u,
    'the attempt workspace is created exclusively with private permissions'
  );
  assert.match(trustedWorkflow, /trusted_repo="\$validation_root\/trusted\.git"/u);
  assert.doesNotMatch(
    trustedWorkflow,
    /\$GITHUB_WORKSPACE\/(?:trusted\.git|trusted|candidate)/u,
    'persistent workspaces must not reuse fixed trusted-validation paths'
  );
  assert.match(trustedWorkflow, /Materializes only a base commit verified against main; no repository-provided hooks or filters run/u);
  assert.match(trustedWorkflow, /Materializes the exact untrusted snapshot as data; the trusted launcher isolates it before execution/u);
  assert.match(trustedWorkflow, /worktree add --detach "\$validation_root\/trusted" "\$BASE_SHA"/u);
  assert.match(trustedWorkflow, /worktree add --detach[\s\\\S]*?\$validation_root\/candidate[\s\\\S]*?\$CANDIDATE_SHA/u);
  assert.doesNotMatch(trustedWorkflow, /persist-credentials:/u);
  assert.match(
    trustedWorkflow,
    /node "\$trusted_root\/scripts\/validation-engine\/trusted-test-launcher\.mjs" "\$candidate_root"[\s\S]*?--trusted-root "\$trusted_root"[\s\S]*?--trusted-base-sha "\$VALIDATION_PR_BASE_SHA"[\s\S]*?--candidate-sha "\$VALIDATION_PR_HEAD_SHA"[\s\S]*?--install-dependencies[\s\S]*?--receipt-output "\$validation_root\/receipts\/test\.json"[\s\S]*?node \/mnt\/trusted-validation\/scripts\/validate-development\.mjs[\s\S]*?--root \/mnt\/workspace[\s\S]*?--tests-only/u
  );
  assert.match(
    trustedWorkflow,
    /node "\$validation_root\/trusted\/scripts\/validation-engine\/reconcile-ci\.mjs"[\s\S]*?--receipt "\$validation_root\/receipts\/test\.json"/u
  );
  assert.match(
    trustedWorkflow,
    /Clean trusted validation workspace[\s\S]*?if: always\(\)[\s\S]*?validation_root="\$RUNNER_TEMP\/questarr-trusted-validation-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"[\s\S]*?if \[\[ -L "\$validation_root" \]\][\s\S]*?rm -rf -- "\$validation_root"/u,
    'the exact per-attempt workspace is removed after both success and failure'
  );
});

test('CI receipt reconciliation downloads only artifacts from the current attempt', () => {
  assert.match(
    ciWorkflow,
    /pattern: validation-receipt-\*-attempt-\$\{\{\s*github\.run_attempt\s*\}\}/u
  );
});

test('cancelled superseded pull-request runs release the CI concurrency slot', () => {
  const reconcileJob = jobBlock(ciWorkflow, 'reconcile-validation', 'docker-build');
  assert.match(reconcileJob, /if: always\(\) && !cancelled\(\)/u);
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
    assert.match(job, /BOOTSTRAP_LAUNCHER_REF: questarr-validation-launcher-20261013/u);
    assert.match(job, /BOOTSTRAP_LAUNCHER_SHA: [a-f0-9]{40}/u);
    assert.match(job, /git fetch --no-tags origin "refs\/tags\/\$BOOTSTRAP_LAUNCHER_REF"/u);
    assert.match(job, /fetched_launcher_sha="\$\(git rev-parse 'FETCH_HEAD\^\{commit\}'\)"/u);
    assert.match(job, /\[ "\$fetched_launcher_sha" != "\$launcher_sha" \]/u);
    assert.match(job, /git cat-file -e "\$launcher_sha:scripts\/install-npm-runtime\.mjs"/u);
    assert.match(job, /git archive --format=tar "\$launcher_sha"/u);
    assert.doesNotMatch(
      job,
      /git archive --format=tar "\$TRUSTED_BASE_SHA"/u,
      `${name} must load the npm runtime from the same reviewed revision as its launcher`
    );
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

test('trusted main CI uses a readiness-gated runner-group object selector', () => {
  const mainCondition =
    "(github.event_name == 'push' || github.event_name == 'workflow_dispatch') && " +
    "github.ref == 'refs/heads/main'";
  const trustedRunnerJson =
    '{"group":"trusted-main","labels":["self-hosted","Linux","X64","host"]}';
  const expected =
    "$" + "{{ " + mainCondition +
    " && vars.TRUSTED_MAIN_RUNNERS_ENABLED == 'true' && fromJSON('" + trustedRunnerJson + "') || 'ubuntu-latest' }}";
  const selectors = ciWorkflow.split('\n').filter((line) =>
    line.startsWith('    runs-on: ') && line.includes("fromJSON('" + trustedRunnerJson + "')")
  );
  assert.equal(selectors.length, 2);
  assert.deepEqual(selectors, [
    `    runs-on: ${expected}`,
    `    runs-on: ${expected}`
  ]);
  assert.ok(selectors.every((line) => line.includes("|| 'ubuntu-latest'")));
});

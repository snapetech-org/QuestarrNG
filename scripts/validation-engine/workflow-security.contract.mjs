// Copyright (c) QuestarrNG contributors. All rights reserved.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
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
const deployWorkflow = readFileSync(
  fileURLToPath(new URL('deploy.yml', workflowDirectory)),
  'utf8'
);
const readme = readFileSync(fileURLToPath(new URL('../../README.md', import.meta.url)), 'utf8');
const imageReferenceFiles = [
  'README.md',
  'docker-compose.yml',
  'docker-compose.postgres.yml',
  'casaos/docker-compose.yml',
  'cosmos/questarr.cosmos-compose.json',
  'doezer-questarr/docker-compose.yml',
  'unraid/questarr.xml',
  'questarr/Dockerfile',
  'charts/questarr/values.yaml',
  'charts/questarr/README.md',
  'docs/HOME_SERVER_APPS.md',
  'docs/REVERSE_PROXY.md',
  'docs/SBOM.md',
  'docs/VEX.md',
  'scripts/__tests__/verify-release-image-manifest.test.mjs',
].map((file) => [
  file,
  readFileSync(fileURLToPath(new URL(`../../${file}`, import.meta.url)), 'utf8'),
]);
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

test('production image releases require a version-tag push', () => {
  const imageWorkflow = load(releaseWorkflow);
  assert.deepEqual(imageWorkflow.on.push, { tags: ['v*'] });
  assert.match(
    imageWorkflow.jobs.publish.if,
    /github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/v'\)/u
  );
  assert.doesNotMatch(imageWorkflow.jobs.publish.if, /workflow_dispatch/u);
  assert.match(imageWorkflow.jobs.release.if, /startsWith\(github\.ref, 'refs\/tags\/v'\)/u);
  const publishJob = jobBlock(releaseWorkflow, 'publish', 'addon-smoke');
  const imageTagsStart = publishJob.indexOf('- name: Set image tags');
  const imageTagsEnd = publishJob.indexOf('- name: Set up QEMU for ARM64 release images', imageTagsStart);
  assert.ok(imageTagsStart >= 0 && imageTagsEnd > imageTagsStart);
  const imageTagsStep = publishJob.slice(imageTagsStart, imageTagsEnd);
  assert.match(imageTagsStep, /refs\/tags\/v\*/u);
  assert.match(imageTagsStep, /Production image publication requires a version tag push/u);
  assert.doesNotMatch(imageTagsStep, /release_tag=latest/u);
  const smokeIndex = publishJob.indexOf('Smoke test published image and SeerrNG route');
  const attachIndex = publishJob.indexOf('Attach publish tag after scans and smoke test pass');
  assert.ok(smokeIndex >= 0 && attachIndex > smokeIndex);
  assert.match(publishJob.slice(attachIndex), /for tag in "\$RELEASE_TAG" latest/u);

  const deployConfig = load(deployWorkflow);
  assert.deepEqual(deployConfig.on.workflow_dispatch.inputs.environment.options, ['dev', 'test']);
  assert.equal(
    deployConfig.jobs['build-and-push'].environment,
    "${{ inputs.environment == 'test' && 'test' || 'dev' }}"
  );
  const tagPolicy = deployConfig.jobs['build-and-push'].steps.find(
    (step) => step.name === 'Keep production release tags on the version-tag workflow'
  );
  assert.ok(tagPolicy, 'manual deployments reject production release aliases');
  assert.match(tagPolicy.run, /DEPLOY_ENVIRONMENT.*production/u);
  assert.match(tagPolicy.run, /IMAGE_TAG.*v\*/u);
  const metadata = deployConfig.jobs['build-and-push'].steps.find((step) => step.id === 'meta');
  assert.ok(metadata, 'manual deployment images have an explicit metadata step');
  assert.doesNotMatch(metadata.with.tags, /value=latest|value=production/u);
  assert.match(metadata.with.tags, /inputs\.tag != ''/u);
});

test('release publishing and announcements are gated to QuestarrNG by stable repository ID', () => {
  assert.equal(
    (releaseWorkflow.match(/github\.repository_id == '1388297896'/gu) ?? []).length,
    5,
    'all five release and recovery jobs use the stable repository ID'
  );
  for (const [name, nextName] of [
    ['publish', 'addon-smoke'],
    ['addon-smoke', 'release'],
    ['finalize-release', 'update-finalized-changelog'],
    ['update-finalized-changelog', 'announce-release'],
    ['announce-release', undefined],
  ]) {
    assert.match(
      jobBlock(releaseWorkflow, name, nextName),
      /github\.repository_id == '1388297896'/u,
      `${name} is guarded by the stable repository ID`
    );
  }
  assert.doesNotMatch(releaseWorkflow, /github\.repository == 'snapetech\/QuestarrNG'/u);
  assert.match(releaseWorkflow, /name=ghcr\.io\/\$\{GITHUB_REPOSITORY,,\}/u);
  assert.match(releaseWorkflow, /image="ghcr\.io\/\$\{GITHUB_REPOSITORY,,\}"/u);
  assert.equal(
    (releaseWorkflow.match(/ghcr\.io\/\$\{GITHUB_REPOSITORY,,\}:\$\{VERSION\}/gu) ?? []).length,
    2,
    'the recovered release notes and pull command must use the current repository image package'
  );
  assert.equal(
    (releaseWorkflow.match(/https:\/\/github\.com\/orgs\/snapetech-org\/packages\/container\/package\/questarrng/gu) ?? []).length,
    2,
    'regular and recovered release notes must link to the organization package'
  );
  assert.match(releaseWorkflow, /Container image.*\$\{IMAGE\}:\$\{VERSION\}/u);
  assert.doesNotMatch(releaseWorkflow, /ghcr\.io\/snapetech\/questarrng/u);
  assert.match(deployWorkflow, /ghcr\.io\/\$\{\{ github\.repository \}\}/u);
  assert.match(trustedDiscordWorkflow, /github\.repository_id == '1388297896'/u);
  assert.match(
    trustedDiscordWorkflow,
    /--arg image "ghcr\.io\/\$\{GITHUB_REPOSITORY,,\}:\$\{version\}"/u
  );
  assert.doesNotMatch(trustedDiscordWorkflow, /github\.repository == 'snapetech\/QuestarrNG'/u);
  assert.match(
    readme,
    /https:\/\/github\.com\/orgs\/snapetech-org\/packages\/container\/package\/questarrng/u
  );
  assert.match(readme, /ghcr\.io\/snapetech-org\/questarrng/u);
});

test('current install and deployment examples use the organization GHCR namespace', () => {
  for (const [file, contents] of imageReferenceFiles) {
    assert.match(contents, /ghcr\.io\/snapetech-org\/questarrng/u, `${file} uses the current image`);
    assert.doesNotMatch(contents, /ghcr\.io\/snapetech\/questarrng/u, `${file} has no stale image path`);
  }
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

test('Windows service builds install the SDK in the runner temp directory', () => {
  const serviceJob = jobBlock(ciWorkflow, 'windows-service', 'test');
  const setupDotnet = load(ciWorkflow).jobs['windows-service'].steps.find(
    (step) => step.name === 'Setup .NET 10 SDK'
  );
  const steps = load(ciWorkflow).jobs['windows-service'].steps;
  const verifySdk = steps.find((step) => step.name === 'Verify selected .NET SDK');
  const restore = steps.find(
    (step) => step.name === 'Restore locked Windows service dependencies'
  );
  const publish = steps.find(
    (step) => step.name === 'Publish self-contained Windows service host'
  );

  assert.match(serviceJob, /uses: actions\/setup-dotnet@[a-f0-9]{40}/u);
  assert.match(serviceJob, /global-json-file: global\.json/u);
  assert.equal(setupDotnet.env.DOTNET_INSTALL_DIR, '${{ runner.temp }}/dotnet');
  assert.equal(verifySdk.run, '"$RUNNER_TEMP/dotnet/dotnet" --version');
  assert.equal(
    restore.run,
    '"$RUNNER_TEMP/dotnet/dotnet" restore installer/windows/Questarr.Service/Questarr.Service.csproj --runtime win-x64 --locked-mode'
  );
  assert.match(
    publish.run,
    /^"\$RUNNER_TEMP\/dotnet\/dotnet" publish installer\/windows\/Questarr\.Service\/Questarr\.Service\.csproj/u
  );
});

test('scheduled dependency and Helm workflows cancel only superseded runs for the same PR', () => {
  const expectedGroup = [
    '${{ github.workflow }}',
    '${{ github.event.pull_request.number || github.run_id }}',
  ].join('-');
  const expectedCancel = "${{ github.event_name == 'pull_request' }}";
  for (const file of ['deprecated-deps.yml', 'helm-chart.yml']) {
    const workflow = load(
      readFileSync(fileURLToPath(new URL(file, workflowDirectory)), 'utf8')
    );

    assert.ok(workflow.on.pull_request, `${file} must retain its PR trigger`);
    assert.deepEqual(workflow.concurrency, {
      group: expectedGroup,
      'cancel-in-progress': expectedCancel,
    });
  }
});

test('Dependabot groups NuGet and Docker minor/patch updates without grouping majors or security updates', () => {
  const dependabot = load(
    readFileSync(fileURLToPath(new URL('../../.github/dependabot.yml', import.meta.url)), 'utf8')
  );
  for (const ecosystem of ['nuget', 'docker']) {
    const updates = dependabot.updates.filter((entry) => entry['package-ecosystem'] === ecosystem);
    assert.ok(updates.length > 0, `${ecosystem} updates must be configured`);
    const groupName = ecosystem === 'nuget' ? 'nuget-minor-patch' : 'docker-minor-patch';

    for (const update of updates) {
      assert.deepEqual(update.groups[groupName], {
        'applies-to': 'version-updates',
        patterns: ['*'],
        'update-types': ['minor', 'patch'],
      });
      assert.equal(update.groups['security-updates']['applies-to'], 'security-updates');
    }
  }

  assert.deepEqual(
    dependabot.updates
      .filter((entry) => entry['package-ecosystem'] === 'docker')
      .map((entry) => entry.directory),
    ['/', '/questarr'],
  );
});

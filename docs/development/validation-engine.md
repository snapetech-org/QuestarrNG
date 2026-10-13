# Development validation engine

QuestarrNG's validation engine binds each check to the exact Git checkout and
native test inventory it saw before execution. It runs the existing npm, Vitest,
Playwright, TypeScript, and build commands; it does not replace their assertions
or coverage thresholds.

Run the default local gate with:

```sh
node scripts/validate-development.mjs
```

Inspect discovery without running checks, or select only registered test tasks:

```sh
node scripts/validate-development.mjs --plan --json
node scripts/validate-development.mjs --tests-only
node scripts/validate-development.mjs --task vitest-coverage
node scripts/validate-development.mjs --task playwright-e2e
```

The plan reports the repository source identity, test files and lane counts,
task dependencies, runtime versions, and unavailable prerequisites. A plan is
discovery evidence only. Executed runs create a private directory below the
system temporary directory containing one log per task and a JSON receipt with
executed, passed, failed, blocked, excluded, and active-case totals. A workspace
lock prevents two engine runs from competing over the same checkout. A stale
lock is reported and left for an operator to inspect.
When a native test task fails or reports no active cases, the CLI prints a
control-character-stripped diagnostic excerpt of at most 16 KiB to standard
error, with each output line prefixed so test output cannot issue GitHub Actions
workflow commands. It does not upload the private task log.

Runtime probes and child commands use a sanitized environment with `PATH`,
platform variables, locale and timezone settings, and the version-manager paths
needed to find host-installed runtimes (`ASDF_DIR`, `ASDF_DATA_DIR`,
`MISE_HOME`, `MISE_DATA_DIR`, `NVM_DIR`, and `VOLTA_HOME`). When these data
directories are unset, the engine uses the original home's `.asdf` directory
for ASDF when it exists, otherwise `ASDF_DIR` or the same default path. It
derives mise's from `XDG_DATA_HOME`, `LOCALAPPDATA`, or the original home as
appropriate. Task-specific values come from that task's configuration;
inherited values outside the base allowlist require an approved task-scoped
`passEnv` entry. Runtime probes use a private temporary home and separate empty
npm configuration files, preventing the npm version check from reading a
project or host `.npmrc`. Each task receives
run-owned home, temporary, and XDG configuration/cache directories. `CI` is
forced to `true`, and test tasks use `NODE_ENV=test` so ambient credentials,
proxy settings, loader options, and workflow context do not leak into test
processes. Task environment directories are removed when each command finishes,
leaving logs and the receipt as the run's retained evidence.

Hosted CI uses a runner-local npm cache with `setup-node` and passes its path
only to the dependency-install task. The trusted launcher copies the cache into
a private run directory, validates the candidate lockfile, and prefetches
packages inside Bubblewrap with lifecycle scripts disabled; the actual
validation run uses the private cache offline. Only dependency installation can
reach the network. Its sandbox has no secrets or host data paths and uses
synthetic hosts/NSS files plus a copy of the host resolver configuration for
registry DNS. Validation runs with synthetic resolver settings and no network.
Local runs without an explicit cache create one under their temporary home,
which is removed with the task environment.

The in-repository CLI imports candidate JavaScript before task subprocesses
start. For an unreviewed checkout, do not run its CLI directly on the host.
Use a separate clean trusted clone checked out at a reviewed commit; do not use
the unreviewed candidate checkout as `TRUSTED_REPO`. Copy
`trusted-test-launcher.mjs`, `trusted-test-sandbox-policy.mjs`, and
`trusted-test-source-policy.mjs` from that same revision to a location outside
the candidate checkout, keeping all three files together, then use the trusted
copy to run focused Node contract tests:

```sh
TRUSTED_REPO=/path/to/clean-trusted-checkout
# Replace this with the full SHA of the reviewed commit in that checkout.
TRUSTED_REV=REVIEWED_FULL_COMMIT_SHA
mkdir -p /tmp/trusted-validation-launcher
git -C "$TRUSTED_REPO" show \
  "$TRUSTED_REV:scripts/validation-engine/trusted-test-launcher.mjs" \
  > /tmp/trusted-validation-launcher/trusted-test-launcher.mjs
git -C "$TRUSTED_REPO" show \
  "$TRUSTED_REV:scripts/validation-engine/trusted-test-sandbox-policy.mjs" \
  > /tmp/trusted-validation-launcher/trusted-test-sandbox-policy.mjs
git -C "$TRUSTED_REPO" show \
  "$TRUSTED_REV:scripts/validation-engine/trusted-test-source-policy.mjs" \
  > /tmp/trusted-validation-launcher/trusted-test-source-policy.mjs
node /tmp/trusted-validation-launcher/trusted-test-launcher.mjs "$PWD" -- node --test \
  scripts/validation-engine/engine.contract.mjs \
  scripts/validation-engine/trusted-test-launcher.contract.mjs \
  scripts/validation-engine/workflow-security.contract.mjs
```

The launcher snapshots the candidate and enters bubblewrap before loading its
JavaScript. It copies only paths recorded in the Git index; untracked and
ignored checkout files, including a local `auth.json`, never enter the snapshot.
Dotted and extensionless credential names, private/API keys,
access/refresh-token names, client-secret names, suffixed dotenv credentials
such as \`tokens.env.local\` and \`secrets.env.production\`, and credential
material with source-like extensions are excluded. Safe example templates such
as \`tokens.env.example\` and source modules under credential folders remain
available unless their own names identify credential material. The tracked
`server/routes/api-keys.ts` route, Helm Secret template, and `docs/SECRETS.md`
are explicitly preserved because they are implementation, chart, and
documentation files rather than stored credentials. Stage new candidate files
before using the launcher. It hides the invoking
home, temporary files, common service sockets, host configuration under `/etc`,
and common host data roots such as `/opt`, `/srv`, and `/usr/local`, then
unshares external networking. The sandbox provides a synthetic `/etc/hosts`
containing only `localhost` and a resolver configuration with no nameserver, so
tests can use isolated loopback sockets while host services, host DNS settings,
and external networks remain unavailable. If the checkout is outside those standard roots, it also masks
the checkout's parent so candidate code cannot reach the original worktree
around the filtered snapshot. When that parent overlaps a system runtime mount,
it masks the checkout path itself and reapplies that mask after system binds.
It rejects a checkout that contains a system runtime mount because rebinding the
runtime would otherwise expose the original checkout again.
Canonical system-mount sources are checked against every hidden path too.
Sources inside a masked root, or sources broad enough to include a separate
hidden host root, fail closed. If a source contains the checkout itself, the
launcher masks its mapped destination path after binding, including when a
runtime alias such as `/bin` resolves to `/usr/bin`.
Snapshot files are force-added to the temporary Git index so candidate ignore
rules cannot drop tracked files. Before those paths are masked, the trusted
launcher opens each workspace, run-data, dependency, cache, and marker source as
an inherited file descriptor. Bubblewrap binds those pinned descriptors after
applying the host masks, so source resolution does not depend on paths that the
sandbox has already hidden. In local launcher mode, the complete `node_modules`
tree is mounted read-only without filtering, so use only a trusted installed
dependency tree that contains no credentials or other local secrets. Trusted
CI mode does not mount candidate `node_modules`; it installs from a validated
lockfile using the trusted npm runtime and private offline cache inside the
sandbox. The host root is not mounted. The sandbox adds only the system paths
required to run Node and its tools; a versioned Node installation is mounted as one directory so
`bin/node` and sibling `lib/node_modules/npm` continue to resolve together.
OS-managed Node under `/usr` uses the explicit system-path allowlist instead.
The launcher fails closed if it cannot identify one of these runtime layouts,
if required isolation is unavailable, or if no candidate command is supplied.

The regular CI test and build jobs use `--github-actions-context` to pass only
the non-secret workflow identity fields into the isolated engine. The launcher
checks that `GITHUB_SHA` matches the checked-out commit and records it as the
candidate identity, so exact-run receipt reconciliation remains valid after the
candidate files are copied into the disposable snapshot. GitHub tokens and
other runner environment values remain outside the candidate sandbox.

The `trusted-pr-validation` workflow is loaded from the pull-request base. It
fetches `main` and the pull-request head as Git objects, verifies that the event
base is in `main` history and that the fetched head matches the event SHA, then
materializes both exact commits as worktrees. It runs the base revision's
validator against a read-only candidate snapshot in Bubblewrap. The narrowly
scoped Semgrep suppressions cover only that audited object fetch and the two
exact-commit worktree materializations; workflow contracts enforce disabled
hooks, LFS smudging and submodules, exact SHAs, and isolated execution.
Candidate dependency URLs are restricted to `registry.npmjs.org`; dependency archives are
unpacked inside Bubblewrap with install scripts disabled, and validation runs
offline with no GitHub token or repository secrets in the sandbox. Synthetic
host and resolver files support local socket tests without restoring host
network or DNS settings. Regular test and build jobs also use the reviewed launcher, prefetch dependencies inside
Bubblewrap, and produce source-bound receipts. Coverage and JUnit files are
copied to the short-lived artifact with size and symlink checks. On Ubuntu 24.04, the job
loads an ephemeral AppArmor profile attached to `/usr/bin/bwrap` so Bubblewrap
can create its namespace while the runner-wide unprivileged-user-namespace
restriction stays enabled. Local runs may skip the integration check when
Bubblewrap is unavailable. Use the complete GitHub-hosted validation run for
the full test suite.

The regular pull-request CI workflow contains no Codecov secret reference. It
uploads reports as a short-lived artifact only on pushes to `main`; a separate
`workflow_run` workflow loaded from the default branch uploads that artifact to
Codecov only for a same-repository `push` to `main`, in the `codecov-main`
environment. The uploader checks out trusted default-branch code and uses the
triggering run's SHA as Codecov's `override_commit`; it does not check out the
workflow-run source in the secret-bearing job. GitHub restricts that environment
to `main`. Store
`CODECOV_TOKEN`, if configured, as an environment secret there rather than as a
repository or organization secret. A pull-request edit to CI therefore cannot
make the Codecov token available to candidate tests. Discord tag announcements
also use a default-branch `workflow_run` workflow, gated to successful
same-repository tag runs from the exact QuestarrNG image workflow. The
`discord-release` environment is restricted to `main`, and the tag workflow
checks out trusted default-branch tooling.

When a release branch predates the validation engine, test and build jobs use
the permanent `questarr-validation-launcher-20261013` tag to fetch the reviewed
bootstrap launcher. The workflow verifies that the tag resolves to its pinned
commit, so deleting the pull-request branch does not break older release jobs.
The npm runtime installer and lockfiles are archived from the same selected
trusted revision as the launcher: the base commit when it contains the engine,
or the pinned bootstrap commit for an older base.

During a run, the engine writes a task summary to stderr when each task starts
and finishes, and repeats it every minute while a task is still running. This
keeps progress visible in a terminal or live GitHub Actions log without mixing
status text into the final JSON summary on stdout. Native case counts are
authoritative when each native command finishes; the heartbeat reports task
status and elapsed time while that command is running.

The GitHub workflow runs the full Vitest suite once on Node 26 and checks the
production build on Node 22 and Node 26. Each run exports a short-lived,
source-bound receipt. The final reconciliation job requires one passing test
receipt and both passing build receipts from the same repository, source tree,
test inventory, workflow run, and attempt. It also checks that every Vitest
inventory lane ran with nonzero test cases. A retry cannot satisfy the gate
with receipts from an earlier attempt. The test job still enforces the existing
coverage thresholds and uploads its JUnit and coverage results through the
trusted Codecov workflow.

Playwright E2E stays opt-in in local runs because it installs and launches a real
browser. Select `--task playwright-e2e` to include the browser installation and
test tasks. Do not use live external accounts or production databases for local
validation.

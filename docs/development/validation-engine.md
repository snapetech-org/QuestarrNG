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

Runtime probes and child commands inherit only the executable path, platform
process variables, locale, and timezone. Each task receives run-owned home,
temporary, and XDG configuration/cache directories; registered task settings
remain task-scoped. Unapproved `passEnv` requests fail during planning. `CI` is
forced to `true`, and test tasks use
`NODE_ENV=test` so ambient credentials, proxy settings, loader options, and
workflow context do not leak into test processes. Task environment directories
are removed when each command finishes, leaving logs and the receipt as the
run's retained evidence. CI explicitly shares the runner-local npm cache
between `setup-node` and the dependency-install task; only that task receives
the cache path, and local runs without it use a cache under their temporary home
that is removed with the task environment.

The in-repository CLI imports candidate JavaScript before task subprocesses
start. For an unreviewed checkout, do not run its CLI directly on the host.
Use a separate clean trusted clone checked out at a reviewed commit; do not use
the unreviewed candidate checkout as `TRUSTED_REPO`. Copy both
`trusted-test-launcher.mjs` and `trusted-test-sandbox-policy.mjs` from that same
revision to a location outside the candidate checkout, keeping them together,
then use the trusted copy to run focused Node contract tests:

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
node /tmp/trusted-validation-launcher/trusted-test-launcher.mjs "$PWD" -- node --test \
  scripts/validation-engine/engine.contract.mjs \
  scripts/validation-engine/trusted-test-launcher.contract.mjs \
  scripts/validation-engine/workflow-security.contract.mjs
```

The launcher snapshots the candidate and enters bubblewrap before loading its
JavaScript. It copies only paths recorded in the Git index; untracked and
ignored checkout files, including a local `auth.json`, never enter the snapshot.
Stage new candidate files before using the launcher. It hides the invoking
home, temporary files, common service sockets, host configuration under `/etc`,
and common host data roots such as `/opt`, `/srv`, and `/usr/local`, then disables
network access. If the checkout is outside those standard roots, it also masks
the checkout's parent (or the checkout itself if it sits directly under `/`),
so candidate code cannot reach the original worktree around the filtered
snapshot. The complete `node_modules` tree is mounted read-only without filtering,
so use only a trusted installed dependency tree that contains no credentials or
other local secrets. The host root is otherwise visible read-only, so use this
launcher only on a machine where other system-wide readable files do not contain
secrets. It fails before starting candidate code if the required isolation is
unavailable. Use the complete GitHub-hosted validation run for the full test
suite. The test job does not receive the Codecov upload token for pull requests;
coverage and test-result uploads run only after trusted pushes to `main`.

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
coverage thresholds and uploads its JUnit and coverage results to Codecov.

Playwright E2E stays opt-in in local runs because it installs and launches a real
browser. Select `--task playwright-e2e` to include the browser installation and
test tasks. Do not use live external accounts or production databases for local
validation.

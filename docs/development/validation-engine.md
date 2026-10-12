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

Local execution of test tasks requires the trusted Linux bubblewrap launcher.
When evaluating an unreviewed branch, copy `trusted-test-launcher.mjs` from a
reviewed revision to a location outside the checkout and run:

```sh
node /path/to/trusted-test-launcher.mjs "$PWD" -- node scripts/validate-development.mjs --tests-only
```

Run planning for an unreviewed candidate through that launcher too, because
planning imports its validation configuration. GitHub Actions remains
responsible for hosted validation.

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

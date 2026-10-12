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

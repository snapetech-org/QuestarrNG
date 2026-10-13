# Agent instructions - QuestarrNG

## Communication and authority

- Be direct and accurate. Correct a premise when evidence supports doing so; say when a result is unknown.
- Use explicit confidence levels for claims and estimates: high, moderate, low, or unknown.
- Separate implementation, automated verification, visual inspection, and live-service evidence.
- Preserve upstream attribution and follow the repository license and pull request template.
- Do not publish, merge, deploy, or release without maintainer authorization. Authorization for a named action does not cover unrelated actions.

<!-- headroom:rtk-instructions -->

## RTK (Rust Token Killer) - Token-Optimized Commands

When running shell commands, **always prefix with `rtk`**. This reduces context
usage by 60-90% with zero behavior change. If rtk has no filter for a command,
it passes through unchanged, so it is always safe to use.

## Key Commands

```bash
# Git (59-80% savings)
rtk git status          rtk git diff            rtk git log

# Files & Search (60-75% savings)
rtk ls <path>           rtk read <file>          rtk grep <pattern>
rtk find <pattern>      rtk diff <file>

# Test (90-99% savings) — shows failures only
rtk pytest tests/       rtk cargo test           rtk test <cmd>

# Build & Lint (80-90% savings) — shows errors only
rtk tsc                 rtk lint                 rtk cargo build
rtk prettier --check    rtk mypy                 rtk ruff check

# Analysis (70-90% savings)
rtk err <cmd>           rtk log <file>           rtk json <file>
rtk summary <cmd>       rtk deps                 rtk env

# GitHub (26-87% savings)
rtk gh pr view <n>      rtk gh run list          rtk gh issue list

# Infrastructure (85% savings)
rtk docker ps           rtk kubectl get          rtk docker logs <c>

# Package managers (70-90% savings)
rtk pip list            rtk pnpm install         rtk npm run <script>
```

## Rules

- In command chains, prefix each segment: `rtk git add . && rtk git commit -m "msg"`
- For debugging, use a raw command without the rtk prefix.
- `rtk proxy <cmd>` runs a command without filtering but tracks usage.

<!-- /headroom:rtk-instructions -->

## Required project reading

- Read README.md, docs/GITHUB_DOCUMENTATION.md, and docs/FORK_CHANGES.md before product changes.
- Read docs/API.md and docs/SEERRNG-INTEGRATION.md before changing the catalog or request-scoped acquisition contract.
- Read docs/DATABASE.md before changing database schemas, migrations, or backend configuration.
- Read docs/IMPORTS.md and docs/SECURITY.md before changing archive handling, import processing, or security boundaries.
- Read docs/development/validation-engine.md before selecting or reporting checks.
- Read release-notes/README.md before preparing user-facing, security, operational, or user-facing documentation changes.

## QuestarrNG boundaries and invariants

- QuestarrNG is a Node.js game manager. The .NET 10 executable is the Windows service host, not the application backend.
- Keep upstream Doezer/Questarr as a read-only reference. Preserve attribution and keep fork-specific behavior in this repository.
- The SeerrNG integration is versioned and request-scoped. Preserve the request ID and selected operating system and architecture through acquisition, tracking, cancellation, retry, and file delivery.
- A restart during handoff can leave it unclear whether a download already exists. Preserve the duplicate-download check and confirmationRequired conflict response; do not retry or cancel an ambiguous active download automatically.
- Completed files remain on disk when a request is canceled. Refuse operations that cannot be safely correlated to the original request.
- Emulation acquisition is not supported by QuestarrNG. Do not claim PC-game routes or tests cover ROM acquisition.
- SQLite is the default database and PostgreSQL is supported. Schema or migration changes must keep the backend definitions and generated migrations in parity for both databases.
- Archive extraction and import are security boundaries. Preserve path validation and optional scanner behavior; do not weaken them to make a fixture pass.
- Use disposable databases, download fixtures, and fake provider responses. Never run tests against live user data, provider accounts, download queues, or a production database.

## Validation and UI evidence

- The complete local validation entry point is node scripts/validate-development.mjs. Read the validation-engine guide for task selection and reporting.
- The --plan option is discovery only. It does not mean tests passed. The --tests-only selection excludes separately selected browser E2E tasks; report the actual tasks and case totals.
- For focused TypeScript changes, use the relevant npm check, lint, format, or test scripts from package.json. Use the complete engine gate for a complete validation request.
- npm run dev:test removes and recreates data/test.db. Use only the disposable test database and port it configures; never point it at a live data directory.
- Any pull request that touches client/src/** must include a screenshot or short recording of the running change in the PR description before opening or updating the PR. Launch npm run dev:test and use a headless browser to capture the changed page. Automated tests and type checking do not prove the UI renders as intended.
- The pull request template asks for the full AI model name and thinking level when AI was used. State the model and the available reasoning level accurately; do not guess a level that the interface does not expose.

## Release notes

Every user-facing behavior, security, operational, or user-facing documentation change needs a new validated fragment under release-notes/. Keep shipped fragments append-only, and use the preview command in release-notes/README.md. For internal-only changes, include release-note: none in the PR description.

# Contributing to QuestarrNG

Thank you for your interest in contributing to QuestarrNG! We welcome contributions from the community.

Report bugs and request enhancements in the [QuestarrNG issue tracker](https://github.com/snapetech/QuestarrNG/issues). Contributions are submitted as pull requests against `main`; include a clear summary, link related issues, and wait for the required checks and maintainer review before merging.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/QuestarrNG.git`
3. Create a new branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test your changes thoroughly
6. Commit with clear messages: `git commit -m "Add feature: description"`
7. Push to your fork: `git push origin feature/your-feature-name`
8. Open a Pull Request
   Note: do not merge into your own branch if you intend to do a PR

## Development Guidelines

```bash
# Run development server with hot reload
npm run dev

# Type check
npm run check

# Run tests (one-shot)
npm run test:run

# Lint code
npm run lint

# Format code
npm run format
```

### Code Style

- Follow the existing TypeScript and React patterns in the codebase
- Use Tailwind CSS for styling (follow the design guidelines)
- Run `npm run lint` and `npm run format` before committing
- Ensure `npm run check` passes without TypeScript errors

### Testing

- Add tests for new features when applicable
- Run `npm run test:run` to ensure all tests pass
- Test UI changes in both light and dark themes (currently dark-first)

#### What the tests cover

- **Unit/integration tests** (`server/__tests__/`, `client/src/__tests__/`, `client/src/lib/__tests__/`, `client/__tests__/`) run under Vitest. Server tests run in a Node environment against an in-memory SQLite database and exercise routes, storage queries, indexer/downloader clients, SSRF protections, and cron jobs directly. Client tests run in jsdom with `@testing-library/react` and cover component rendering and behavior.
- **End-to-end tests** (`tests/e2e/`) run under Playwright against a real running instance of the app (`npm run dev:test`, served on port 5100). They log in through a `setup` project that saves auth state, then exercise real user flows (pages, forms, navigation) through a browser.

#### Running tests locally

```bash
# Run the full unit/integration suite once
npm run test:run

# Watch mode while developing
npm run test:watch

# Generate a coverage report (HTML output in coverage/)
npm run test:coverage

# Run a single test file
npx vitest run server/__tests__/api_routes.test.ts

# Run tests matching a name pattern
npx vitest -t "pattern"

# E2E tests: start the test server in one terminal, then run Playwright in another
npm run dev:test
npm run test:e2e
```

`npm run dev:test` resets and seeds a dedicated test database (`data/test.db`) and starts the server on port 5100 — this must be running before `npm run test:e2e` is started, since Playwright drives the real app rather than mocks.

**Interpreting results:** Vitest prints a pass/fail count per file, with failing assertions showing expected vs. actual values and a stack trace to the failing line. Playwright prints a per-spec pass/fail list and, on failure, writes an HTML report (open with `npx playwright show-report`) containing traces and screenshots for failed steps — check the trace first, since it shows the exact point the app diverged from the expected state. A red run almost always means either a genuine regression or an environment issue (stale test DB, port already in use, missing env vars) — rule out the latter before assuming the code is wrong.

#### Running tests in CI

`.github/workflows/ci.yml` runs on every push and pull request to `main` and
`release/*` branches and can be triggered manually. It checks documentation
changes as well as code changes. Its jobs cover release-note validation,
dependency and secret scanning, Windows service publishing, unit tests, linting,
type checking, application builds, and Docker image builds:

- `release-notes`: verifies that each non-bot pull request adds a validated release-note fragment or explicitly opts out.
- `sca-scan`: `npm run secretlint`, `npm run check:overrides`, the full dependency `npm audit` gate and the production license allow-list.
- `windows-service`: restores and publishes the locked Windows service host.
- `test`: the whole Vitest suite with coverage, in one job:

  ```bash
  npm test -- --coverage --reporter=default --reporter=junit --outputFile.junit=test-report.junit.xml
  ```

  The reviewed sandbox launcher runs the source-bound plan with an offline npm
  cache and installs dependencies inside Bubblewrap. Coverage thresholds come
  from `vitest.config.ts`; reports are exported as a short-lived artifact and a
  default-branch `workflow_run` uploads them to Codecov only for trusted pushes
  to `main`.

- `build`: the reviewed sandbox launcher runs `npm run lint`, `npm run check`
  (TypeScript) and `npm run build` with offline dependencies, on Node 22.19.0
  (plus 26.x on pushes to `main`/`release/*`).
- `docker-build`: builds the image. It always runs on pushes; on a PR it runs when the PR touches the `Dockerfile`, `.dockerignore`, `entrypoint.sh`, `package*.json`, `requirements/`, migrations or `ci.yml`.

Playwright E2E tests run in `.github/workflows/e2e.yml`. A new push to a PR cancels the CI, E2E, CodeQL and SAST runs still going for its previous commit.

**Interpreting a CI failure:** check the "Tests" step logs first for the failing test name and assertion; a failure in `lint` or `check` instead means a style or type error, not a broken test — fix those before re-pushing. If the Codecov upload step fails but the tests themselves passed, that's usually a Codecov/token issue rather than a code problem.

#### Test policy for major changes

Not every change needs new tests, but treat the following as **major changes** that require adding or updating tests before merging:

- New API endpoints or changes to existing endpoint behavior (request/response shape, auth requirements, validation rules) in `server/routes.ts` — add/update a `server/__tests__/*.test.ts` file exercising the route via `supertest`.
- New or modified database schema (`shared/schema.ts`), migrations, or storage-layer queries (`server/storage.ts`) — add/update tests covering the new fields or query paths.
- New integrations or changes to existing ones (indexers, download clients, IGDB, Steam, HLTB, NexusMods, PCGamingWiki) — add/update tests, especially for error handling and any external input that touches SSRF validation.
- Security-relevant changes (auth, input validation/sanitization, SSRF checks, rate limiting) — always add a regression test that fails without the fix, and update [docs/THREAT_MODEL.md](../docs/THREAT_MODEL.md) if the change adds a new external integration, trust boundary, or data flow, or materially changes an existing one.
- New cron jobs or changes to scheduled job logic (`server/cron.ts`) — add/update tests covering the job's decision logic.
- New user-facing flows or pages with meaningful interaction (forms, multi-step actions, navigation) — add a Playwright spec under `tests/e2e/`, or extend an existing one.

Changes that are typically **exempt** from new tests: pure styling/CSS tweaks, copy/wording changes, internal refactors that don't alter behavior (already covered by existing tests), and dependency bumps with no code changes. When in doubt, prefer adding a small test over skipping it — reviewers may ask for one if a major change ships without coverage.

#### Documentation policy for major changes

The same categories of "major changes" listed above (new/changed API endpoints, new integrations, security-relevant changes, new cron jobs) also require updating the relevant design/interface/security documentation before merging: [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) (actors and data flow), [`docs/API.md`](../docs/API.md) (external interfaces), [`docs/SECURITY_ASSESSMENT.md`](../docs/SECURITY_ASSESSMENT.md) (risk register), and/or [`docs/THREAT_MODEL.md`](../docs/THREAT_MODEL.md) (attack surface analysis).

### Dependencies

See [docs/DEPENDENCIES.md](../docs/DEPENDENCIES.md) for how QuestarrNG selects, obtains, and tracks its dependencies. New dependencies are reviewed as part of the normal PR process.

### Commit Messages

- Use clear, descriptive commit messages
- Start with a verb in the present tense (e.g., "Add", "Fix", "Update")
- Reference issue numbers when applicable (e.g., "Fix #123: description")

### Pull Requests

- Provide a clear description of what your PR does
- Link related issues
- Ensure all checks pass before requesting review
- Be responsive to feedback and questions

Every user-facing behavior, security, operational, or documentation change
needs one validated fragment under [`release-notes/`](../release-notes/README.md).
For internal-only changes, include `release-note: none` in the PR description.
Preview the release text with:

```sh
npm run release-notes:preview -- --base origin/main --head HEAD
```

CI validates the fragment and summarizes its release text. The tag workflow
adds these fragments to the GitHub release notes. A trusted default-branch
workflow announces successfully published tag releases to Discord. Keep the
versioned history in [`docs/CHANGELOG.md`](../docs/CHANGELOG.md).

## Project Structure

- `/client` - React frontend application
- `/server` - Express backend application
- `/shared` - Shared types and schemas

## Documentation

- Start with [`docs/GITHUB_DOCUMENTATION.md`](../docs/GITHUB_DOCUMENTATION.md) for the canonical documentation map.

## Need Help?

- Check existing issues for similar problems or questions
- Open a new issue if you find a bug or have a feature request
- Be respectful and constructive in all interactions

## Collaborator Access

Requests for elevated repository access (merge/write permissions, secrets, or infrastructure access) are subject to review and approval per our [Collaborator Access & Escalation Policy](../docs/SECURITY.md#collaborator-access--escalation-policy). New contributors should start by submitting pull requests from a fork; escalated access is granted only after identity vetting and maintainer approval.

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help create a welcoming environment for all contributors
- Use of AI is welcome

Thank you for contributing to QuestarrNG!

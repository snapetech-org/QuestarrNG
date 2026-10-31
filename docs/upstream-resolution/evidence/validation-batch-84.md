# Batch 84 review and validation status — October 31, 2026

## Snapshot and scope

Reviewed upstream PRs #950–#957 against the refreshed sanitized snapshot. The
snapshot contains 235 issues and 1,011 pull requests and was generated at
2026-10-31T04:04:24.266Z from upstream main
6b14c6943938fd22d9943368baca3c72b1fa957c. The fork head captured in that
snapshot is e188cd0c74c73071c94b04915e1babac2d2bf386. All eight source digests
matched the refreshed snapshot. The current source-change count is 44; those
records remain flagged for chronological review.

## Review outcomes

- PR #950 — verified. IGDB edition canonicalization follows version_parent,
  deduplicates results, retains headroom for local platform/year filtering,
  and avoids returning an empty result when filtering removes every candidate.
  The focused tests were included in Batch 82 validation.
- PR #951 — implemented-unverified. Existing bounded Newznab/Torznab capability
  discovery and category fallback passed in Batch 82. This batch adds a source
  marker to the API response and an accessible, localized warning when
  provider-provided categories are unavailable. API, localization, provider,
  and Playwright tests were added; fresh test and browser evidence is pending.
- PR #952 — verified. Production logging defaults to info, supports LOG_LEVEL,
  and scrubs serialized messages and bindings. Logger coverage passed in Batch
  82.
- PR #953 — verified. Protected API routes use default-deny authentication;
  unauthenticated config reads are covered by the auth-boundary and route tests
  included in Batch 82.
- PR #954 — implemented-unverified. Cookie/CSRF authentication remains primary.
  A legacy localStorage token is removed from persistent storage and used only
  after the cookie request returns 401 or 403. Client tests now cover cookie
  first and bearer fallback; they and the browser session flow still need a
  compatible private-JIT run.
- PR #955 — verified. Scan count, response-size, depth, duration, and
  per-user-rate limits and the accessible partial-results notice passed Batch
  83. This batch also replaces any-typed Express middleware mocks with Express
  Request, Response, and NextFunction types.
- PR #956 — superseded. Current production dependencies meet or exceed all
  five requested versions: @hookform/resolvers 5.9.1, fast-xml-parser 5.11.2,
  framer-motion 14.3.0, js-yaml 5.4.3, and react-resizable-panels 4.14.5.
- PR #957 — superseded. The current harden-runner pin is v2.22.1, newer than
  the requested v2.21.0. Its CodeQL SARIF uploader request is superseded by the
  explicit organization-wide directive to remove CodeQL invocations.

## Implementation details

The indexer category endpoint preserves its existing array body and reports
provenance in X-Questarr-Category-Source. The indexer editor explains that
fallback IDs are suggestions and asks users to confirm provider support. The
message is translated in all supported locales. The legacy auth migration now
tries cookie auth first and only retries with the prior token after 401/403.
The QuestarrNG workflow changes remove CodeQL actions and the CodeQL workflow;
this only covers QuestarrNG so far. The separate organization-wide CodeQL
audit remains outstanding.

## Validation status and blocker

No Batch 84 test, build, or browser job was started. Validation must run on a
compatible private ephemeral JIT runner. The live organization runner list had
no online Linux x64 runner with the QuestarrNG labels; the online Linux runners
were busy with other repositories. The macOS ARM64 runner is not compatible
with QuestarrNG's Linux x64 workflow. The active kspld0 JIT broker was not
restarted. The GitHub REST API rate limit was exhausted, so the active-run
query and current branch-protection check could not be completed; its reported
reset was 2026-10-31 04:58 UTC. No workflow was dispatched or retried while
capacity and active-run state were unknown.

Inherited validation is limited to the existing behavior recorded in Batch 82
(585 focused tests across 29 files plus typecheck, lint, formatting, secret
scan, and build) and Batch 83 (628 focused tests across 15 files, the same
repository checks, and a Files-tab browser replay). These results do not cover
the Batch 84 category notice, cookie-first migration, or the current exact
head. The new category E2E spec writes its screenshot to Playwright test
output; on successful private-JIT execution, retain the screenshot under the
campaign evidence tree. Run the required checks on the exact candidate head
before changing the pending ledger statuses.

Static whitespace validation completed with git diff --check.

## Scratch and cleanup

The campaign worktree is retained at
/mnt/datapool_lvm_media/.codex-scratch/questarr-upstream-resolution-20261030
on the LVM-backed NFS mount. The root-side campaign copy was removed only after
checksum comparison and open-handle checks; the independent cross-fork NFS
worktree tree was preserved. No Batch 84 test scratch has been created. The
current campaign worktree occupies approximately 897,564,672 allocated bytes.

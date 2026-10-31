# Batch 85 source review — October 31, 2026

## Snapshot and method

Reviewed upstream PRs #958–#963 against the refreshed sanitized source
snapshot. The snapshot contains 235 issues and 1,011 pull requests and was
generated at 2026-10-31T04:04:24.266Z from upstream main
6b14c6943938fd22d9943368baca3c72b1fa957c. The fork head captured in that
snapshot is e188cd0c74c73071c94b04915e1babac2d2bf386. All six source digests
match the snapshot and none is flagged source-changed.

For each PR, review included its body, changed filenames and diff, discussion
comments, formal reviews, inline review threads, and available PR workflow
runs. Results were successful for #958, #960, #961, #962, and #963. PR #959
had no PR workflow runs and was closed by the upstream owner without merging
after #947 had already resolved the issue.

## Review outcomes

- PR #958 — verified. QuestarrNG declares and locks @types/better-sqlite3 at
  9.6.0. Upstream CI, SAST, Dependency Review, and Deprecated Dependencies
  checks passed; no formal review or inline threads were present.
- PR #959 — superseded. The PR's description correctly narrows a weak
  self-signed-certificate check, but the owner closed it because merged PR #947
  delivered that fix more completely. QuestarrNG never disables certificate
  verification. Its regression test confirms a legacy allowSelfSignedCertificate
  value does not permit a TLS bypass.
- PR #960 — verified. shared/log-scrub.ts removes API keys, tokens, passwords,
  secrets, bearer values, and webhook URLs. Both manual support logs and server
  error telemetry use the shared scrubber. The merged PR was approved and CI,
  SAST, and Dependency Review passed. The current tests and Batch 58 validation
  cover the send-log redaction path.
- PR #961 — verified. The shared copy helper falls back to
  document.execCommand when the Clipboard API is unavailable or rejects a
  request, and callers show a failure when both paths fail. This overlaps
  verified issue #914 and its Batch 79 coverage. The merged PR was approved and
  CI, SAST, and Dependency Review passed.
- PR #962 — verified. Per-download and per-downloader archive passwords work
  with SABnzbd and NZBGet. The code requires secure downloader transport,
  constrains credential-bearing HTTPS redirects to the same origin, redacts
  passwords in API/validation output, and enforces the 200-character limit.
  All 20 upstream review threads were resolved; the owner reported all 21
  checks green. The owner intentionally deferred browser-to-Questarr HTTP
  encryption as a separate deployment threat model. Operators should enter
  archive passwords through a TLS-protected Questarr URL. Issue #849 and Batch
  73 already cover the implementation and focused tests.
- PR #963 — verified. The download dialog and automatic-search rules expose
  indexer-priority sorting; lower numeric values sort first, unknown indexers
  stay last in either direction, and desktop result rows show priority. The two
  upstream review threads on unknown-indexer order and the missing row cell
  were resolved. CI, SAST, and Dependency Review passed; Batch 47 includes the
  relevant dialog and cron regression suites.

## Validation and remaining work

Batch 85 changes only ledger, inventory, and review documentation. No new test
job was needed for this source-review batch. Existing focused results are
recorded in the linked evidence: Batch 47 (649 tests), Batch 58 (286 server
and 54 client tests plus E2E), Batch 73 (117 archive/downloader tests), Batch
79 (335 tests), and the Batch 82–83 repository and UI gates. These historical
results support the verified dispositions but do not replace final exact-head
validation. The Batch 84 category notice and cookie-first authentication remain
implemented-unverified until tests and browser evidence run on compatible
private ephemeral JIT capacity.

## Scratch and cleanup

No test process or batch-specific scratch was created. The campaign worktree
remains on the LVM-backed NFS path documented in Batch 84 evidence.

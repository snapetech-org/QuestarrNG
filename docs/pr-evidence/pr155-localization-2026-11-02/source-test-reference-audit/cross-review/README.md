# QuestarrNG PR #155 source-coverage cross-review (positions 230–252)

Read-only independent review of the frozen primary packet at commit `1ab1c680fda2da8c4933fa78b529ef29e29ffc90` / tree `bf909d8b3057a480f455a9ba916e6c55c52f8833`.

## Result

- Reviewed 23 source positions and 38 cited test references.
- Confirmed 21 metadata-only classifications: each has at least one cited test reaching an exact producer/error branch.
- Confirmed 2 missing-test blockers: position 236 (update mapping failure) and position 243 (RomM disabled guard).
- Proposed path associations at positions 246–249 include downstream contract tests that do not execute the source producer; the ledger distinguishes these from direct producer tests.
- Position 245 includes conditional traversal cases; deterministic absolute traversal and Windows-drive rejection cases provide direct evidence.
- Declared owner paths are broad or mismatched for this slice. Position 243 also omits the actual `ImportManager.ts` producer.

## Pin and limits

PR #155 is OPEN at the exact reviewed head/tree; `isDraft=false`. All 28 frozen input snapshots match manifest hashes and pinned tree bytes. The original input packet checksum manifest passed. No tests, builds, scans, CI, browser work, or repository/PR edits were made.

Confidence is high for test-path verdicts and 21/2 classification within cited evidence; confidence is moderate for the intended semantics of broad `owners` metadata. Coverage gaps at positions 236 and 243 remain blockers.

`crossreview-ledger.jsonl` contains per-position and per-reference verdicts, exact lines, and hashes. `producer-occurrences.jsonl` records the cited producer literals. `attestation-before.json` and `attestation-after.json` record live PR/tree and frozen-input checks.

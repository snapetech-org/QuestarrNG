# QuestarrNG PR #155 source-coverage follow-up

Read-only audit of the 23 empty coverage fields at source inventory positions 230–252.

## Pin and method

- PR #155: OPEN, not draft.
- Head: `1ab1c680fda2da8c4933fa78b529ef29e29ffc90`; tree: `bf909d8b3057a480f455a9ba916e6c55c52f8833`.
- Exact head/tree match was confirmed before review. The tree response was complete (not truncated); every saved source, test, and inventory input was Git-blob checked against this tree.
- Reviewed the actual producer key occurrences and test behaviors/expectations in the pinned snapshots. A filename match alone was not counted as coverage.
- Outcome: **21 metadata-only entries** and **2 missing-test blockers**.

## Findings

The 21 metadata-only entries already have tests that reach the source branch/error path. Their empty `coverage` fields can point to the cited tests without adding or running tests. The two blockers are:

- Position 236, `service.api_failed_to_update_path_mapping`: existing tests cover successful update and absent mapping; none make `updatePathMapping` reject and reach the 500 branch.
- Position 243, `service.api_romm_imports_are_disabled`: captured RomM tests cover enabled configuration and successful behavior; none exercise the disabled guard.

The declared owners are also broader than actual key construction: positions 230–245 repeat all three route files even when a key appears in only one. Positions 246–252 declare both `ArchiveService.ts` and `ImportManager.ts`, although each key's producer is confined to one of those files. `entry-review.jsonl` lists actual producer paths and lines. This is metadata quality context; it does not change the coverage classifications.

The direct frontend `ApiKeysCard` tests and generic API-error-contract tests were not counted for server source coverage because they do not reach these route branches. The interface source-coverage test and localization workflow document are preserved in the input snapshot set but do not themselves prove functional branch coverage for these 23 keys.

## Files

- `entry-review.jsonl`: one complete disposition per source position, including producer lines, exact test references, line excerpts, file hashes, rationale, and proposed coverage paths.
- `source-evidence.jsonl`: compact producer/owner reconciliation.
- `inputs/` and root JSON/TypeScript snapshots: raw pinned inputs.
- `input-manifest.json`: Git blob and SHA-256 values for every input.
- `pr.json`, `tree.json`, `attestation.json`: live PR and tree pin evidence.
- `SHA256SUMS`: checksums for the packet files.

No repository or PR edits were made. No tests, builds, scans, CI, browser, releases, or workflows were run or changed. Native-speaker review and compatible private JIT validation remain outside this source/test-reference audit.

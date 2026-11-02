# QuestarrNG PR #155 exact-head catalog reconciliation audit

Audit date: 2026-11-02. This machine-assisted, read-only audit was performed against PR head `47e57bdff5918e6444417d140511b3f2713cf7fd` (tree `f70952821dcc37e4df3236caf609e1bc3af7d11e`). The head adds browser evidence only; the parent application-code head is `64c16f9cfe8f24e462895d817e805faf70edd96b` (tree `c10ce0e075b9ee68eb4c4aaa35f1e3870462763d).

## Catalog and review coverage

- All 2,590 canonical IDs are populated in all 12 direct locales: 31,080 nonblank direct values.
- The formal review set is 36,960 cells: 31,080 catalog values and 5,880 domain/context records. All reconcile as resolved (33,696 prior cells plus 3,264 newly closed); zero active unresolved cells remain.
- The exact-head review index contains 4,284 unique cells across 357 IDs × 12 locales. Source, current-target, proof-batch, review-row, outcome, and input-head pins all match. Its 85-file prior evidence map also checksums cleanly and reproduces 35,692 rows, 33,696 unique cells, and 1,996 duplicate rechecks.
- Since the index input head, 2,876 direct targets changed. It covers 2,872; the four others were separately re-attested below. No deterministic uncovered semantic slice remains.
- All 2,590 source strings match the current catalog. The 331 source-coverage entries (3,972 locale rows) have no caller, source, or row-set mismatch. Twelve owner entries across five files were re-attested at the current tree; their changes preserve source meaning and context.

## Separately re-attested current targets

| Source ID | Locale | Current target | Source SHA-256 | Target SHA-256 |
| --- | --- | --- | --- | --- |
| `navigation.discover` | `ko` | `발견` | `d4a33d5b78bccebe3f16843dc30e6c0f73b4eb6efb4e7114ddfebde7fa2c9954` | `93b1707f1103433ed893c5a3d5531238b5c071a55c34a4caafaef48748d5a995` |
| `navigation.browse` | `ja` | `閲覧` | `3227aa9666253f7a736509074fb83bc4d47b19582faaa0233f228746de29217a` | `a7ca6966dbf260ca1d4fa3bbef9a12fe19e6c9ce511c08bf4987f176485d3b70` |
| `interface.at_least_8_characters_including_on_2a6832ca` | `ja` | `8文字以上で、英字と数字を各1文字以上含めてください。` | `4aaa54a6e683114603ddab3ed6b97d7c278052183de2e746f5b6465d33d31cf4` | `1292dc2f852b115d455bd7a8f926d2687b5af6373730a2894281b3cc44f74e67` |
| `interface.game_management_b1319076` | `id` | `Pengelolaan gim` | `d17ad9669326d8ecab9246c30d2bdb10faae2aa9ade0b0fb8d9688e9c010f3d9` | `a3ff86c2f5c20a32c58a574090519c026007a91bac9d04be6df0376cb062fd31` |

## Remaining gates

- Qualified native-speaker signoff has not been recorded.
- Current-head browser evidence covers Spanish desktop discovery and Arabic desktop Settings at 1440×1000. Other direct locales, mobile layouts, full RTL behavior, and populated provider results remain uncovered. The preview had no valid provider credentials.
- Private-JIT functional validation remains pending. Twenty-three source-coverage entries have no test-coverage reference.

No translations were changed by this audit. No tests, builds, scans, CI jobs, releases, or tags were run or created. Existing source and browser evidence remains in the repository’s `localization/` and [PR evidence directory](README.md).

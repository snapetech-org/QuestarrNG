# QuestarrNG PR #155 current-head catalog coverage addendum

## Attested head

PR #155 was OPEN and ready for review (not draft) on `codex/localization-foundations-20261028` at input head `0ea966692f4dec72e8830ebc1f085549968c587e`, tree `edc78b5261b481ab8afd044df8371bb21f5d4d14`. The live branch ref and `refs/pull/155/head` both matched the input head.

## Catalog and formal review coverage

The exact-head catalog reconciliation audit reports complete coverage for all 2,590 canonical source IDs across the 12 direct locales (31,080 populated direct catalog cells). All 36,960 formal catalog and domain/context review records are resolved, with zero active unresolved cells. The audit finds no deterministic uncovered semantic slice.

The audit reviewed 4,284 unique current-head cells across 357 IDs; its 85-file prior evidence map reproduces 35,692 rows, 33,696 unique cells, and 1,996 duplicate rechecks. Of 2,876 direct-target changes since the index input head, 2,872 are in the index and four were separately re-attested.

The audit was written against head `47e57bdff5918e6444417d140511b3f2713cf7fd`, tree `f70952821dcc37e4df3236caf609e1bc3af7d11e`. Its SHA-256 is `e0033a66c3f61ab750041ff97d2944c3e649134c7adb48d754bea14fe66c1ca6`; the parent `SHA256SUMS` file SHA-256 is `cd98ea36c0c37f51bd391409c14b5b93faf5241debc4db7d5104b59d886be0be`. The checksum file verifies the audit document at the recorded hash.

## Current-head comparison

GitHub comparison from audit head `47e57bdff5918e6444417d140511b3f2713cf7fd` to input head `0ea966692f4dec72e8830ebc1f085549968c587e` contains three intervening commits. The only changed path under `localization/` is `localization/source-coverage.json` metadata; no locale catalog path changed. The full path and commit list is in [audit-to-input-head-compare.json](audit-to-input-head-compare.json). This preserves the audit coverage at the input head.

## Direct locales

The audited direct-cell count is 2,590 in each locale: Spanish (`es`), Simplified Chinese (`zh-Hans`), Hindi (`hi`), German (`de`), Japanese (`ja`), French (`fr`), Brazilian Portuguese (`pt-BR`), Arabic (`ar`), Korean (`ko`), Traditional Chinese (`zh-Hant`), Vietnamese (`vi`), and Indonesian (`id`).

## Remaining review gates

Complete catalog coverage and formal machine-assisted review do not equal native-speaker signoff. Qualified native-speaker review, broader browser coverage including mobile and RTL, populated provider-backed results, and private-JIT functional validation remain outstanding. The separate source/test-reference audit also records two source-branch test-reference gaps; these are test-coverage metadata gaps, not uncovered translation cells.

This documentation-only addendum records the existing coverage evidence. No catalog or workflow files changed. No tests, builds, scans, or CI jobs were run for this addendum.

# Setup browser and semantic review at corrected code head bdf15ebc

PR #155 was reviewed in a headed Agentic VM browser against application code head `bdf15ebc8f19ea0d88a0fc6f007c46f7f9a7a845` (tree `0c8f45596655ebe1546a3d82f584663c7da30910`). The earlier twelve-locale setup capture set at head `6f592afa` remains historical evidence and records the old Japanese wrap. This follow-up captures the corrected Japanese helper at the same 1920×1024 desktop viewport.

## Japanese password helper

Source: “At least 8 characters, including one letter and one number.”

Previous target: `8文字以上で、英字と数字をそれぞれ1文字以上含めてください。`

Current target: `8文字以上で、英字と数字を各1文字以上含めてください。`

`各1文字以上` keeps the requirement for at least one letter and at least one digit while shortening the text. In the current screenshot the helper occupies one line; the old final `い。` no longer wraps alone. The scrolled screenshot shows password confirmation, the IGDB fields, and the localized create-account button without clipping. No account was created and no provider credentials were entered.

The password rule is defined in `shared/schema.ts`: at least eight characters, one ASCII letter, and one ASCII digit. The setup helper appears directly below the password field in `client/src/pages/auth/setup.tsx`. The Japanese source and target contain no placeholders, ICU patterns, or protected literals.

## Exact-target reconciliation

A scan of retained semantic-review artifacts at input head `6f592afa` found terminal exact-target dispositions for 31,077 of the 31,080 direct cells. Only three cells were uncovered, so a disjoint 25-key/300-cell batch could not be selected. Those three cells were reviewed at that head and accepted:

- Korean `navigation.discover`: `발견`, the Discover group and mobile navigation label.
- Japanese `navigation.browse`: `閲覧`, the Browse child entry under Discover.
- Indonesian `interface.game_management_b1319076`: `Pengelolaan gim`, the sidebar subtitle.

The Japanese password target then changed at `bdf15ebc`; its previous value had 54 identical accepted copies in batch 013, all with the same source, target, context, input-cell hash, and review-row hash. They are 54 copies of one historical cell disposition, not 54 distinct cells. The addendum records one current visual correction row and preserves those historical records unchanged.

The Indonesian setup helper `Kredensial IGDB diperlukan untuk menemukan dan mengimpor game.` remains unchanged; batch 079 contains an exact accepted disposition. The glossary does not mandate `gim` over `game`; among Indonesian cells whose English source contains “game(s),” 238 use `game` and 21 use `gim`. No Indonesian recapture is needed because this target did not change.

The exact per-cell outcomes, duplicate-row audit, scan report, and source/catalog hashes are recorded in this folder and in the task-scoped scratch verifier bundle.

`manifest.json` pins the historical catalog head/tree, corrected code head/tree, catalog and generated-label hashes, context source hashes, review counts, and screenshot conditions. `prior-coverage-report.json` records the exact-target scan (3,080,554 matching rows across 1,905 artifact files). `source-context.txt` includes the cited navigation, sidebar, setup, password-policy, and glossary excerpts. Run `python3 docs/pr-evidence/pr155-localization-2026-11-01/setup-pr-head-bdf15ebc/verify_review.py --verify` from the repository root to check the checksums and exact pins. To repeat the full overlap scan when the retained review artifacts are available, add `--rescan-prior /path/to/questarrng-review-artifacts`.

## Evidence and limits

- `setup-ja-1920x1024-top.png` shows the current password helper on one line.
- `setup-ja-1920x1024-bottom.png` shows the vertically scrolled confirmation, IGDB fields, and submit control.
- `review-addendum.jsonl` contains the three previously uncovered cell decisions, the Japanese visual correction, and the unchanged Indonesian IGDB helper.
- `password-prior-review-duplicates.json` records the 54 identical historical copies and their single authoritative row hash.
- `SHA256SUMS` verifies the screenshots and review artifacts in this directory.

This machine-assisted review is not native-speaker signoff. It covers the setup page at one desktop viewport. Mobile layout and the rest of the application are outside this follow-up. No tests, builds, or CI jobs were run; no release or tag was created.

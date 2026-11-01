# QuestarrNG PR #155 headed browser review

Reviewed application code head: `096a63c07d11e5a1fb71700cbf4c37ebfa829fde` (PR #155, source branch `codex/localization-foundations-20261028`). The review used an isolated headed Chrome session in the Agent GUI VM; it did not use the user's desktop. Screenshots are 1440×1000.

## Coverage

Visited setup, Discover, and Settings → Appearance. Selected each direct locale in the live interface: `es`, `zh-Hans`, `hi`, `de`, `ja`, `fr`, `pt-BR`, `ar`, `ko`, `zh-Hant`, `vi`, and `id`. The twelve screenshots in this folder show the localized appearance settings page. Accessible snapshots also confirmed translated setup copy, app navigation, settings tabs, theme and regional-format labels, and content-filter copy.

The preview used a disposable local database and account. It made no external IGDB connection or notification call.

## Corrections at this head

- Korean `navigation.discover` and `navigation.browse` both rendered as `둘러보기`. `navigation.discover` now uses `발견`; the Browse entry remains `둘러보기`.
- Japanese Browse rendered as `参照` (“reference”). `navigation.browse` now uses `閲覧` (“browse/view”).
- Indonesian mixed `game` in the app subtitle and `gim video` in the page title. `interface.game_management_b1319076` now uses `Pengelolaan gim`.

The three corrected cells are marked `machine-draft` pending qualified native-speaker review.

## Visual observations

- Arabic switched to RTL: the sidebar moved to the right, navigation and settings content aligned right, and the tab order followed RTL. No clipping or overlap was visible on the desktop settings page.
- German’s long xREL releases label and French’s library-import label wrap to a second sidebar line; both remain legible without overlap.
- No obvious clipping was visible in the other ten locale screenshots at this desktop viewport.

## Validation and limits

`npm run check:localization` passed at reviewed code head `096a63c0`: 2,590 stable IDs and 14 complete target locales. `git diff --check` passed. No tests, builds, or CI jobs were run. Mobile-size RTL was not reviewed. This machine-assisted review is not native-speaker signoff.

`SHA256SUMS` records each screenshot hash.

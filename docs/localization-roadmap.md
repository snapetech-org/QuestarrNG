# UI localization

## Coverage

Questarr's React interface has a browser-local language preference for English and twelve non-English locales: Spanish, Simplified Chinese, Hindi, German, Japanese, French, Brazilian Portuguese, Arabic, Korean, Traditional Chinese, Vietnamese, and Indonesian. The stable catalog contains 2,232 namespaced message IDs and 26,784 nonempty target-locale values. The generated catalog check verifies placeholder parity and prevents incomplete locales from entering the selector.

Fixed interface call sites now use stable IDs. Dynamic legacy surfaces retain a source-text compatibility path while they migrate; unknown or external text still falls back unchanged. Game names, release names, paths, identifiers, API values, and provider text remain untouched. Known generated notifications and app-owned API summaries continue to use their specialized catalogs.

The interface language and regional-format preference are independent. Regional formatting controls dates, times, numbers, calendar weeks, locale-aware sorting, and unit formatting. Localized numeric parsing is available for input. Language choice is saved in browser-local preferences, and first use follows the browser's preferred language before falling back to English.

RTL direction is resolved by script and applied to the document. Common inline layout utilities use logical start/end properties, including spacing, alignment, borders, corners, and edge positions. The shared resolver recognizes Arabic, Persian, and Hebrew even though only Arabic currently has a complete translated interface catalog.

## Review status and limits

The current selector offers 13 choices including English. Reaching 37 choices would require 24 additional fully translated catalogs. No partial locale is exposed as complete. Browser fallback rules map supported regional tags explicitly, including script-priority handling for Chinese and Portuguese-to-Brazilian-Portuguese fallback.

Existing translation history is not available per string, so the baseline catalog is marked `legacy-unverified`. Two new labels are marked `machine-draft`. The terminology glossary defines game-domain terms and protected values. Native-speaker review remains outstanding.

The existing Playwright suite includes Arabic flows, mixed-direction game titles, accessible names, keyboard focus, narrow viewports, and 200% text scaling. The new stable-ID migration and layout audit have not been run in CI yet; repository workflows currently run on tag pushes or manual dispatch. Populated integrations and live provider data remain outside the current browser coverage.

## Locale selection

This first-wave locale set was selected as a practical rollout order, not as a claim about Questarr users. Product-level language analytics are not available. The order combines global speaker estimates with online-content usage, while including requested Arabic and Asian-language coverage:

1. Spanish (es; es-MX where the product already distinguishes it)
2. Simplified Chinese (zh-Hans / zh-CN)
3. Hindi (hi)
4. German (de)
5. Japanese (ja)
6. French (fr)
7. Brazilian Portuguese (pt-BR)
8. Arabic (ar)
9. Korean (ko)
10. Traditional Chinese (zh-Hant / zh-TW)
11. Vietnamese (vi)
12. Indonesian (id)

The World Bank's 2025 report estimates Mandarin Chinese, Hindi, and Spanish at 15%, 7.6%, and 6.9% of the global population respectively; its online-content data also places German, Chinese, and Japanese among leading languages. [World Bank, Digital Progress and Trends Report 2025](https://documents1.worldbank.org/curated/en/099112525160536089/pdf/P505350-59c98ca8-0803-4f23-b470-17f3dab010ab.pdf). W3Techs tracks website content-language share rather than app users. [W3Techs content-language survey](https://w3techs.com/technologies/cross/content_language/ranking). Reorder this list if maintainers later receive reliable demand signals.


## 2026-10-29 implementation follow-up

The full 2,232-message catalog now uses stable namespaced IDs in the source manifest, and 1,456 fixed translation calls plus localizable source attributes were migrated. A generated source map preserves a compatibility bridge for dynamic legacy messages. Catalog generation is reproducible, source checksums fail on unreviewed source edits, and the integrity check compares selector locales with complete manifest coverage.

Plural and select helpers now take stable message IDs. Sidebar count labels use CLDR plural categories, regional digits come from the shared regional formatter, and date, number, percent, unit, and localized-number parsing helpers are available.

Common physical inline Tailwind utilities were replaced with logical equivalents. The catalog check blocks regressions to physical inline spacing, alignment, borders, corners, and noncentered positions. Existing RTL browser coverage includes a long Arabic/English/Japanese game title, screen-reader naming, dialog keyboard focus, and 200% text scaling. Persian and Hebrew are covered by direction-resolver checks; they do not appear as selectable interface languages until their catalogs are complete.

See the [localization workflow](./localization-workflow.md) and [translation glossary](./translation-glossary.md).

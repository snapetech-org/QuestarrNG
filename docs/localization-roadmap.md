# UI localization

## Coverage

Questarr's React interface has a browser-local language preference for English and fourteen non-English locales: Spanish, Simplified Chinese, Hindi, German, Japanese, French, Brazilian Portuguese, Arabic, Korean, Traditional Chinese, Vietnamese, Indonesian, Latin American Spanish, and Canadian French. The stable catalog contains 2,590 namespaced message IDs, 31,080 canonical direct-locale values, and 5,180 inherited regional values (36,260 non-English catalog values total). The generated catalog check verifies placeholder parity and prevents incomplete locales from entering the selector.

Fixed interface call sites now use stable IDs. Dynamic legacy surfaces retain a source-text compatibility path while they migrate; unknown or external text still falls back unchanged. Game names, release names, paths, identifiers, API values, and provider text remain untouched. Known generated notifications and app-owned API summaries continue to use their specialized catalogs.

The interface language and regional-format preference are independent. Regional formatting offers all 37 mapped locales plus browser settings, even when a locale is not yet ready for interface translation. It controls dates, times, relative time, numbers, calendar weeks, locale-aware sorting, and unit formatting. Localized numeric parsing is used by the release-year search field; localized digits are converted to a canonical year before the API request. Language choice is saved in browser-local preferences, and first use follows the browser's preferred language before falling back to English.

RTL direction is resolved by script and applied to the document. Common inline layout utilities use logical start/end properties, including spacing, alignment, borders, corners, and edge positions. The shared resolver recognizes Arabic, Persian, and Hebrew even though only Arabic currently has a complete translated interface catalog.

## Review status and limits

The current selector offers 15 choices including English. Reaching the 37-choice reference set requires 22 more complete catalogs. No partial locale is exposed as complete. Spanish (Latin America) and Canadian French are complete inherited catalogs, marked with per-message parent provenance. The locale map records every target tag, translation state, RTL status, and regional fallback.

**Current catalog review (2026-10-31):** all 36,960 formal direct review cells are resolved: 31,080 canonical direct-locale cells plus 5,880 domain cells. This includes 2,952 newly translated cells and 292 pre-existing machine-draft cells reviewed semantically; 3,242 decisions kept their target and two corrections were accepted. New and edited direct values remain `machine-draft`, and `es-419`/`fr-CA` remain `inherited` from `es`/`fr`. The compact review evidence and per-key coverage references are in the repository. No qualified native-speaker signoff is claimed; it remains outstanding.

Existing translation history is not available per string, so the baseline catalog remains marked `legacy-unverified`. The terminology glossary defines game-domain terms and protected values.

Existing Playwright coverage includes Arabic navigation, settings and calendar form input, localized-digit release-year filtering, download dialogs, mixed-direction game titles, accessible names, keyboard focus, narrow viewports, and 200% text scaling, plus the import-history table, manual-import form, and task sheet with RTL mixed-script titles and paths. For this localization milestone, catalog generation, catalog integrity, and whitespace checks passed; tests, builds, scans, packages, and CI jobs were not run. Agentic VM visual review is in progress. Populated integrations and live provider data remain outside the current browser coverage.

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



## 37-choice locale map

The machine-readable source is localization/locale-map.json, aligned to the PlezyNG catalog. The selector currently contains 15 choices (English plus 14 catalogs); the other 22 remain unselectable until full catalogs are supplied.

| Tag | Language | Current state | Parent or direction |
|---|---|---|---|
| az | Azerbaijani | Translation needed | — |
| bg | Bulgarian | Translation needed | — |
| bn | Bengali | Translation needed | — |
| cs | Czech | Translation needed | — |
| da | Danish | Translation needed | — |
| fa | Persian | Translation needed | RTL |
| he | Hebrew | Translation needed | RTL |
| hu | Hungarian | Translation needed | — |
| it | Italian | Translation needed | — |
| kk | Kazakh | Translation needed | — |
| ms | Malay | Translation needed | — |
| nb | Norwegian Bokmål | Translation needed | — |
| nl | Dutch | Translation needed | — |
| pl | Polish | Translation needed | — |
| pt | Portuguese | Translation needed | Parent for pt-BR and pt-PT |
| pt-PT | European Portuguese | Translation needed | pt |
| ru | Russian | Translation needed | — |
| sv | Swedish | Translation needed | — |
| th | Thai | Translation needed | — |
| tr | Turkish | Translation needed | — |
| uk | Ukrainian | Translation needed | — |
| uz | Uzbek | Translation needed | — |

The two regional additions already available are es-419 (inherited from es) and fr-CA (inherited from fr). Arabic is the only currently selectable RTL interface catalog. Persian and Hebrew resolve to RTL but stay out of the selector until their translations are complete. Browser tags use explicit regional rules: Latin American Spanish resolves to es-419, Canadian French to fr-CA, Portuguese regions to a complete Portuguese catalog (currently pt-BR), and Chinese script before region.

## Historical implementation record (2026-10-29)

The counts and review state in this section describe the catalog at that date. The current 2026-10-31 counts and review status are recorded above.

At that milestone, the 2,237-message catalog used stable namespaced IDs in the source manifest, and 1,456 fixed translation calls plus localizable source attributes had been migrated. Two inherited regional catalogs brought target translation values to 31,318 across fourteen non-English choices. A generated source map preserved a compatibility bridge for dynamic legacy messages. Catalog generation is reproducible, source checksums fail on unreviewed source edits, and the integrity check compares selector locales with complete manifest coverage.

Plural and select helpers now take stable message IDs. Sidebar count labels use CLDR plural categories, regional digits come from the shared regional formatter, and date, number, percent, unit, relative-time, and localized-number parsing helpers are available. Relative time uses the interface locale where a date-fns locale exists and Intl.RelativeTimeFormat for other language tags, while retaining the selected regional digits. A catalog guard ensures all 37 mapped locales remain available in the regional-format selector.

Fixed server notifications use a separate client-side translation table. It now
adds four message templates for no-date delays, available content, interrupted
imports, and downloads removed before import, plus titles for content-available
and release-review notifications. These added notification labels and templates
are machine-drafted and still need native-speaker review; runtime game titles,
release text, reasons, paths, and other dynamic details remain intact.

Known fixed API error details are also localized separately from the main UI
catalog. A source audit across production server code found 352 unique fixed
`error` response values and four fixed error `message` values. Fifty-eight
additional details now have translations in all twelve target locales, and one
parameterized domain-list error keeps its runtime domain values as placeholders.
These additions are machine-drafted and remain unreviewed; arbitrary provider or
server details continue to use the existing English fallback.

Five fixed server success messages shown by settings and Prowlarr-sync flows now use the main interface catalog. Dynamic result counts remain placeholders, and the password endpoint's success message is not displayed because the client already shows its own localized confirmation.

Common physical inline Tailwind utilities were replaced with logical equivalents. The catalog check blocks regressions to physical inline spacing, alignment, borders, corners, and noncentered positions. Existing RTL browser coverage includes a long Arabic/English/Japanese game title, screen-reader naming, dialog keyboard focus, and 200% text scaling. Persian and Hebrew are covered by direction-resolver checks; they do not appear as selectable interface languages until their catalogs are complete.

See the [localization workflow](./localization-workflow.md), [translation glossary](./translation-glossary.md), and 37-choice locale map (../localization/locale-map.json).

# UI localization

## Coverage

Questarr's React interface has a browser-local language preference for English and twelve non-English locales: Spanish, Simplified Chinese, Hindi, German, Japanese, French, Brazilian Portuguese, Arabic, Korean, Traditional Chinese, Vietnamese, and Indonesian. The English-keyed catalog contains 1,980 app-owned source strings with a translation in every locale. English is the fallback for missing keys. Translated strings and accessible attributes carry language and direction metadata; Arabic sets the document language and direction and uses logical layout rules.

Catalog coverage includes navigation and page copy, settings, labels and accessible names, forms, help, empty states, dynamic summaries, notifications, finite app-owned statuses, and stable API error summaries. API responses retain their English `error` or `message` detail and include a stable `errorCode`; the browser translates recognized app-owned diagnostic details for display. Unknown or provider-supplied text and structured validation payloads remain unchanged. Known generated notification templates are translated; custom or changed notification text falls back to its original text because notification parameters are not stored separately. Unknown status values, game titles, release names, paths, and user input remain unchanged.

The interface language and regional-format preference are independent. Regional formatting controls dates, times, numbers, calendar weeks, and locale-aware sorting. Language choice is saved in browser-local preferences; first use follows the browser's preferred language before falling back to English.

## Review status and limits

The catalog has 1,980 keys across twelve target locales (23,760 translated values), with no empty values or interpolation-placeholder mismatches. A source-reference test checks every fixed interface-label reference; the provider and protocol names RAWG and Torznab intentionally remain unchanged. Catalog review checked protected technical tokens and suspicious duplicate or context-mismatched translations.

The source-reference test covers strings already routed through `InterfaceText`, `formatInterfaceMessage`, and the interface-language helper. It does not prove that every UI literal in the application has been routed through localization; full app-wide translation remains outstanding. Native-speaker review and full RTL layout validation also remain open.

Production browser review used the Agentic VM at desktop and mobile widths. It checked Arabic setup, authenticated library, download empty states, settings (including the theme picker), document language and direction, and horizontal overflow. A wider Arabic route sample covered the main navigation and administration pages. The production build passed and the full test suite passed (3,772 passed, 7 skipped; one test file skipped). Populated API-backed flows, live indexer/download-client integrations, and externally supplied game or release text were not exercised; unrecognized or provider-supplied error details remain in their source language.

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


## 2026-10-28 implementation follow-up

The navigation shell now uses namespaced IDs while resolving through the current English-key catalog, and carries a source checksum plus explicit legacy-unverified provenance. Shared locale utilities now expose CLDR plural/select helpers, localized numeric parsing and unit formatting, and a common script-aware direction resolver. A catalog integrity command is wired into `npm run check`; Playwright coverage adds a long mixed-direction title, accessible-name, keyboard-focus, narrow viewport, and 200% text-scale flow.

See the [localization workflow](./localization-workflow.md) and [translation glossary](./translation-glossary.md). This is an incremental foundation: the remaining catalog entries still need stable-ID migration, and new interface locales must have complete reviewed catalogs before they are selectable. The current catalog has twelve target locales; reaching 37 total choices would require 24 additional fully translated locales.

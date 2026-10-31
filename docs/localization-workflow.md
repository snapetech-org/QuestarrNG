# Localization catalog workflow

## Source of truth

`localization/messages.json` is the source catalog. Each entry has a stable namespaced ID, English source text, and a translation for each supported target locale. English wording is message content; it is not the identity. IDs stay fixed when copy changes.

Run `npm run generate:localization` after editing the source catalog. It generates `client/src/lib/stable-interface-messages.ts` and `client/src/lib/ui-labels.ts`. Keep provenance checksums in `client/src/lib/localization-provenance.json` in sync after a source edit. A stale checksum means the source changed and translations need a review decision before the catalog check can pass.

Existing dynamic surfaces can still resolve a legacy English source string through a generated compatibility map. New fixed UI copy should pass the stable ID to `t`, `formatInterfaceMessage`, `InterfaceText`, or the attribute localizer.

Run `npm run check:localization` to check IDs, generated output, locale completeness, interpolation placeholders, provenance records, fixed call sites, and RTL logical-layout utilities. `npm run check` runs the localization gate before TypeScript checking.

## Adding or changing messages

- Assign a new namespaced ID by hand. Do not derive IDs from source text in the generator.
- Keep game titles, release names, paths, filenames, URLs, hashes, API values, status codes, provider details, and other user or external data intact.
- Keep placeholders identical across every locale.
- Use the [translation glossary](./translation-glossary.md) for game-domain terms and protected values.
- Record `machine-draft`, `inherited`, or `reviewed` per locale when the translation history is known. Use `reviewed` only after a qualified human checks the wording and product context. Existing translations without an audit trail remain `legacy-unverified`. For inherited entries, record the parent locale in `translationSources`; the checker verifies that the inherited text matches the parent.
- Review all translations affected by a source edit, then update that message's source checksum. A copy edit must not change the ID.

## Locale availability and fallback

The selector contains English plus fourteen complete target catalogs. The checker requires the selector and manifest locale lists to match and every target cell to be nonempty with matching placeholders. The two regional additions inherit complete Spanish and French catalogs and retain per-message parent provenance; inherited status does not imply native review.

Browser-language fallback is explicit: Latin American Spanish regions resolve to es-419, other Spanish regions to es; Canadian French resolves to fr-CA, other French to fr; Portuguese uses the only currently complete catalog (pt-BR) until pt or pt-PT is complete; Chinese script tags take priority, then Taiwan/Hong Kong/Macau resolve to Traditional Chinese and China/Singapore to Simplified Chinese. Other supported regional tags fall back to their available base language. Regional formatting remains independent from interface language and exposes all 37 mapped locales (plus browser settings), including locales whose interface translations are still planned.

The [machine-readable locale map](../localization/locale-map.json) lists all 37 target choices, availability, native names, direction, provenance, and fallback rules. Fifteen choices are available now including English; 22 need complete catalogs. A locale enters the selector only after every stable message is present with matching placeholders.

## Message formatting and direction

Use `formatInterfacePluralMessage` for CLDR cardinal categories and exact-count overrides, and `formatInterfaceSelectMessage` for nonnumeric branches. Their forms refer to stable message IDs. Use `formatRegionalDate`, `formatRegionalNumber`, `formatRegionalPercent`, `formatRegionalUnit`, `formatRegionalDistanceToNow`, and `parseRegionalNumber` for locale-aware display and numeric input. Relative time uses date-fns wording where a locale bundle exists and `Intl.RelativeTimeFormat` otherwise, while digits follow the regional-format preference. Keep game names, paths, and API values outside those formatters.

The selected interface language sets the document language and direction. The shared direction resolver recognizes Arabic, Persian, Hebrew, and other RTL scripts. Inline spacing, alignment, borders, corners, and positions use logical Tailwind utilities; centered dialog anchors remain physical because their geometry is symmetric.

Outbound notifications use the shared, source-bound templates in `shared/notification-messages.ts` and headings in `shared/notification-locale.ts`. The per-user `notificationPreferences.language` field controls Apprise API and CLI delivery, including test messages, and the tagged default Discord stats heading. Custom Discord messages and untagged lookalikes stay unchanged; the captured stats image keeps the language of its browser-rendered content. The notification preference is independent of the browser-local interface language; legacy, invalid, unsupported, or unavailable preferences fall back to English. Persisted notifications keep their original source text so each browser can render its own interface language. Preserve provider diagnostics, paths, game names, and other dynamic values; unknown message bodies pass through unchanged. Do not send real notifications during validation.

Connection-test results carry optional `messageKey`/`messageValues` metadata emitted by `serviceMessage` at app-owned producer sites. `shared/service-messages.ts` binds these keys to English source templates; `localization/messages.json` supplies their translations. The client requires the source, key, and values to agree before formatting; untagged/provider content passes through unchanged. Preserve versions, provider diagnostics, paths, and account names as raw parameters. Add producer, client formatter, and HTTP route contract coverage when extending this surface. The fixed error/action-message inventory remains a separate review queue.

The shared service catalog is generated from the canonical manifest and the explicit ID registry in `localization/service-message-ids.json`. Both server and browser use the same exact source/key/value checks and optional nested descriptors. Only explicitly tagged app errors may carry nested localization; an ordinary provider Error with identical wording remains raw. `game_downloads.error_message_i18n` and `notifications.message_i18n` are nullable JSON metadata alongside the unchanged English text. Legacy null rows retain their text, and malformed or mismatched metadata cannot fall through to a different legacy notification matcher. Cover both SQLite and Postgres upgrades/round-trips when changing persistence.

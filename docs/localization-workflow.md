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
- Record `machine-draft`, `inherited`, or `reviewed` per locale when the translation history is known. Use `reviewed` only after a qualified human checks the wording and product context. Existing translations without an audit trail remain `legacy-unverified`.
- Review all translations affected by a source edit, then update that message's source checksum. A copy edit must not change the ID.

## Locale availability and fallback

The selector contains English plus the twelve complete target catalogs. The checker requires the selector and manifest locale lists to match and every target cell to be nonempty with matching placeholders. This blocks partial catalogs from appearing as complete interface languages.

Browser-language fallback is explicit: Portuguese regional tags resolve to Brazilian Portuguese; Chinese scripts take priority, then Taiwan/Hong Kong/Macau resolve to Traditional Chinese and China/Singapore resolve to Simplified Chinese; other supported regional tags fall back to their supported base language. Regional formatting remains independent from interface language.

Locale breadth can grow only when full message coverage is supplied. The current 13 selector choices are short of a 37-choice target by 24; this change adds the completeness gate, not fabricated translations.

## Message formatting and direction

Use `formatInterfacePluralMessage` for CLDR cardinal categories and exact-count overrides, and `formatInterfaceSelectMessage` for nonnumeric branches. Their forms refer to stable message IDs. Use `formatRegionalDate`, `formatRegionalNumber`, `formatRegionalPercent`, `formatRegionalUnit`, and `parseRegionalNumber` for locale-aware display and numeric input. Keep game names, paths, and API values outside those formatters.

The selected interface language sets the document language and direction. The shared direction resolver recognizes Arabic, Persian, Hebrew, and other RTL scripts. Inline spacing, alignment, borders, corners, and positions use logical Tailwind utilities; centered dialog anchors remain physical because their geometry is symmetric.

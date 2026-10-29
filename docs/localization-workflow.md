# Localization catalog workflow

## What is in this change

The navigation shell now has namespaced message IDs such as `navigation.library`. The ID resolves to the existing complete catalog entry during this migration, so current translations remain in use. New interface code can use `tId`, `languageForId`, and `directionForId`; legacy source-string helpers remain available while the rest of the catalog is migrated.

`localization-provenance.json` defines per-locale provenance states. Existing entries without auditable history use `legacy-unverified`; this is intentionally not marked as machine-draft, inherited, or reviewed. The checksum identifies copy changes while leaving the message ID stable. Updating a source checksum requires a translation review decision.

Run `npm run check:localization` to validate all selectable locale cells, interpolation placeholders, namespaced IDs, provenance records, and source checksums. `npm run check` runs this gate before TypeScript checking.

## Catalog and translation rules

- Add a locale to the interface selector only after every catalog entry has a nonempty translation and matching placeholders. The checker enforces this.
- Use stable IDs for new and migrated messages. Keep English source text as message content, not as identity.
- Use `machine-draft` for unreviewed generated wording, `inherited` for explicitly attributed prior translations, and `reviewed` only after human review. Keep the attribution and review decision in the provenance data.
- Use the [translation glossary](./translation-glossary.md) for game-domain terms and protected values.
- Keep game names, release names, paths, identifiers, API values, and provider details intact. Use language metadata and automatic direction for mixed-script values.

## Remaining migration work

The existing 1,980-entry catalog is still keyed by English source strings outside the navigation ID slice. The current twelve translated locales remain complete for catalog entries, while app-wide UI string routing, a full stable-ID catalog migration, broad native-speaker review, and additional fully translated locales remain separate work. The checker prevents adding an incomplete locale; it does not fabricate or machine-translate catalog content.

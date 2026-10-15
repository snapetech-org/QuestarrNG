# Release-note fragments

For any user-facing change, add one structured fragment under `release-notes/` describing it. A
single fragment may cover related user-facing changes in the same pull request. Keep shipped fragments unchanged.
The tag workflow adds new fragments to the versioned GitHub release notes and
the Discord announcement. Keep `docs/CHANGELOG.md` as the chronological release
history.

Each fragment has YAML-style frontmatter and one release-ready sentence:

```md
---
category: fixed
audience: users, operators
area: downloads
action: none
breaking: false
---

Download searches now keep their API credentials private when an indexer returns an error.
```

Supported categories are `added`, `changed`, `fixed`, `security`, `removed`,
and `deprecated`. Set `audience` to `users`, `operators`, or both; use a short
lowercase `area` slug; describe any required operator action or use `none`; and
mark whether the change is breaking. Breaking changes must include an action.

Keep the body between 30 and 400 characters, start with a capitalized sentence,
and end with punctuation. Released fragments are immutable: add a new file for
later refinements instead of editing a fragment already shipped in a release.

Preview the notes added between two refs with:

```sh
npm run release-notes:preview -- --base origin/main --head HEAD
```

The `v2.1.0` release deliberately assembles notes from `v1.11.0` to backfill
the notes missing from the currently published `v2.0.0` GitHub release body.
Later releases use the latest published stable tag as their base.

For internal-only work, no fragment is needed. In a pull request, either select the internal-only
option in the template or put `release-note: none` on its own line in the description. When a
direct push or merge check reads commit messages, put the same marker on its own line in the
commit message.

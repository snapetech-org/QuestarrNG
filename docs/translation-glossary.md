# QuestarrNG translation glossary

Use these meanings consistently across interface copy, help text, notifications, and API summaries.

| Source term | Meaning and translation guidance |
|---|---|
| Game | A catalog item in the user's game library. Do not translate a game's actual title. |
| Release | A downloadable release record returned by an indexer or provider. Preserve the release's original title and group tag. |
| Update / patch | A later game version or corrective package. Keep it distinct from a full game release. |
| DLC / expansion | Add-on content associated with a base game. Preserve vendor product names. |
| Pack / add-on | A grouped download or bundle when the product context does not specifically mean DLC. |
| Wanted | A user-selected game they intend to acquire; it is a library status, not a generic desire. |
| Library import | The operation that matches downloaded files to a game and moves or records them in the library. |
| Indexer | A configured source used to search for release listings. |
| Downloader | A configured client that retrieves a selected release. |
| Seeder | A peer sharing data for a torrent. |
| Grab | A release or download selected by the user or automation. |
| Platform | A game platform such as PC, PlayStation, or Nintendo Switch. Keep product and protocol names as supplied. |

Keep these values unchanged: game titles, release names and group tags, file paths, filenames, URLs, hashes, API identifiers, status codes, provider-supplied text, and protocol names such as RAWG, IGDB, Steam, Torznab, and xREL.to. Localize the surrounding explanation and labels only.

For each translation, record whether it is a machine draft, inherited, reviewed, or legacy-unverified. A reviewed status means a qualified human checked the wording and product context; automated placeholder checks alone do not count as translation review.


## Regional catalog inheritance

An inherited catalog is a complete copy of its named parent locale, recorded per message. It is useful as a regional fallback, but it is not a reviewed regional translation. Keep the source relation explicit until a qualified translator reviews and updates the regional wording. For this catalog, es-419 inherits from es and fr-CA inherits from fr. Preserve region-specific terminology and spelling when the review replaces inherited text.

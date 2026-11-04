# Game library interchange

QuestarrNG exports and imports a user's tracked collection as a versioned JSON file. Use **Settings → Imports → Library Interchange** to download an export, inspect an import preview, and add new games.

The format identifier is `questarrng-library`, version `1`. Version 1 carries provider IDs, title and game metadata, collection status, personal rating, hidden state, and content flags. Only HTTPS cover and screenshot URLs are retained.

Exports omit installed files, library paths, downloader state, download history, credentials, app settings, and user account data. This is a portable collection backup; it is not a full QuestarrNG database backup.

Imports are limited to 1,000 games and 5 MB. The preview shows records that will be added and duplicates that will be skipped. Existing records are not overwritten. Import never starts a download or writes to the filesystem. If a database error interrupts an import, the response reports the number added and failed; re-importing the same file is safe because existing games are checked again.

The authenticated API is:

- `GET /api/games/export`
- `POST /api/games/import/preview`
- `POST /api/games/import`

Metadata refresh fills missing fields by default and keeps existing metadata. Enable **Replace existing metadata** in Settings to explicitly refresh populated fields from IGDB, or call the refresh endpoint with `?overwrite=true`.

## qBittorrent API-key authentication

In the qBittorrent downloader form, enable **Use Bearer API key** and enter the key in the credential field. This mode requires qBittorrent 5.2.0 / Web API 2.14.1 or newer. The key is sent in the Authorization Bearer header, must be sent over HTTPS unless **Allow insecure LAN** is explicitly enabled, and is never retried as a password session after an authorization failure. Redirects are not followed in API-key mode.

## Library scan recovery

Scan progress, processed candidate names, and unmatched review candidates are saved in the existing database. A server restart marks an in-progress scan as interrupted. Starting the scan again resumes at the first candidate not recorded as complete and keeps the unmatched candidates already waiting for review. If the root path changed, the scan starts a fresh pass.

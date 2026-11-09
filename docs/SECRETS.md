# Secrets & Credentials Management

This document describes every place QuestarrNG stores or handles sensitive
values — environment configuration, third-party API credentials, and the
indexer/downloader/user credentials that users enter through the app — how
access to them is controlled, and how they get rotated. It reflects the
current state of the code; gaps are called out explicitly rather than
glossed over.

## 1. Environment variables

All configuration is optional; sensible defaults are used when a variable
is unset. See [`.env.example`](https://github.com/Doezer/Questarr/blob/main/.env.example) for the canonical template.
`.env` is loaded once via `dotenv/config` at `server/index.ts:2` and parsed
against a Zod schema in `server/config.ts:10-59`. If any variable fails
validation, the server logs the error and exits (`server/config.ts:64-80`)
rather than starting with an invalid configuration.

| Variable                                | Purpose                                                                                 | Required?                                                                                                                                                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `JWT_SECRET`                            | Signs/verifies session JWTs                                                             | No — auto-generated and persisted to the DB if unset (§2)                                                                                                                                                                                  |
| `NEXUSMODS_API_KEY`                     | NexusMods mod lookups                                                                   | No — validated by `envSchema`; can be set later in Settings → Integrations (§3)                                                                                                                                                            |
| `STEAM_API_KEY`                         | Steam achievements in a game's Journal tab                                              | No — env-only; without it the achievements section is simply hidden (`server/config.ts`, `GET /api/settings/steam`)                                                                                                                        |
| `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` | Twitch/IGDB OAuth for game metadata & discovery                                         | No env-wise, but one of env/DB must be set for discovery to work                                                                                                                                                                           |
| `PORT`                                  | HTTP port; Docker Compose also uses it as a fallback for both sides of its port mapping | No (default `5000`); `HOST_SIDE_PORT` and `CONTAINER_INTERNAL_SIDE_PORT` override the respective Compose port values                                                                                                                       |
| `HOST`                                  | Bind address                                                                            | No — **defaults to `0.0.0.0` (all interfaces) in every deployment mode**, not just Docker (`server/config.ts:52`). Set `HOST=127.0.0.1` explicitly if you don't want the server reachable from other machines on the network.              |
| `NODE_ENV`                              | `development` \| `production` \| `test`                                                 | No (defaults to `production`)                                                                                                                                                                                                              |
| `SQLITE_DB_PATH`                        | Path to the SQLite database file                                                        | No (default `sqlite.db`)                                                                                                                                                                                                                   |
| `CREDENTIALS_ENCRYPTION_KEY`            | AES-256 key encrypting indexer/downloader credentials at rest                           | Optional. If unset, QuestarrNG generates a 32-byte key in `<config-dir>/secrets/credentials.key` for either database backend. Multiple app instances sharing PostgreSQL must share this file or use the same 64-hex-character env key (§4) |
| `ARCHIVE_MAX_ENTRIES`                   | Max entries an archive may list before import extraction                                | No (default `50000`). Archives listing more entries are refused before extraction. See [Archive extraction limits](#archive-extraction-limits)                                                                                             |
| `ARCHIVE_MAX_EXPANDED_BYTES`            | Max total declared uncompressed size of an archive, in bytes                            | No (default `268435456000`, 250 GiB). Archives declaring more are refused before extraction. See [Archive extraction limits](#archive-extraction-limits)                                                                                   |
| `LOG_LEVEL`                             | Pino log level (`trace`, `debug`, `info`, `warn`, `error`)                              | No (default `info` in production, `debug` otherwise)                                                                                                                                                                                       |
| `SSL_PORT`                              | HTTPS port when SSL is enabled in Settings                                              | No (default `9898`); overrides the port saved in `config.yaml`                                                                                                                                                                             |
| `SEVENZIP_PATH`                         | Path to the 7-Zip binary used for archive extraction                                    | No; the Docker image ships one, other installs search the usual locations                                                                                                                                                                  |
| `UNRAR_PATH`                            | Path to the `unrar` binary used for RAR archives                                        | No; the Docker image ships one, other installs search the usual locations                                                                                                                                                                  |
| `APPRISE_CLI_PATH`                      | Path to the `apprise` CLI for notifications in CLI mode                                 | No; the Docker image ships one, other installs search `PATH`                                                                                                                                                                               |
| `TRUST_PROXY`                           | Trust `X-Forwarded-For` / `X-Forwarded-Proto` from a reverse proxy                      | No (default off). Set `1` (hop count) or the proxy's IP/subnet when Questarr sits behind a reverse proxy, so rate limits see real client IPs. See [REVERSE_PROXY.md](REVERSE_PROXY.md#3-trust-the-proxy-trust_proxy)                       |

For the optional PostgreSQL backend, set `DB_DIALECT=postgres` and supply
`DATABASE_URL`. That connection string contains the database username and
password; keep it out of source control and protect the environment file or
secret store that supplies it. See [`docs/DATABASE.md`](DATABASE.md).

A legacy hardcoded default, `"questarr-default-secret-change-me"`, is
explicitly rejected by a Zod `.refine()` (`server/config.ts:18-24`) so the
app can never silently run with that well-known value.

The `.env` file itself is git-ignored (see `.gitignore`) and must never be
committed. `docker-compose*.local.yml` and `gha-creds-*.json` are ignored
for the same reason.

### Archive extraction limits

When an import finds an archive (`.rar`, `.zip`, `.7z`, and so on), Questarr
lists its contents and checks every entry before extracting anything. RAR
archives are listed with `unrar lt -v`; other formats use 7-Zip. Questarr
refuses the archive, and the import fails with an error, if any of these is
true:

The Docker image compiles RARLAB UnRAR 7.23 from a source archive pinned by
SHA-256 for the target architecture. This keeps RAR and multi-volume extraction
available on both amd64 and arm64 and includes [RARLAB's 7.23 archive-safety
fixes](https://www.rarlab.com/rarnew.htm). The image retains the required license
at `/usr/share/licenses/questarr/UNRAR-LICENSE.txt`.

| Check                                                                                         | Error message                                                       |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| More entries than `ARCHIVE_MAX_ENTRIES`                                                       | `Archive contains too many entries (limit: N).`                     |
| Total declared uncompressed size above `ARCHIVE_MAX_EXPANDED_BYTES`                           | `Archive expands beyond the configured size limit (N bytes).`       |
| An entry with an absolute path, a drive letter (`C:`), a `..` segment, or more than 64 levels | `Archive contains an unsafe file path.`                             |
| An entry that would resolve outside the extraction directory                                  | `Archive contains a file path outside the extraction directory.`    |
| A symbolic link or hard link                                                                  | `Archive contains a symbolic or hard link, which is not extracted.` |
| An entry with a missing or invalid uncompressed size                                          | `Archive contains an entry with an invalid uncompressed size.`      |

The path and link checks always apply. If a legitimate release is refused
for size or entry count, raise the matching limit and restart the server:

```bash
# .env
ARCHIVE_MAX_ENTRIES=200000
ARCHIVE_MAX_EXPANDED_BYTES=536870912000 # 500 GiB
```

Both values must be positive whole numbers. Questarr reads them at startup,
outside the Zod schema above, so an empty, zero, negative, or non-numeric
value is ignored and the default applies instead of stopping the server.
See [`docs/SECURITY_ASSESSMENT.md`](SECURITY_ASSESSMENT.md) for why these
checks exist.

## 2. Authentication secret (`JWT_SECRET`)

`JWT_SECRET`, when set, must contain at least 32 UTF-8 bytes and must not
be the legacy default. Invalid overrides stop startup without logging the
secret. Use a random value, for example `openssl rand -hex 32`, or leave
the variable unset to generate one. Weak secrets found in `system_config`
are replaced with 64 random bytes on first use; this invalidates sessions
signed with the old weak secret. Strong persisted secrets are preserved.

Session tokens are signed HS256 JWTs (`jsonwebtoken`), 7-day expiry
(`server/auth.ts:77-82`), verified on every authenticated request by
`authenticateToken` / `optionalAuthenticateToken` (`server/auth.ts:88-126`).

Resolution order for the signing secret, `getJwtSecret()`
(`server/auth.ts:13-67`):

1. In-memory cache for the life of the process.
2. `JWT_SECRET` environment variable.
3. Value stored in the `system_config` table under key `jwt_secret`.
4. If none of the above exist, generate 64 random bytes
   (`crypto.randomBytes(64).toString("hex")`) and persist them to
   `system_config` for future restarts.

If DB persistence fails (e.g. read-only filesystem), the generated secret
is still used in memory for that process, but a warning is logged since it
won't survive a restart and will invalidate all sessions when it does.

**Rotation:** there is no dedicated "rotate JWT secret" endpoint. To force
all users to re-authenticate, either set/change the `JWT_SECRET` env var,
or delete the `jwt_secret` row from `system_config` — a new one will be
generated automatically on next use. Either action invalidates every
existing session.

## 3. Third-party API credentials

| Service                                          | Where configured                                                      | Storage                                                                                                                                                                                                | Refresh/rotation                                                                                                                                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **IGDB** (via Twitch OAuth)                      | `.env` (`IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET`) or Settings → Services | DB `system_config` keys `igdb.clientId` / `igdb.clientSecret` take priority over env if both are present (`server/igdb.ts:138-153`)                                                                    | Twitch access token is fetched via `client_credentials` grant and cached in memory, auto-refreshed ~1 minute before expiry (`server/igdb.ts:187-214`). Client ID/secret themselves are user-rotated via the Settings UI. |
| **NexusMods**                                    | `.env` (`NEXUSMODS_API_KEY`) or Settings → Services                   | DB `system_config` key `nexusmods.apiKey`; client reconfigured in-memory on save (`server/nexusmods.ts:46-69,176-182`)                                                                                 | Manual — overwrite the key in Settings.                                                                                                                                                                                  |
| **HowLongToBeat**, **PCGamingWiki**, **xREL.to** | N/A                                                                   | N/A                                                                                                                                                                                                    | These are unauthenticated public APIs; no credentials involved.                                                                                                                                                          |
| **Steam** wishlist import                        | N/A (public Steam endpoints + user's `steamId64`)                     | N/A                                                                                                                                                                                                    | N/A                                                                                                                                                                                                                      |
| **Steam** Web API (achievements)                 | `.env` (`STEAM_API_KEY`) only — no Settings UI                        | Env-only; never persisted to the DB. `GET /api/settings/steam` returns only `{ apiKeyConfigured: boolean }`, never the key itself (`server/routes.ts`)                                                 | Manual — change the environment variable and restart the server.                                                                                                                                                         |
| **VirusTotal** pre-import scan                   | Settings → Post-Processing → Security & Scanning                      | DB `system_config` key `security.vt.apiKey`, plaintext; the Settings API returns a masked sentinel and keeps the existing key when that sentinel is resubmitted (`server/routes.ts:299-336,4823-4873`) | Manual — replace the key in Security & Scanning settings.                                                                                                                                                                |
| **Discord** notification webhook                 | Settings → Services                                                   | DB `system_config` key `discord.webhookUrl`, plaintext (`server/routes.ts:2769-2801`)                                                                                                                  | Manual — overwrite the URL in Settings.                                                                                                                                                                                  |

For credential-editing settings, `GET` never returns the actual secret. When
updating other fields, send the sentinel string `"********"` to keep an
unchanged secret. `GET /api/settings/igdb` returns
the `clientId` but never the `clientSecret` (`server/routes.ts:2709-2768`
sends/accepts the sentinel). `GET /api/settings/nexusmods` returns only
`{ configured, source }` booleans (`server/routes.ts:3311-3342`).
`GET /api/settings/discord` returns `{ configured, webhookUrl: "********" }`
when set, and `POST` treats the sentinel as "no change"
(`server/routes.ts:2769-2801`). The VirusTotal key is likewise masked by
`GET /api/settings/security-scan` and its sentinel means "keep the current
key" on `POST` (`server/routes.ts:4823-4873`). These handlers sit behind
`sensitiveEndpointLimiter`. The VirusTotal key is stored unencrypted in the
database, so protect the QuestarrNG database and its backups accordingly.

When PostgreSQL is enabled with `DB_DIALECT=postgres`, `DATABASE_URL` contains
the database username and password. Keep it out of source control and protect
the environment file or secret store that supplies it. See
[`docs/DATABASE.md`](DATABASE.md) for backend configuration.

## 4. User-entered indexer & downloader credentials

This is the largest surface of stored secrets: Torznab/Newznab indexer API
keys, and usernames/passwords for download clients (qBittorrent,
Transmission, rTorrent, sabnzbd, nzbget).

- **Storage:** encrypted at rest. `indexers.apiKey` and
  `downloaders.username` / `downloaders.password` are AES-256-GCM encrypted
  before being written to the database and decrypted on read
  (`server/credential-crypto.ts`, wired into `server/storage.ts`'s
  `addIndexer`/`updateIndexer`/`getIndexer`/`getAllIndexers`/`getEnabledIndexers`/
  `syncIndexers` and the equivalent downloader methods). Each encrypted value
  is prefixed `enc:v1:` and stores a random 12-byte IV + auth tag + ciphertext,
  base64-encoded — so two encryptions of the same plaintext never look alike
  at rest. Rows written before this feature existed are legacy plaintext;
  `decryptCredential()` detects the missing prefix and returns them unchanged
  (no migration required), and they get encrypted the next time they're
  saved.
  - **Encryption key:** When set, `CREDENTIALS_ENCRYPTION_KEY` is used and
    copied to the private key file when the config directory is writable; an
    existing file with a different key causes startup to fail. With
    either SQLite or PostgreSQL and no env key, QuestarrNG generates a random
    32-byte key in the config directory's `secrets/credentials.key` file
    (`data/secrets/credentials.key` by default) with owner-only permissions on
    POSIX systems. When an env key is supplied, QuestarrNG also persists it to
    that file when the config directory is writable. Existing installations
    migrate the legacy key out of `system_config` after the private file is
    persisted. Keep the config directory persistent and include this key file
    in protected backups alongside the database; a database-only dump no longer
    contains the decryption key. If multiple app instances share PostgreSQL,
    mount the same key file for all instances or set the same env key on each.
    A one-way fingerprint in `system_config` makes an instance fail startup if
    it resolves a different key; the database does not store the key itself.
    Losing or changing the key makes previously encrypted rows undecryptable.
    This includes the saved Prowlarr API key (`prowlarr.apiKey`, see below);
    after key loss, re-enter it in the sync dialog.
- **Saved Prowlarr sync settings:** after a successful
  `POST /api/indexers/prowlarr/sync`, Questarr saves the dialog values in
  `system_config` so the next sync starts prefilled. `prowlarr.url` holds
  the Prowlarr URL. `prowlarr.apiKey` holds the API key, encrypted as
  `enc:v1:` with the same credentials encryption key as indexer rows.
  `prowlarr.syncDefaults` holds the insecure-LAN opt-in, priority, and
  categories. A failure to save these values is logged and does not fail
  the sync.
  - `GET /api/indexers/prowlarr/settings` returns the saved URL and options,
    but returns `"********"` in place of the API key. The stored key never
    leaves the server.
  - When the sync request sends `"********"` as `apiKey`, the route swaps in
    the saved key only if `url` exactly matches the saved `prowlarr.url`.
    Otherwise it returns `400` with
    `"Enter the Prowlarr API key again for this URL"`. This prevents the
    saved key from being sent to a different host.

  ```json
  POST /api/indexers/prowlarr/sync
  {
    "url": "http://prowlarr.lan:9696",
    "apiKey": "********",
    "allowInsecureLan": true
  }
  ```

- **Insecure-LAN opt-in (`allowInsecureLan`):** Questarr sends an indexer's
  API key only to `https://` URLs, or to `http://` URLs when the indexer has
  the per-indexer "Allow insecure LAN connection" opt-in. Over plain HTTP
  without the opt-in, the request goes out without the key.
  - The Prowlarr sync dialog can set the opt-in in bulk for every synced
    indexer. The checkbox is unticked by default, and Questarr never infers
    it from the URL scheme. When the request omits `allowInsecureLan`,
    existing indexers keep their current value.
  - When an indexer answers `401` or `403` and the key was withheld for this
    reason, the error message says so and tells you to enable "Allow
    insecure LAN connection" on the indexer or switch it to HTTPS.
  - The indexer and downloader `/test` endpoints honor `allowInsecureLan`,
    so a connection test behaves the same way as real searches and
    downloads.
  - SQLite migrations `0033`/`0034` add the flags with default `0`; migration
    `0044` then opts existing HTTP indexers and downloaders in once to
    preserve 1.4.x connections. This also re-enables SQLite release-candidate
    HTTP opt-outs, so review them after upgrading. New connections remain
    opted out. PostgreSQL has no backfill and preserves existing choices.
- **In transit to the indexer/download client:** the storage layer decrypts
  transparently, so `server/downloaders/*.ts` and `server/search.ts` receive
  plaintext exactly as before — HTTP Basic Auth (base64, not encryption) for
  qBittorrent/Transmission-style clients, and RFC 2617 Digest Auth
  challenge-response for rTorrent (`server/downloaders/rtorrent.ts`).
  Only SHA-256 Digest is supported. Classic RFC 2617 MD5 and unrecognized
  algorithms are rejected; upgrade rTorrent/ruTorrent to advertise SHA-256.
  Digest authentication does not encrypt request or response bodies, so use
  TLS even when SHA-256 is available.
- **Access control / API exposure:** every indexer/downloader route sits
  behind the global `authenticateToken` middleware (`server/routes.ts:821-829`).
  `GET /api/indexers`, `GET /api/indexers/:id`, `GET /api/downloaders`, and
  `GET /api/downloaders/:id` mask the secret field before responding —
  `apiKey` / `password` come back as `"********"` whenever a real value is
  set (`maskIndexer`/`maskDownloader` helpers, `server/routes.ts`). The same
  masking applies to the `POST`/`PATCH` responses. `username` is not treated
  as a secret and is still returned in full, matching how it's used (a login
  name, not a token).
- **Rotation:** `PATCH /api/indexers/:id` / `PATCH /api/downloaders/:id`
  follow the IGDB masked-sentinel convention — sending `"********"` for
  `apiKey`/`password` leaves the stored value unchanged (the sentinel is
  stripped from the update before it reaches storage); sending any other
  value overwrites and re-encrypts it. This is what lets the edit dialogs
  prefill the field with the mask without silently clobbering the real
  secret on save.

## 5. User account passwords

`users.passwordHash` (`shared/schema.ts:6-11`) never stores plaintext.
Hashing uses `bcryptjs` with `SALT_ROUNDS = 10` (`server/auth.ts:1,10,69-75`).
Passwords are hashed on signup (`server/routes.ts:309`), verified on login
(`server/routes.ts:369-371`), and the password-change endpoint requires the
current password before accepting a new one
(`server/routes.ts:392-419`).

## 6. Rate limiting around credentials (`server/middleware.ts`)

| Limiter                    | Limit                     | Applied to                                                                                               |
| -------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `authRateLimiter`          | 20 requests / 15 min / IP | `POST /api/auth/login`                                                                                   |
| `sensitiveEndpointLimiter` | 30 requests / min / IP    | Indexer/downloader writes, password change, IGDB/NexusMods/Discord settings, SSL settings, Prowlarr sync |
| `generalApiLimiter`        | 600 requests / min / IP   | General fallback                                                                                         |
| `scanRateLimiter`          | 10 requests / min / user  | `GET /api/games/:gameId/files` (on-disk file scan for a game)                                            |

`scanRateLimiter` keys on the authenticated user ID. For unauthenticated
requests it falls back to the client IP, grouping IPv6 addresses by subnet
so a single client can't bypass the limit by rotating addresses within its
prefix.

There is no account lockout beyond the IP-based `authRateLimiter` window
for repeated failed logins.

## 7. Version control hygiene

Secret-bearing files are excluded via `.gitignore`: `.env`, `sqlite.db*`,
`data/*`, `data_test/`, `.sofa/` (SOFA agent credentials —
see `.claude/sofa-skill.md`), and `gha-creds-*.json`. No `.env` or database
file is currently tracked in git. Never commit real credentials in
`docker-compose*.yml` — use `.env` or a local override file
(`docker-compose.*local.yml`, also git-ignored) instead.

## 8. Credential exposure in operational scripts

**Real in v1.1.0–v1.3.1. Fixed in v1.4.0. Rotate if you kept the logs.**

`scripts/pg-to-sqlite.ts` logged the full `DATABASE_URL` connection string
before connecting:

```ts
console.log(`Connecting to Postgres: ${pgUrl}`); // v1.1.0 – v1.3.1
```

Per standard `postgresql://` URL convention that string embeds
`user:password@host`, so the credential was printed in plaintext, where it
could land in CI logs, container logs or shell history.

Commit `99984867` ("Fix visible postgreSQL URL in migration log") removed the
interpolation. From **v1.4.0** onward the line is a constant
``console.log(`Connecting to Postgres`)`` and the script logs nothing derived
from `DATABASE_URL` — the only connection detail it prints is the SQLite path,
which is not a credential.

| Tags                                                       | Behavior          |
| ---------------------------------------------------------- | ----------------- |
| `v1.1.0`, `v1.2.0`, `v1.2.1`, `v1.2.2`, `v1.3.0`, `v1.3.1` | logs the full URL |
| `v1.4.0`, `v1.4.1`, `v1.4.2`                               | constant, no URL  |

**If you ran the migration on any of the six affected tags and still hold those
logs, treat that Postgres password as exposed and rotate it.** Purging the logs
is not sufficient on its own if they were ever shipped to a log aggregator or a
CI provider.

This section previously read as an open, unfixed finding, because it was never
updated when `99984867` landed. It also carried a line reference that by then
pointed at the fixed line. The script has since been removed entirely, for
unrelated reasons — it understood only 8 of the project's 19 tables — see
[MIGRATION.md](./MIGRATION.md). The archived **v1.4.2** tool that migration now
points operators at is on the safe side of the fix.

## 9. Summary checklist for operators

- [ ] Set `JWT_SECRET` explicitly in production so sessions survive
      restarts and DB resets.
- [ ] Keep `<config-dir>/secrets/credentials.key` persistent and back it up
      with the database. For multiple PostgreSQL app instances, mount the same
      key file or provide the same `CREDENTIALS_ENCRYPTION_KEY` to each one.
- [ ] Set IGDB and (optionally) NexusMods credentials via `.env` or
      Settings → Services.
- [ ] If using PostgreSQL, protect `DATABASE_URL` and its password-bearing
      environment file or secret store.
- [ ] Restrict who has login access to the app — QuestarrNG has no per-user
      role scoping, so any account holder can use every configured
      indexer/downloader (though the API keys/passwords themselves are
      masked in responses and encrypted at rest, per §4).
- [ ] Run behind HTTPS/a reverse proxy per `docs/SECURITY.md`.
- [ ] Never commit `.env`, `sqlite.db`, or `docker-compose.local.yml`.
- [ ] If you ran `pg-to-sqlite` on v1.1.0–v1.3.1 and kept the logs, rotate that
      Postgres password — those versions printed the full `DATABASE_URL` (§8).
- [ ] If running the archived v1.4.2 `pg-to-sqlite` migration tool, set
      `DATABASE_URL` to your real source credentials and verify the row counts
      it reports — it continues past per-table failures and still reports
      success (see [MIGRATION.md](./MIGRATION.md)).

## 10. GitHub Actions secrets

Repository secrets are available to every workflow in this repository. Do not
store integration credentials at repository or organization scope when an
environment can restrict their use. The Codecov upload workflow uses the
`codecov-main` environment, restricted to `main`. Discord announcements use the
`discord-release` environment, restricted to `main`. Tag announcements run
from a separate default-branch `workflow_run` workflow after the image-release
workflow succeeds; manual announcements run only from `main`.

The release webhook is stored as `DISCORD_WEBHOOK` in the `discord-release`
environment, restricted to `main`. The former repository-level
`DISCORD_RELEASE_WEBHOOK` has been removed. Keep it removed so
same-repository pull-request workflows cannot read the webhook. Tag announcements
use the trusted default-branch `workflow_run` workflow after a successful image
release; both that path and manual announcements fail if the environment secret
is missing.

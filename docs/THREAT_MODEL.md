# QuestarrNG — Threat Model & Attack Surface Analysis

**Version:** 1.0
**Date:** 2026-10-04
**Last reviewed:** 2026-10-13
**Author:** Snapetech maintainers
**Audience:** Maintainers, contributors, security reviewers

---

## 1. Purpose & Scope

This document is QuestarrNG's attack-surface analysis, satisfying [OpenSSF Baseline
OSPS-SA-03.02](https://baseline.openssf.org/): it identifies critical code paths, trust
boundaries, and external interactions, and records how each threat is mitigated or
knowingly accepted.

**In scope:** the Express API and its route handlers, the React client, the SQLite/Postgres
Drizzle data layer, Socket.io realtime channel, SeerrNG provider API, downloaded archive
contents, PC and RomM library folders, optional VirusTotal and ClamAV scanning, and every
external service QuestarrNG talks to (indexers, download clients, IGDB, Steam,
HowLongToBeat, NexusMods, xREL, PCGamingWiki).

**Out of scope:** OS/host hardening, reverse proxy/TLS termination, and Docker deployment
configuration — those are covered by [`docs/SECURITY.md`](SECURITY.md)'s
deployment security guide.

**Maintenance rule:** update this document whenever a change adds a new external
integration, a new trust boundary, a new unauthenticated route, or materially changes
authentication/authorization behavior. This is enforced as part of the security-relevant
test policy in [`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md). Bump the "Last
reviewed" date above whenever this document is revisited, even if no changes are needed —
a stale date is the signal that a review is overdue.

---

## 2. System Overview & Trust Boundaries

```mermaid
flowchart LR
    Browser["Browser (React SPA)"]
    API["Express API"]
    Gate{{"default-deny auth gate\nJWT or scoped integration key"}}
    Handlers["Route handlers"]
    DB[("SQLite / Postgres\n(Drizzle ORM)")]
    Socket["Socket.io\n(unauthenticated broadcast)"]
    SSRF{{"safeFetch / isSafeUrl\nssrf.ts"}}
    Seerr["SeerrNG server\nscoped, expiring key"]
    Archives["Downloaded archives\nuntrusted release data"]
    Import["ImportManager\nPC / RomM destinations"]
    Scans["Optional SecurityScanService"]
    VT["VirusTotal\nSHA-256 lookup"]
    ClamAV["Configured ClamAV daemon\nINSTREAM file data"]
    Quarantine["Sibling quarantine folder"]
    RomM["RomM library\nshared filesystem"]

    Browser -- "JWT bearer" --> API
    Seerr -- "provider API key / JWT" --> API
    API --> Gate --> Handlers
    Handlers --> DB
    Handlers -.-> Socket
    Socket -.-> Browser
    Handlers --> SSRF
    SSRF --> Indexers["Indexers\n(Torznab/Newznab/Prowlarr)\nuser-configured"]
    SSRF --> Downloaders["Download clients\n(qBittorrent/Transmission/rTorrent/\nSABnzbd/NZBGet)\nuser-configured, typically LAN"]
    SSRF --> RSS["RSS feeds\nuser-configured"]
    SSRF --> IGDB["IGDB / Twitch OAuth\nhardcoded host"]
    SSRF --> Steam["Steam / HLTB / NexusMods /\nxREL / PCGamingWiki\nhardcoded hosts"]
    Handlers --> Archives
    Handlers --> Import
    Import --> Scans
    Scans -- "hash only" --> VT
    Scans -- "file stream" --> ClamAV
    Scans -- "flagged" --> Quarantine
    Scans -- "continue" --> Import
    Import --> RomM
```

Eight named trust boundaries:

1. **Browser ↔ Server** — JWT bearer auth (`server/auth.ts`). Once authenticated, a user has
   full access to their own resources; there is no admin/non-admin split (see Section 8,
   "flat trust model" — an accepted design tradeoff, not a gap).
2. **Server ↔ SQLite/Postgres** — fully trusted; all access is parameterized via Drizzle ORM.
3. **Server ↔ user-configured external hosts** (indexers, download clients, RSS feeds) —
   **the highest-risk boundary**. A user (or a compromised/malicious indexer response) can
   point the server at an arbitrary host, including internal LAN services. This is the
   primary reason `server/ssrf.ts` exists.
4. **Server ↔ hardcoded external APIs** (IGDB, Steam, HLTB, NexusMods, xREL, PCGamingWiki) —
   lower risk since hosts aren't user-supplied, but responses are still untrusted data, and
   `safeFetch`/`isSafeUrl` is applied as defense in depth regardless.
5. **SeerrNG ↔ provider API** — the caller is a separate trusted self-hosted service, but
   request IDs, titles, and variants are untrusted input. A dedicated API key can be limited
   to the versioned SeerrNG routes and expires by default; every operation is scoped to the
   QuestarrNG account that owns the key.
6. **Downloaded archive ↔ filesystem** — release archives are untrusted even when fetched
   through an administrator-configured indexer. Before extraction, QuestarrNG checks listed
   paths, links, declared expanded size, and total entry count; extraction also has a 30-minute
   process timeout and bounded listing output.
7. **Server ↔ optional scanners** — VirusTotal receives only a SHA-256 hash over HTTPS; the
   configured API key stays server-side. ClamAV receives scanned file contents over its
   INSTREAM TCP protocol at a DNS-validated address. That connection is not encrypted, so
   operators should keep the configured daemon on a trusted network.
8. **GitHub Actions ↔ candidate source** — pull-request code, lockfiles, and generated
   reports are untrusted. The base-sourced `trusted-pr-validation` workflow runs the exact
   candidate snapshot with a read-only token and no repository secrets, using Bubblewrap,
   a trusted npm runtime, registry-only dependency URLs, and offline tests. Regular test and
   build jobs also use a reviewed launcher and sandbox. Codecov reports are uploaded by a
   default-branch `workflow_run` job only for same-repository pushes to `main`, behind the
   `codecov-main` environment restricted to `main`. The uploader checks out only the trusted
   repository default branch; Codecov's `override_commit` associates reports with the exact
   triggering CI commit without checking out workflow-run source code in the secret-bearing
   job. Discord tag announcements run from a default-branch `workflow_run` workflow only
   after the trusted image-release workflow
   succeeds; manual announcements are limited to dispatches from `main`. Both use the
   `discord-release` environment, restricted to `main`. The old repository-level webhook
   secret remains a migration item until a new environment secret is configured and the
   repository secret is deleted.

---

## 3. Assets

- **Credentials:** user password hashes, the JWT signing secret, indexer API keys,
  download-client passwords, NexusMods and VirusTotal API keys. See
  [`docs/SECRETS.md`](./SECRETS.md) for the authoritative inventory of where each of these
  lives and how it's protected.
- **Library/download metadata:** game collections, download history — low sensitivity, but
  cross-user leakage is a privacy concern (see Socket.io note in Section 8).
- **Server availability:** self-hosted, typically on a home server/NAS — denial of service
  matters more here than in a scaled cloud deployment.
- **The host LAN:** the top SSRF concern. Download clients are frequently on the same
  network as other unauthenticated home-lab services; inducing the server to make requests
  to arbitrary internal hosts is the most damaging class of attack against this app.

---

## 4. High-Risk Data Flows

### 4.1 Indexer search → download client

Search query → indexer (Torznab/Newznab/Prowlarr, user-configured URL) → parsed result
(payload URLs from the indexer's response, untrusted) → `isSafeUrl()` check → `safeFetch()`
to retrieve the `.torrent`/`.nzb` payload → handed to the download client.

Mitigations:

- `server/ssrf.ts` `isSafeUrl()`/`safeFetch()` — DNS-rebinding-safe resolution (validates
  every resolved IP, not just the first), blocks cloud metadata ranges.
- `server/downloaders.ts:333,970,1893,3439,4057` — `isSafeUrl()` gate before fetching a
  release's payload URL; `:3447,4063` — `safeFetch()` for the actual NZB fetch.
- `server/torznab.ts:69,446` and `server/newznab.ts:53,114,311,320,373,382` — indexer
  clients gate search-result URLs the same way before fetching.
- `server/middleware.ts:300,373,427` — `sanitizeDownloaderData`/`sanitizeIndexerData` block
  `..` in user-supplied download paths at write time (see residual risk in Section 8).
- `server/downloaders/utils.ts:buildRemoteImportPath` rejects absolute and parent-directory
  components in downloader-reported relative paths before joining them. Manual import path
  overrides without explicit path mappings must remain inside the tracked download directory.

Note: raw `fetch()`/RPC calls inside `downloaders.ts` that target the **admin-configured
download client itself** (e.g. the Transmission/qBittorrent control API) are not SSRF-gated,
and don't need to be — that host is the trust anchor the admin explicitly configured, not
attacker-influenced data. Only fetches of indexer-supplied _payload_ URLs are the SSRF
concern, and those are covered above.

### 4.2 IGDB metadata fetch

Server → `id.twitch.tv` (OAuth token) → `api.igdb.com` (game metadata). Both hosts are
hardcoded; credentials come from `system_config`/env (`server/config.ts`).

Mitigations: `igdbRateLimiter` (per-user configurable); `sanitizeSearchQuery`/`sanitizeIgdbId`
in `server/middleware.ts`; as of this document's revision, both calls in `server/igdb.ts`
route through `safeFetch()` (previously used raw `fetch()`, inconsistent with every other
integration — fixed alongside this document, see Section 8).

### 4.3 User-configured RSS / indexer / downloader URLs

A user enters an arbitrary host (RSS feed URL, custom indexer, custom downloader address) at
setup/settings time → stored in SQLite → later fetched by `server/cron.ts`/`server/rss.ts`/the
relevant client.

Mitigations: `sanitizeIndexerData`/`sanitizeDownloaderData` validate at write time; every
fetch re-validates via `isSafeUrl()`/`safeFetch()` at _use_ time too, not just at save time —
this matters because DNS can change between when a URL is saved and when it's next fetched
(classic TOCTOU/rebinding window).

### 4.4 Downloaded archive → library filesystem

Indexer/download client output → metadata listing and bounded preflight validation → archive
integrity check → 7-Zip or unrar extraction into the import destination.

Mitigations in `server/services/ArchiveService.ts` reject absolute and parent-traversal
paths, symbolic/hard links, paths deeper than 64 components, more than 50,000 archive entries,
and declared expansion beyond 250 GiB by default. Operators can lower or raise the byte/entry
limits with `ARCHIVE_MAX_EXPANDED_BYTES` and `ARCHIVE_MAX_ENTRIES`. Archive tool output is
capped at 10 MiB and each tool invocation times out after 30 minutes. These metadata
preflight limits reduce path escape and decompression-bomb risk, but do not impose an OS
filesystem quota if an archive lies about its declared sizes.

### 4.5 Optional pre-import security scan

When enabled, `SecurityScanService` checks a completed download before it is imported:

- **VirusTotal** computes a SHA-256 digest of the primary file and queries the fixed HTTPS
  API endpoint. The file itself is not sent. Detection threshold and whether an unknown hash
  blocks import are configurable.
- **ClamAV** streams files through the configured daemon's INSTREAM protocol. The configured
  hostname is resolved and validated before QuestarrNG connects; file contents cross that TCP
  connection, so deploy the daemon on a trusted network.
- A detection moves the download to a sibling `.questarr-quarantine` directory, marks it
  `quarantined`, and creates a Security Alert. The normal import-review flow rejects
  quarantined downloads.
- Scanner network and time-out errors fail open and allow processing to continue. A partially
  enumerated or truncated ClamAV directory scan blocks import rather than claiming it was
  clean. VirusTotal can also block unknown hashes when that option is enabled.

Scanning is optional defense in depth, not a guarantee that every file is safe. It should not
replace operator review or host-level endpoint protection.

### 4.6 SeerrNG imported asset delivery

The versioned SeerrNG provider API can stream one imported file or a gzip tar
bundle of multiple imported files to the authenticated SeerrNG caller. Every
asset lookup is scoped to the request and game owned by the API-key/JWT user;
QuestarrNG resolves both the configured library root and file paths before
requiring the file to remain beneath that root. Bundle entries use sanitized,
unique basenames and the response is marked `no-store`. The bundle route
streams at most 100 registered files, and the existing provider rate limit
applies. A compromised SeerrNG credential can retrieve files available to its
QuestarrNG account, so operators should keep that scoped key private and
dedicated to SeerrNG.

### 4.7 GitHub Actions candidate validation

Pull-request source, dependency lockfiles, and generated coverage/JUnit files are untrusted
inputs. The `trusted-pr-validation` workflow is loaded from the pull-request base, checks out
the exact base and candidate commits separately, and runs the base validator against a
filtered candidate snapshot inside Bubblewrap. The workflow has only `contents: read`; it
does not pass a GitHub token or repository secrets to candidate code. Candidate dependency
URLs must use `registry.npmjs.org`; archives are unpacked in Bubblewrap with lifecycle
scripts disabled, and validation runs offline. The sandbox uses an unshared network
namespace, a synthetic hosts file containing only `localhost`, and a resolver file with
no nameserver. This allows loopback-only tests without access to host services, host DNS
settings, or external networks. The regular test/build jobs
also use the external reviewed launcher; they keep the same no-secret boundary and isolate
candidate test/build execution.

Coverage and JUnit reports are exported from the sandbox through a size-bounded, no-follow
copy. The Codecov upload workflow is loaded from the default branch, accepts reports only
from the matching attempt of a same-repository `main` push, and uses the `codecov-main`
environment. It checks out only trusted default-branch code and uses the triggering run's
commit SHA as Codecov's report override. Its event and environment restrictions prevent
pull-request workflows from obtaining the Codecov token. The Codecov token must be stored
as an environment secret, not a repository-wide or organization-wide secret. The release
announcement job uses the `discord-release` environment and its separately named
`DISCORD_WEBHOOK` secret. The existing
repository-level webhook must be replaced in that environment and removed before
same-repository pull-request workflows are fully isolated from secrets. The environment
is restricted to `main`; tag-triggered image runs cannot access its secret. A trusted
default-branch `workflow_run` sends tag announcements only after the release workflow
completes successfully.

---

## 5. External Integration Trust Table

| Integration                                                         | Host source                    | Auth surface                                      | SSRF-checked?                                                                              | Notes                                                                              |
| ------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Indexers (Torznab/Newznab/Prowlarr)                                 | user-configured                | API key (AES-256-GCM encrypted at rest)           | Yes                                                                                        | highest risk — user-supplied host                                                  |
| Download clients (qBittorrent/Transmission/rTorrent/SABnzbd/NZBGet) | user-configured, typically LAN | username/password (AES-256-GCM encrypted at rest) | Payload-URL fetches: yes. Control-plane calls to the configured client: N/A (trust anchor) | see 4.1                                                                            |
| RSS feeds                                                           | user-configured                | none                                              | Yes (`server/rss.ts`)                                                                      |                                                                                    |
| IGDB / Twitch                                                       | hardcoded                      | client ID/secret (`system_config`)                | Yes (fixed in this revision)                                                               | see 4.2                                                                            |
| Steam                                                               | hardcoded                      | none (public endpoint)                            | Yes (`server/steam.ts`)                                                                    | wishlist import only                                                               |
| HowLongToBeat                                                       | hardcoded                      | none                                              | Yes (`server/hltb.ts`)                                                                     |                                                                                    |
| NexusMods                                                           | hardcoded                      | API key (`system_config`)                         | Yes (`server/nexusmods.ts`)                                                                |                                                                                    |
| xREL                                                                | hardcoded allowlist            | none                                              | Yes (`server/xrel.ts`)                                                                     | only `api.xrel.to`/`xrel-api.nfos.to` permitted                                    |
| PCGamingWiki                                                        | hardcoded                      | none                                              | Yes (`server/pcgamingwiki-router.ts`)                                                      |                                                                                    |
| SeerrNG                                                             | configured peer                | scoped, expiring integration API key or JWT       | Not applicable                                                                             | provider version 2; caller-owned account scope; imported asset streams and bundles |
| RomM library destination                                            | configured local/shared path   | filesystem permissions of QuestarrNG process      | Not applicable                                                                             | file routing only; QuestarrNG does not call RomM's API                             |
| VirusTotal                                                          | fixed HTTPS API                | API key in server-side system config              | Yes (`safeFetch`, HTTPS)                                                                   | hash lookup only; file data is not uploaded                                        |
| ClamAV daemon                                                       | user-configured host and port  | local network trust; ClamAV INSTREAM protocol     | Yes (DNS-validated pinned address)                                                         | optional file-content stream; trusted network recommended                          |

---

## 6. Existing Mitigations Index

This section cross-references controls by category rather than duplicating them — treat the
linked file as the source of truth.

- **SSRF / DNS rebinding:** `server/ssrf.ts` (`isSafeUrl`, `safeFetch`)
- **Input sanitization:** `server/middleware.ts` (`sanitizeSearchQuery`, `sanitizeGameId`,
  `sanitizeDownloadId`, `sanitizeIgdbId`, `sanitizeGameData`, `sanitizeIndexerData`,
  `sanitizeDownloaderData`, `sanitizeIndexerSearchQuery`)
- **Rate limiting:** `server/middleware.ts` (`igdbRateLimiter`, `authRateLimiter`,
  `sensitiveEndpointLimiter`, `generalApiLimiter`, `scanRateLimiter`,
  `integrationRateLimiter`); `server/index.ts:34` (global mount)
- **Authentication/session:** `server/auth.ts` (JWT issuance/verification); global gate at
  `server/routes.ts:845`
- **SeerrNG provider authorization:** `server/auth.ts` (key scope and expiry),
  `server/routes/integration.ts` (request/asset ownership and path containment)
- **Archive extraction:** `server/services/ArchiveService.ts` (path/link/count/size preflight,
  process timeout and bounded child-process output)
- **Pre-import scanning and quarantine:** `server/security-scan.ts`,
  `server/services/ImportManager.ts` (optional hash reputation and ClamAV scan; detections
  block import and move the download to quarantine)
- **SQL injection:** not applicable by construction — Drizzle ORM parameterizes all
  application queries; the only raw SQL (`sql.raw`/`sql` template literals in
  `server/migrate.ts`) is hardcoded migration DDL with no user input.
- **Archive extraction (import):** `server/services/ArchiveService.ts` — preflight listing
  refuses archives over `ARCHIVE_MAX_ENTRIES` / `ARCHIVE_MAX_EXPANDED_BYTES`, with unsafe paths
  (absolute, drive letter, `..`, too deep), or with symlinks/hard links; see
  [`docs/SECRETS.md`](./SECRETS.md) §1
- **Secrets encryption at rest:** `server/credential-crypto.ts` (AES-256-GCM) — indexer API
  keys and downloader username/passwords; see [`docs/SECRETS.md`](./SECRETS.md) §4 for the
  full mechanism (key resolution, legacy-plaintext-row handling, masked-sentinel rotation)
- **Secrets scanning / dependency hygiene:** GitHub secret scanning and push protection,
  `.github/workflows/ci.yml` (`secretlint`), `.github/dependabot.yml`, and
  `.github/workflows/dependency-review.yml`
- **SAST:** CodeQL advanced setup in `.github/workflows/codeql.yml` (JavaScript/TypeScript,
  C#, and GitHub Actions) plus Semgrep in `.github/workflows/sast.yml`
- **Container image scanning:** Trivy builds a local production image in
  `.github/workflows/vulnerability-scan.yml` on main pushes, weekly, and pull
  requests that change image or dependency inputs. The tag-triggered
  `.github/workflows/fork-image.yml` scan checks the exact multi-architecture
  release digest before publishing version and `latest` tags.
- **Supply-chain scoring:** `.github/workflows/scorecard.yml` (OpenSSF Scorecard)
- **SBOM:** [`docs/SBOM.md`](./SBOM.md) — Syft-generated, attached to Docker releases
- **Disclosure process / access governance:** [`docs/SECURITY.md`](SECURITY.md),
  [`MAINTAINERS.md`](MAINTAINERS.md)
- **Test coverage:** `server/__tests__/ssrf.test.ts`, `ssrf_routes.test.ts`,
  `rss-ssrf.test.ts`, `downloaders_ssrf.test.ts`, `security.test.ts`,
  `security_error_handling.test.ts`, `auth-setup-ratelimit.test.ts`,
  `scan-ratelimit.test.ts`

---

## 7. Unauthenticated Surface

`server/routes.ts:845` registers `app.use("/api", authenticateToken)`, which gates every
route registered **after** that line. The routes below are registered **before** it and are
the actual unauthenticated surface:

| Route                                                | Rate-limited?                                   | Justification                                                                                         |
| ---------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /api/auth/status`                               | no                                              | Returns whether initial setup is complete; no sensitive data.                                         |
| `POST /api/auth/setup`                               | yes (`authRateLimiter`, added in this revision) | Creates the first admin account; short-circuits with 403 once a user exists.                          |
| `POST /api/auth/login`                               | yes (`authRateLimiter`)                         | Standard login brute-force protection.                                                                |
| `GET /api/auth/me`                                   | n/a                                             | Has explicit `authenticateToken` despite being registered before the gate.                            |
| `GET /api/health`                                    | no                                              | Intentionally public liveness check.                                                                  |
| `GET`/`PATCH /api/settings/ssl`, SSL generate/upload | n/a                                             | Each has explicit `authenticateToken`.                                                                |
| `GET /api/system/filesystem`                         | n/a (`sensitiveEndpointLimiter`)                | Has explicit `authenticateToken`; scoped to `FILE_BROWSER_ROOT` with path-resolution + prefix checks. |
| `GET /api/config`                                    | yes (`sensitiveEndpointLimiter`)                | Intentionally public — returns only an IGDB-configured boolean and the xREL API base URL.             |

No route here exposes user data or performs a state-changing action without either explicit
authentication or a narrowly-scoped, low-sensitivity response.

---

## 8. Residual & Accepted Risks

| Risk                                                                                                                                                                                                             | Status                                    | Rationale                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Socket.io (`server/socket.ts`) has no per-connection authentication; `notifyUser()` broadcasts via plain `io.emit()` to every connected client regardless of which user owns the event                           | **Accepted risk / documented assumption** | Connections are restricted to configured origins (CORS), so this is a same-install, cross-account metadata leak (e.g. one user seeing another's download progress), not an externally exposed one. QuestarrNG is not a multi-user application (see [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) §9) — the supported deployment has one trusted operator, so this is low severity by design, not a gap awaiting a fix. |
| Path-traversal checks in `sanitizeDownloaderData`/`sanitizeIndexerData` use a `!value.includes("..")` blocklist rather than the resolve-and-prefix-check pattern `server/routes.ts`'s file-browser endpoint uses | **Recommended follow-up**                 | Downstream consumers don't currently perform direct filesystem access with these values, so risk is low; migrating to the stronger pattern is still worthwhile for consistency. File a follow-up issue.                                                                                                                                                                                                            |
| Flat, single-tier trust model — an authenticated user has full access with no RBAC/admin split                                                                                                                   | **Accepted risk / documented assumption** | Deliberate simplicity tradeoff for a small, self-hosted app with one trusted operator per instance — QuestarrNG is not a multi-user application (see [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) §9).                                                                                                                                                                                                                |

---

## 9. Review Cadence

Re-review triggers, rather than a calendar chore that tends to get skipped:

- A new external integration is added.
- A new unauthenticated route is introduced (i.e., anything registered before the
  `routes.ts:845` gate).
- Authentication/session/authorization behavior changes.
- A major version bump.

Any maintainer or contributor should update this document as part of the PR that triggers
one of the above — see the testing policy in
[`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md).

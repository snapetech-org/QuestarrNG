# What changed in QuestarrNG

QuestarrNG is Snapetech's maintained fork of
[Doezer/Questarr](https://github.com/Doezer/Questarr). This guide summarizes
the main product and maintenance additions made for the fork. The
[changelog](CHANGELOG.md) remains the complete versioned record, including
individual fixes and security updates.

## Why maintain QuestarrNG

The fork keeps a SeerrNG-compatible provider and a separately released game
manager under active development. On 2026-10-12, the inspected
[Doezer/Questarr `main` commit](https://github.com/Doezer/Questarr/commit/fb650bab63cb2f7ce3c9004ab9028cfc3b210a01)
did not expose a SeerrNG provider API. QuestarrNG supplies a versioned
capability handshake, a stable IGDB catalog, and request-contract v2: it keeps
SeerrNG's request ID and selected PC operating system/architecture attached
through acquisition, reports lifecycle state, supports retry/cancel, and
streams imported files through authenticated request-scoped routes. These
boundaries let SeerrNG retain approval, quotas, ownership, and requester access
while QuestarrNG owns game acquisition and file delivery. See the
[integration guide](SEERRNG-INTEGRATION.md), the current
[request-contract v2 OpenAPI contract](contracts/seerrng-v2.openapi.yaml), and
the [provider v1 contract](contracts/seerrng-v1.openapi.yaml).

QuestarrNG also develops the standalone features below, including platform-
scoped library workflows, play tracking, RomM and Playnite connections,
acquisition safety, optional PostgreSQL, and fork-owned multi-platform
releases. Upstream and this fork can converge or diverge with later changes;
this snapshot is a dated comparison, not a permanent claim about Questarr.

### When the fork would no longer be required

SeerrNG could depend on upstream Questarr directly after upstream provides the
current provider handshake and request contract (including stable external
request identity, selected PC variant, lifecycle actions/status, and
authenticated request-scoped file delivery), and SeerrNG supports that
upstream contract or an adapter. Any standalone QuestarrNG capability still
required by operators would also need to be available upstream or no longer be
a maintained requirement. We can then compare release cadence, migration
behavior, security support, and deployment targets before moving the default
dependency. Recheck this guide against upstream and the SeerrNG consumer when
the contract changes.

The Snapetech fork was created in September 2026. The v1.5.0 release was not
published; its completed work shipped in v1.6.0. Fork releases from v1.6.0
through [v1.11.0](https://github.com/snapetech-org/QuestarrNG/releases/tag/v1.11.0)
added the capabilities below.

## Product capabilities

### Library and discovery

- Platform preferences now scope discovery, library filtering, adding games,
  download searches, and import eligibility. Users can hide owned or shelved
  titles by default and scan platform-specific local roots to reconcile files.
- The **Playing** workflow records personal journal entries, milestones,
  screenshots, and Steam achievements. Game details include DLC and expansion
  entries, and discovery can use the exact release date for a selected IGDB
  platform.
- A global release-name blacklist applies across manual search, automatic
  search, and AI-assisted release selection. Existing genre, year, platform,
  and content filters continue to apply to discovery results.

### Acquisition, import, and safety

- Post-processing moves or copies completed downloads into configured library
  locations and handles archive extraction. RomM imports can be mapped to
  RomM's platform folders with configurable transfer and conflict behavior.
- Prowlarr feed diagnostics test each enabled torrent or usenet indexer
  separately. HTTP Prowlarr/API-key forwarding is opt-in, and indexer/download
  diagnostics explain when credentials are withheld for an insecure transport.
- Archive imports reject traversal and link entries and enforce configured
  entry-count and expanded-size limits. Optional VirusTotal hash lookups and
  local ClamAV scans can quarantine flagged files before they enter the library.
  See the [import setup and scanning guide](IMPORTS.md) for operator steps and
  scanner behavior.

### Integrations

- **Playnite:** the extension can synchronize the local library, promote
  installed games to owned, and submit a request that enters Questarr's normal
  search and download workflow. See the
  [Playnite extension guide](../extensions/playnite-questarr/README.md).
- **RomM:** matched ROM downloads can be routed to mapped RomM platform folders.
- **SeerrNG:** the versioned provider API supplies an IGDB catalog and
  request-scoped PC-game acquisition. It carries an external request ID and
  selected operating system/architecture through search and download, reports
  lifecycle status, and exposes imported files through authenticated,
  request-scoped streaming. See the
  [integration guide](SEERRNG-INTEGRATION.md),
  [API reference](API.md#integration-api-external-clients), and
  [OpenAPI contract](contracts/seerrng-v1.openapi.yaml).
- **Real-Debrid:** OAuth device authorization connects a downloader without
  storing credentials in the browser. Completed files are staged under a
  configured local path before Questarr imports them.

### Deployment and operations

- SQLite remains the zero-configuration default; PostgreSQL is available as an
  optional backend. See [database setup](DATABASE.md).
- The maintained release image is published for `linux/amd64` and
  `linux/arm64`. QuestarrNG also maintains a self-contained .NET 10 Windows
  service host, a Helm chart, and home-server installation definitions.
- The production image and Compose templates run the service as a non-root
  user by default; hardened Compose and Helm options add a read-only root
  filesystem and dropped Linux capabilities. Published images include
  SBOM and provenance attestations. See the
  [security overview](THREAT_MODEL.md),
  [Proxmox guide](PROXMOX.md), and
  [home-server app guides](HOME_SERVER_APPS.md).
- Releases use curated user-facing notes; dependency and code scanning are
  part of the maintained release process. See the
  [security policy](SECURITY.md) and
  [release-note guide](../release-notes/README.md).

## Release timeline

| Release         | Main additions                                                                                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1.6.0–1.6.1** | RomM import routing, Prowlarr feed diagnostics and HTTP controls, safer library and archive imports, multi-architecture release images, and fork-owned installation guidance.                            |
| **1.7.0–1.7.3** | Exact platform release dates in the SeerrNG catalog, clearer indexer/downloader diagnostics, hardened outbound and proxy requests, the .NET 10 Windows service, and maintained release-note publication. |
| **1.8.0–1.8.3** | Versioned SeerrNG OpenAPI contract, scoped and expiring integration keys, bounded archive extraction, rootless container settings, SBOM/provenance attestations, and dependency/security maintenance.    |
| **1.9.0**       | Platform-scoped library and discovery behavior, the Playing journal and Steam achievements, DLC/expansion details, a release-name blacklist, and optional pre-import VirusTotal/ClamAV checks.           |
| **1.9.1**       | Upstream Questarr sync, per-file categories and installed versions, HTTPS-only Prowlarr sync by default, non-root container defaults, and patched security tooling.                                      |
| **1.9.2**       | SeerrNG request-contract v2 handshake and authenticated request-scoped bundles for multi-file game imports.                                                                                              |
| **1.10.0**      | Real-Debrid OAuth and local staging, exact SeerrNG IGDB identity, verified Steam ownership and play-time estimates, and safer multi-file acquisition.                                                    |
| **1.11.0**      | Browser-local interface language, regional date and number formatting, locale-aware calendars, and RTL-safe rendering of upstream titles and values.                                                     |

For every released change, including fixes and action-required upgrade notes, use
the [full changelog](CHANGELOG.md) and the
[GitHub releases](https://github.com/snapetech-org/QuestarrNG/releases).

## Current SeerrNG provider compatibility

QuestarrNG 1.11.0 advertises SeerrNG `apiVersion: 1` and
`requestContractVersion: 2`. It supports the IGDB catalog, PC acquisition,
request retry/cancel, single-file streaming, and request-scoped `.tar.gz`
bundles for multi-file imports, plus exact request identity and Steam ownership
estimates. Real-Debrid downloads can be staged locally before import. The
handshake reports emulation acquisition as unsupported. See the
[SeerrNG release note](https://github.com/snapetech-org/seerrng/blob/main/release-notes/questarr-catalog-estimates-and-bundles.md)
and the current [QuestarrNG provider contract](contracts/seerrng-v2.openapi.yaml).

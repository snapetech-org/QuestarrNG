# Documentation Map

This file is the entry point for user, operator, contributor, and security
documentation in this repository.

## Product and releases

- Product overview and installation: [`README.md`](../README.md)
- First install and initial setup: [`docs/QUICKSTART.md`](./QUICKSTART.md)
- Setup-design guidance: [`docs/development/setup-experience-contract.md`](./development/setup-experience-contract.md)
- Selecting a main release, updates, and optional extras:
  [`docs/DOWNLOAD_RECOMMENDATIONS.md`](./DOWNLOAD_RECOMMENDATIONS.md)
- Why QuestarrNG is maintained, how it differs from upstream, and the
  [convergence matrix for retiring the fork](./FORK_CHANGES.md#convergence-matrix-what-upstream-needs-before-the-fork-can-retire):
  [`docs/FORK_CHANGES.md`](./FORK_CHANGES.md)
- Download post-processing, RomM routing, and pre-import security scans:
  [`docs/IMPORTS.md`](./IMPORTS.md)
- Versioned release history: [`docs/CHANGELOG.md`](./CHANGELOG.md)
- Release-note fragment format and preview command:
  [`release-notes/README.md`](../release-notes/README.md)
- Product direction and shipped-versus-planned status:
  [`docs/PRD.md`](./PRD.md)

## Install and operate

- Database backends and SQLite-to-PostgreSQL migration:
  [`docs/DATABASE.md`](./DATABASE.md)
- Operator-only account password recovery:
  [`docs/PASSWORD_RECOVERY.md`](./PASSWORD_RECOVERY.md)
- Legacy PostgreSQL-to-SQLite migration:
  [`docs/MIGRATION.md`](./MIGRATION.md)
- Reverse proxy and subdirectory deployment:
  [`docs/REVERSE_PROXY.md`](./REVERSE_PROXY.md)
- Proxmox VE LXC deployment:
  [`docs/PROXMOX.md`](./PROXMOX.md)
- Unraid, CasaOS, Umbrel, Cosmos Cloud, and Home Assistant definitions:
  [`docs/HOME_SERVER_APPS.md`](./HOME_SERVER_APPS.md)
- Home Assistant add-on storage and permissions:
  [`questarr/README.md`](../questarr/README.md)
- Supported indexers and downloader behavior:
  [`docs/DOWNLOADERS_COMPATIBILITY.md`](./DOWNLOADERS_COMPATIBILITY.md)
- Indexer setup, Prowlarr sync, and release blacklists:
  [`docs/INDEXERS.md`](./INDEXERS.md)
- RSS release discovery: [`docs/RSS.md`](./RSS.md)
- In-app and Apprise notifications: [`docs/NOTIFICATIONS.md`](./NOTIFICATIONS.md)

## Integrate and develop

- REST and Socket.io reference, including both integration APIs:
  [`docs/API.md`](./API.md)
- SeerrNG setup, authentication, request lifecycle, and compatibility:
  [`docs/SEERRNG-INTEGRATION.md`](./SEERRNG-INTEGRATION.md)
- Machine-readable current SeerrNG provider contract:
  [`docs/contracts/seerrng-v2.openapi.yaml`](./contracts/seerrng-v2.openapi.yaml)
- Playnite library synchronization and request extension:
  [`extensions/playnite-questarr/README.md`](../extensions/playnite-questarr/README.md)
- System architecture and background actors:
  [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)
- Full-history upstream issue and PR resolution campaign, including its
  [progress ledger](./upstream-resolution/ledger.json), generated
  [inventory](./upstream-resolution/inventory.md),
  [audit and evidence process](./upstream-resolution/AUDIT-PROCESS.md), and
  [batch history](./upstream-resolution/README.md).
- Contribution guide: [`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md)
- Code of conduct: [`docs/CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)

## Security and supply chain

- Security policy and reporting: [`docs/SECURITY.md`](./SECURITY.md)
- Threat model: [`docs/THREAT_MODEL.md`](./THREAT_MODEL.md)
- Security assessment: [`docs/SECURITY_ASSESSMENT.md`](./SECURITY_ASSESSMENT.md)
- Vulnerability management and release gates:
  [`docs/VULNERABILITY_MANAGEMENT.md`](./VULNERABILITY_MANAGEMENT.md)
- Secret storage and rotation: [`docs/SECRETS.md`](./SECRETS.md)
- Software bill of materials: [`docs/SBOM.md`](./SBOM.md)
- Vulnerability Exploitability eXchange:
  [`docs/VEX.md`](./VEX.md)
- Dependency policy: [`docs/DEPENDENCIES.md`](./DEPENDENCIES.md)
- Dependency fixes by release:
  [`docs/CVE_FIXES_BY_RELEASE.md`](./CVE_FIXES_BY_RELEASE.md) and
  [`docs/CWE_FIXES_BY_RELEASE.md`](./CWE_FIXES_BY_RELEASE.md)

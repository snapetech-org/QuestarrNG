# QuestarrNG

## Snapetech QuestarrNG fork

QuestarrNG is Snapetech's maintained fork of
[Doezer/Questarr](https://github.com/Doezer/Questarr). It keeps the upstream
game-management foundation and adds a substantial set of fork-maintained
features: platform-aware discovery and library views, richer play tracking,
post-processing and RomM imports, Playnite and SeerrNG integrations, optional
PostgreSQL, and hardened multi-architecture releases. See
[What changed in QuestarrNG](docs/FORK_CHANGES.md) for the overview and
[the changelog](docs/CHANGELOG.md) for the release-by-release history.

Use `ghcr.io/snapetech-org/questarrng:latest` or the Compose file in this
repository for the latest published release. The `main`, `master`,
`latest`, and `stable` tags all point to the same most recently
published stable image. The `dev` tag tracks main-branch builds. Semantic-version
tags pin one exact release.
The upstream Questarr image does not contain the SeerrNG provider routes. The
fork image is published for `linux/amd64` and `linux/arm64`.

Support QuestarrNG on [Ko-fi](https://ko-fi.com/snapetech).

![Questarr Logo](images/Questarr_Logo-nobg.png)

A video game management application inspired by the -Arr apps (Sonarr, Radarr, Prowlarr...) and GamezServer. Track and organize your video game collection with automated discovery and download management.

[![Library screenshot](images/Screenshots/library.png)](images/Screenshots/library.png)

[![GHCR](https://img.shields.io/badge/container-ghcr.io%2Fsnapetech-org%2Fquestarrng-blue?logo=github&logoColor=white)](https://github.com/orgs/snapetech-org/packages/container/package/questarrng)
[![GitHub release](https://img.shields.io/github/v/release/snapetech/QuestarrNG)](https://github.com/snapetech-org/QuestarrNG/releases)
[![License](https://img.shields.io/github/license/snapetech/QuestarrNG)](https://github.com/snapetech-org/QuestarrNG/blob/main/COPYING)
[![CI](https://github.com/snapetech-org/QuestarrNG/actions/workflows/ci.yml/badge.svg)](https://github.com/snapetech-org/QuestarrNG/actions/workflows/ci.yml)
[![Code Scanning](https://github.com/snapetech-org/QuestarrNG/actions/workflows/sast.yml/badge.svg)](https://github.com/snapetech-org/QuestarrNG/security/code-scanning)
[![Last commit](https://img.shields.io/github/last-commit/snapetech/QuestarrNG)](https://github.com/snapetech-org/QuestarrNG/commits/main)

⭐ Star us on GitHub — your support motivates us a lot! 🙏😊

[![Discord](https://img.shields.io/badge/Discord-Join%20Us-7289da?logo=discord&logoColor=white)](https://discord.gg/STkp86wP9F)
[![Share](https://img.shields.io/badge/share-000000?logo=x&logoColor=white)](https://x.com/intent/tweet?text=Check%20out%20QuestarrNG%20on%20GitHub:%20https://github.com/snapetech-org/QuestarrNG%20%23gaming%20%23selfhosted)

## Table of Contents

For local MCP access, see the [SnapeTech MCP integration guide](docs/integrations/snapetech-mcp.md).

- [What this fork adds](#what-this-fork-adds)
- [List of features](#list-of-features)
- [Installation](#installation)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [Configuration](#configuration)
- [Roadmap](#roadmap)
- [Troubleshooting](#troubleshooting)
- [Project Security & Documentation](#project-security--documentation)
- [Upstream issue and PR resolution](#upstream-issue-and-pr-resolution)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

## What this fork adds

QuestarrNG continues to share its foundation with upstream Questarr. We
maintain a separate fork for the versioned SeerrNG provider and the standalone
library, acquisition, and deployment capabilities described in the
[fork and convergence guide](docs/FORK_CHANGES.md). Its
[convergence matrix](docs/FORK_CHANGES.md#convergence-matrix-what-upstream-needs-before-the-fork-can-retire)
lists the contract and operator checks for moving off this fork.

- **A richer game library:** platform-scoped discovery and filters, local
  library scanning, a Playing page with journal entries, milestones, screenshots
  and Steam achievements, personal game lists, update availability, and DLC and
  expansion details.
- **A complete acquisition path:** Prowlarr and Torznab/Newznab search,
  Hydra-format JSON catalogs, optional RAWG discovery, file-type filtering,
  release scoring, direct torrent/NZB downloads, configurable release
  selection, download monitoring, automated post-processing, safer archive
  extraction, and optional VirusTotal or ClamAV checks before import.
- **External library workflows:** mapped RomM imports, a Playnite extension
  for library sync and request-to-download, and a versioned SeerrNG catalog and
  PC acquisition API.
- **More deployment choices:** optional PostgreSQL alongside the default
  SQLite setup, multi-architecture images, a Windows service installer, and
  rootless container configurations with release attestations.
- **A more accessible interface:** English plus twelve translated locales,
  regional date and number formats, and right-to-left layout support.

The [fork changes guide](docs/FORK_CHANGES.md) summarizes these additions and
their release history. The [documentation map](docs/GITHUB_DOCUMENTATION.md)
links to setup, integration, API, database, and security guides.

## List of features

| Feature                     | Description                                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backlog management**      | Track collection status, ratings, and notes; make private game lists; and distinguish available updates from ordinary search results. The **Playing** page adds journal notes, milestones, screenshots, and Steam achievements, with crack status, DLC, and expansion details on each game.                                                 |
| **Game Discovery**          | Browse popular, new, and upcoming titles via IGDB or optional RAWG, follow RSS and xREL.to feeds, or sync a Steam wishlist. Per-platform **Root folder / Scan Disk** discovers games already on disk. Game details can show HowLongToBeat estimates for close title matches.                                                                |
| **Search & Filter**         | Search by genre, platform, and keyword; filter torrent results by verified file extensions; and use public Hydra-format catalogs. Release scoring, preferred groups/platforms, and blacklists help narrow results. A Platforms setting scopes discovery, library views, downloads, and imports, with optional visibility filters.           |
| **Download Management**     | Send releases to a configured downloader or download torrent/NZB files directly. Choose updates and small extras, rank results with saved scoring profiles, then monitor and post-process downloads. Includes password-protected archive handling, optional VirusTotal/ClamAV scanning, and experimental BYOK matching with TypeSafe's Jev. |
| **Real-time Notifications** | In-app alerts for releases and downloads, plus external notifications to 100+ providers via [Apprise](https://github.com/caronc/apprise).                                                                                                                                                                                                   |
| **Rich Game Metadata**      | Details enriched with IGDB, optional RAWG, Steam, HowLongToBeat, PCGamingWiki, and NexusMods, including trending mods where available.                                                                                                                                                                                                      |
| **Localization**            | Use the interface in English or one of twelve translated locales, with regional date and number formatting and right-to-left layout support.                                                                                                                                                                                                |
| **Statistics**              | Review collection and download statistics, with sharing to Discord where supported.                                                                                                                                                                                                                                                         |
| **Security Focused**        | General security hardening and SSL support — see [SECURITY.md](docs/SECURITY.md) for the reporting and deployment hardening process.                                                                                                                                                                                                        |
| **Deployment**              | Install through Unraid, CasaOS, Umbrel, Cosmos Cloud, Home Assistant, Windows, or Kubernetes; use published amd64/arm64 images and optional rootless container settings.                                                                                                                                                                    |
| **Integrations**            | Connect Playnite, RomM, and SeerrNG using the documented integration paths.                                                                                                                                                                                                                                                                 |
| **Design**                  | Clean, minimalist, dark-first UI built with mobile usage in mind.                                                                                                                                                                                                                                                                           |

Can't decide what to play? Click **Pick a game** in your Library for
[Backlog roulette](docs/BACKLOG_ROULETTE.md): draw a game, roll again, or mark it as Playing.

### Choosing a release and its extras

When a main release has updates, Questarr opens a bundle choice with updates
selected by default. Smaller extras are shown as optional, unchecked choices
when their measured size is no more than 25% of the main release. Larger extras
and extras with unknown sizes are not suggested, and **Download game only**
remains available. See [the release-selection guide](docs/DOWNLOAD_RECOMMENDATIONS.md)
for the full behavior and the reason for the size cutoff.

### Supported Indexers/Downloaders

- Sync indexers from [Prowlarr](docs/INDEXERS.md).
- G4u.to: the site offers an API to VIP members, which can be used in Questarr.

| Indexers                   | Downloaders                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------- |
| Torznab protocol (Torrent) | - qBittorent<br>- Transmission<br>- rTorrent<br>- Deluge<br>- Synology Download Station |
| Newznab protocol (Usenet)  | - Sabnzbd<br>- Nzbget                                                                   |
| G4U.to                     | Same as Newznab                                                                         |

### SeerrNG integration

QuestarrNG provides SeerrNG with an IGDB catalog and request-scoped PC-game
acquisition through a versioned, authenticated integration API. The contract
keeps SeerrNG's request ID and selected OS/architecture attached to QuestarrNG's
tracked game and download records. See [docs/API.md](docs/API.md) for the
catalog, status, retry, cancellation, and imported-file streaming routes.
Cancellation stops only downloads safely correlated to the SeerrNG request;
completed files remain on disk, and ambiguous active downloads are refused. If
Questarr restarts during a handoff before recording its download, it pauses the
request for a duplicate-download check before retrying or cancelling. The retry
or cancel endpoint returns `409` with `confirmationRequired` until the caller
checks the download queue/history and sends `confirmNoExistingDownload: true`.
QuestarrNG 2.1.1's provider advertises contract v2 and preserves exact IGDB
request identity, verified Steam ownership, and community play-time estimates.
It supports authenticated multi-file bundles and can stage Real-Debrid
downloads locally before import. The wider interface is available in English
and twelve translated locales with regional date and number formatting.
Emulation acquisition remains unsupported. See the
[compatibility guide](docs/SEERRNG-INTEGRATION.md#current-capability-status).

**Editions, selected content, and discovery.** The same API now lets SeerrNG
list a game's editions and the content each links, request only the expansions
or add-ons a person selected (or a complete edition), and find games by theme,
game mode, perspective, genre, and language. Content IGDB does not describe is
reported as unknown instead of guessed, an edition request is met only by
releases that name that edition, and an add-on request only by releases that
name it or a complete bundle. For a game already in your library the selected
content is searched for without changing what you own. Handshake flags:
`editions`, `discover`, `wantedContent`. Routes and the request `selection`
field are in [docs/API.md](docs/API.md#seerrng-content-selection-contract-v2).

### Import processing and file safety

Post-processing can move, copy, hardlink, or symlink completed downloads into
your PC library, unpack supported archives, or route matched ROM imports into
RomM folders. Optional VirusTotal hash checks and ClamAV scans run before
unpacking or import. The [import guide](docs/IMPORTS.md) explains RomM routing
and scanner setup; [Library Import](docs/LIBRARY_IMPORT.md) covers folder
discovery, import history, and recovery. Pending-import recovery stays with the
account that owned the original game: other accounts cannot see, skip, or relink
that download, and a relink target must belong to the same account.

## Installation

Docker is the easiest way to deploy QuestarrNG with all dependencies included.
SQLite is the default database; PostgreSQL is available as an optional backend.
See [docs/DATABASE.md](docs/DATABASE.md) before configuring PostgreSQL.

The optional Windows installer runs QuestarrNG as a Windows service and bundles
its service host as a self-contained .NET 10 LTS executable. QuestarrNG itself is
a Node.js application; the installer does not require a separate .NET runtime.
Version-tag releases include the Windows x64 installer and a SHA-256
checksum on the GitHub release page.

**Supported architectures:** released QuestarrNG Docker images are published for
`linux/amd64` and `linux/arm64`, so the app runs on a Raspberry Pi 4/5 with a
64-bit OS, other 64-bit ARM SBCs, and ARM-based NAS boxes as well as on x86
hardware. Docker selects the right architecture automatically — the commands
below are identical on every platform. Both images build a native RARLAB UnRAR
7.23 executable, so RAR/RAR5 and multi-volume imports work on ARM64 as well as
amd64. (32-bit ARM, e.g. `armv7`/a 32-bit OS on Raspberry Pi 3 and earlier, is
not supported. The [Home Assistant add-on](#home-assistant-add-on) is
`amd64`-only.)

### Option 1: Quick start (direct Docker)

```bash
mkdir -p ./data
docker run -d -p 5000:5000 --user "$(id -u):$(id -g)" \
  -e PUID="$(id -u)" -e PGID="$(id -g)" \
  -v ./data:/app/data --name questarrng ghcr.io/snapetech-org/questarrng:latest
```

The `main`, `master`, `latest`, and
`stable` production aliases move together when a validated versioned release
is published. A push to `main` does not publish a release image. Each release
also keeps its exact semantic-version tag, such as `2.1.1`. To update a Compose install,
run `docker compose pull && docker compose up -d`.

### Option 2: Docker Compose (more detailed)

1. **Use the [`docker-compose.yml`](https://github.com/snapetech-org/QuestarrNG/blob/main/docker-compose.yml) file from the repo or create a minimal one.** It pulls the published GHCR image and does not need a `.env` file for the default SQLite setup:

   ```yaml
   services:
     app:
       image: ghcr.io/snapetech-org/questarrng:latest
       user: "${PUID:-1000}:${PGID:-1000}"
       ports:
         - "5000:5000"
       volumes:
         - ./data:/app/data
       environment:
         - SQLITE_DB_PATH=/app/data/sqlite.db
       restart: unless-stopped
   ```

2. **Start the application:**

   ```bash
   mkdir -p ./data
   PUID="$(id -u)" PGID="$(id -g)" docker compose up -d
   ```

3. **Access the application:**
   Open your browser to `http://localhost:5000`

If port `5000` is already in use, the repository Compose file lets you change
the host-side port while keeping the app on its internal port:

```bash
HOST_SIDE_PORT=5100 docker compose up -d
```

Then open `http://localhost:5100`. If you use the minimal Compose example
above, change its port mapping from `5000:5000` to `5100:5000`; the left side
is the host port and the right side is the port inside the container.

For compatibility, a `PORT` value in the Compose `.env` file sets both sides
when neither split variable is set. For example, `PORT=5201` maps
`5201:5201` and makes the app listen on `5201`. Explicit
`HOST_SIDE_PORT` and `CONTAINER_INTERNAL_SIDE_PORT` values take precedence,
so you can still expose a different host port without changing the port inside
the container.

The image runs as a non-root user by default. Set `PUID` and `PGID` to the
owner of the mounted data directory; the Compose file uses those values as the
container user. Existing installs keep their data and should set these values
to the current owner. For a read-only container filesystem, drop all Linux
capabilities, and block privilege escalation, use the
[`docker-compose.hardened.yml`](docker-compose.hardened.yml) overlay. It runs
the app as the configured `PUID:PGID` directly, so prepare the bind-mounted
`./data` directory with that ownership before starting it.

4. **Optional — use Postgres instead of SQLite:**

   Questarr uses SQLite by default and needs no database configuration. If you
   would rather run it against Postgres, use the bundled compose file:

   ```bash
   POSTGRES_PASSWORD=$(openssl rand -hex 32) docker compose -f docker-compose.postgres.yml up -d
   ```

   Keep whatever password you pick — the same value must be supplied on every
   restart, and it must be safe to embed in a connection URL (a hex string
   from `openssl rand -hex 32` always is).

   Switching an existing SQLite install to Postgres does not move your data —
   run `scripts/sqlite-to-pg.ts` to bring your library across. See
   [docs/DATABASE.md](docs/DATABASE.md).

   To switch a current optional-Postgres install back to SQLite, the database
   guide also includes a safe copy command. The old pre-v1.1 PostgreSQL
   migration procedure remains separate because it handles a different schema.

### Publish a Docker image on demand

Maintainers can publish a fresh image without waiting for the scheduled build:
open **Actions → [Deploy Web App](.github/workflows/deploy.yml) → Run workflow**
and choose `production`, `dev`, or `test`. A custom image tag is optional; the
workflow summary lists the tags it created and prints a matching `docker pull`
command. Production builds include ARM64; for other environments, ARM64 and the
Windows installer are optional builds. The workflow runs its dependency and
license checks before publishing.

GitHub Actions supplies the `GITHUB_TOKEN` used to publish to GHCR. Application
credentials belong in the runtime environment where the container is deployed,
not in repository workflow secrets; see [Environment variables](docs/SECRETS.md).
`HOST` defaults to `0.0.0.0` for container networking. For a bare-metal install
with a reverse proxy on the same host, set `HOST=127.0.0.1` to restrict access.

### Windows (installer)

<details>
<summary><b>Install via the Windows installer (.exe)</b></summary>

Prefer running Questarr as a native Windows service instead of Docker? Download
`QuestarrSetup-<version>-windows-x64.exe` from the
[latest QuestarrNG release](https://github.com/snapetech-org/QuestarrNG/releases/latest) and
run it. The installer bundles Node.js, installs Questarr as a Windows service
(`Questarr.Service.exe`), and starts it automatically — open
`http://localhost:5000` once it finishes.

</details>

### Proxmox VE (LXC)

<details>
<summary><b>Deploy as a Proxmox LXC container — no Docker</b></summary>

Run this **on your Proxmox VE host**, as `root`, to create an LXC container with Questarr installed
and running as a `systemd` service:

```bash
bash -c "$(curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' https://raw.githubusercontent.com/snapetech/QuestarrNG/main/scripts/proxmox/questarr-lxc.sh)"
```

The script picks the next free container ID, downloads a Debian template if needed, creates an
unprivileged container, builds Questarr from source, and prints the URL to open. Every prompt has a
default, so you can accept them all and be done in a few minutes.

Update later with `pct exec <ctid> -- update`.

See [docs/PROXMOX.md](docs/PROXMOX.md) for non-interactive installs, sizing guidance, configuration,
and troubleshooting.

</details>

### UNRAID

<details>
<summary><b>Install via an Unraid user template</b></summary>

The upstream **Questarr** Community Apps entry uses the upstream image and
does not include this fork's SeerrNG integration routes. Use the
[QuestarrNG fork template](unraid/questarr.xml)
for `ghcr.io/snapetech-org/questarrng:latest`. QuestarrNG works as a standalone
game manager; SeerrNG integration is optional. For package or integration
support, use the [SeerrNG issue tracker](https://github.com/snapetech/seerrng/issues).

Unraid 6.10 and later no longer has the **Template repositories** field. Add
the local user template from the Unraid terminal:

```bash
wget -O /boot/config/plugins/dockerMan/templates-user/questarrng.xml \
  https://raw.githubusercontent.com/snapetech-org/QuestarrNG/main/unraid/questarr.xml
```

1. In Docker, choose **Add Container** and select the **QuestarrNG** user template.
2. Set your **Data Path** (default `/mnt/user/appdata/questarrng`), **PUID**/**PGID**, and HTTP port (default `5000`).
3. Set the **Game Library** and **Downloads** paths to the folders shared with your download client. The game
   library is mounted at `/data` inside the container. Under **Settings → Path
   Mappings**, set **Local Path** to `/data` and **Remote Path** to the exact
   path reported by the download client.
4. Apply, then open `http://<unraid-host>:5000` to access the UI.

The image runs as a non-root user. The template maps that user to `99:100` by
default; make sure the mounted folders are writable by that ID. If you change
PUID/PGID, update the template's **Extra Parameters** `--user` value to match.

</details>

### CasaOS

<details>
<summary><b>Install via Custom Install (AppFile)</b></summary>

1. Open the **App Store** and click **Custom Install**.
2. Click the **import** icon (top right) and paste this URL:
   `https://raw.githubusercontent.com/snapetech/QuestarrNG/main/casaos/docker-compose.yml`
3. Review the mounts — by default `/DATA/AppData/questarr` holds Questarr's data and
   `/DATA/Downloads` is mounted at `/data` so Questarr can import finished downloads. If you keep
   that second mount, add a matching entry under **Settings → Path Mappings**.
4. Click **Install**, then open Questarr from the CasaOS dashboard (port `5000`).

</details>

### Umbrel

<details>
<summary><b>Install via Community App Store</b></summary>

1. In umbrelOS, open the **App Store**.
2. Click the **⋮** menu (top right) → **Community App Stores**.
3. Add this repository URL: `https://github.com/snapetech-org/QuestarrNG`
4. Open the **Snapetech** store and install **QuestarrNG** (app ID `doezer-questarr`, retained for existing installs), then open it from
   your dashboard (`http://umbrel.local:5000`).

</details>

### Cosmos Cloud

<details>
<summary><b>Install as a ServApp</b></summary>

1. Open **Market Place → Custom Install** (or **Servapps → Add**).
2. Paste this URL:
   `https://raw.githubusercontent.com/snapetech/QuestarrNG/main/cosmos/questarr.cosmos-compose.json`
3. Fill in the install form: **Data folder**, optional **Library folder** (the root your download
   client writes into, mounted at `/data`), and `PUID`/`PGID`.
4. Install. Cosmos creates the route `questarr.<your-server-hostname>` and handles HTTPS for you.

</details>

### Kubernetes (Helm)

<details>
<summary><b>Install with the bundled Helm chart</b></summary>

A Helm chart lives in [`charts/questarr`](charts/questarr). Each version-tag
release attaches a packaged chart and SHA-256 checksum to its GitHub release.
There is no Helm repository yet; you can install from a repository clone:

```bash
git clone https://github.com/snapetech-org/QuestarrNG.git
cd QuestarrNG
helm install questarr charts/questarr --namespace questarr --create-namespace
```

Then port-forward (or enable the Ingress) and open the UI:

```bash
kubectl port-forward -n questarr svc/questarr 5000:5000
```

Questarr keeps its state in a single SQLite database on a ReadWriteOnce volume, so the
chart never runs more than one replica. See [`charts/questarr/README.md`](charts/questarr/README.md)
for the full option reference — persistence, media mounts, secrets, Ingress and
subdirectory deployments.

</details>

### Home Assistant Add-on

<details>
<summary><b>Install as a Home Assistant add-on</b></summary>

You can install Questarr as a Home Assistant add-on from this repository:

1. In Home Assistant, open **Settings → Add-ons → Add-on Store**.
2. Click the menu (⋮) and choose **Repositories**.
3. Add this repository URL: `https://github.com/snapetech-org/QuestarrNG`
4. Install the **Questarr** add-on and start it.
5. Open `http://<home-assistant-host>:5000` to access the UI.

The add-on stores its application state in Home Assistant's persistent `/data`
volume and runs as UID/GID `1000:1000`; it does not expose PUID/PGID settings or
a separate media-library mount. On startup, a narrowly scoped helper corrects
ownership inside `/data` and checks that it is writable. A wrong or read-only
volume binding still needs to be corrected in the host configuration. See the
[add-on operations notes](questarr/README.md).

</details>

Platform definitions live in the repository; mount and port behavior varies by installer. See
[docs/HOME_SERVER_APPS.md](docs/HOME_SERVER_APPS.md) for platform-specific details.

## Screenshots

<details closed>
<summary><b>👀 See the app in action</b></summary>

### Library

Your central hub for recent activity, collection overview and downloading available games. Manage your owned and wanted games.

<a href="images/Screenshots/library.png"><img src="images/Screenshots/library.png" /></a>

<p float="left">
  <a href="images/Screenshots/game_details.png"><img src="images/Screenshots/game_details.png" width="49%" /></a>
  <a href="images/Screenshots/download_modal.png"><img src="images/Screenshots/download_modal.png" width="49%" /></a>
</p>

### Wishlist & Release calendar

Manage your wanted games and when they release.

<p float="left">
  <a href="images/Screenshots/wishlist.png"><img src="images/Screenshots/wishlist.png" width="49%" /></a>
  <a href="images/Screenshots/calendar.png"><img src="images/Screenshots/calendar.png" width="49%" /></a>
</p>

### Discover Games

Browse and find new games to add to your collection. Download from a game’s details to add it as Wanted and send a release to your downloader.

<a href="images/Screenshots/discover.png"><img src="images/Screenshots/discover.png" /></a>

#### RSS & xRel.to feeds

Discover releases through [RSS feeds](docs/RSS.md) and xREL.to, with IGDB matching.

<p float="left">
  <a href="images/Screenshots/rss.png"><img src="images/Screenshots/rss.png" width="49%" /></a>
  <a href="images/Screenshots/xrelto.png"><img src="images/Screenshots/xrelto.png" width="49%" /></a>
</p>

### Downloads Queue

Monitor your downloaders' active downloads and history.

<a href="images/Screenshots/downloads.png"><img src="images/Screenshots/downloads.png" /></a>

### Statistics

Check out your library statistics.

<a href="images/Screenshots/stats.png"><img src="images/Screenshots/stats.png" /></a>

### Settings

Configure indexers, downloaders, and application preferences.

<p float="left">
  <a href="images/Screenshots/indexers.png"><img src="images/Screenshots/indexers.png" width="49%" /></a>
  <a href="images/Screenshots/downloaders.png"><img src="images/Screenshots/downloaders.png" width="49%" /></a>
</p>

<a href="images/Screenshots/settings.png"><img src="images/Screenshots/settings.png" /></a>

</details>

## Tech Stack

![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat&logo=node.js&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-07405E?style=flat&logo=sqlite&logoColor=white)
[![Node.js](https://img.shields.io/badge/Node.js-22.19%2B-339933?logo=node.js&logoColor=white)](package.json)
[![language](https://img.shields.io/badge/language-TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![OS](https://img.shields.io/badge/OS-linux%2C%20windows%2C%20macOS-0078D4)](#installation)
[![CPU](https://img.shields.io/badge/CPU-amd64%2C%20arm64-FF8C00)](#installation)

- **APIs**: IGDB (game metadata), Torznab/Newznab (indexer search), PCGamingWiki, NexusMods, xREL.to
- **AIs usage**:
  - Claude and Github Copilot are used for AI-Assisted coding, internal code reviews, PR cleanup. Eventually automated coding and troubleshooting for small tasks and bug reports.
  - Gemini & Codex are used for automated code reviews, and brainstorming from time to time (as well as Perplexity for this usage).
  - Google Jules is used for light periodical refactoring.

## Configuration

1. **First-time setup:**

- Create your admin account
- Configure the IGDB credentials

Once logged-in:

- Configure indexers
- Add downloaders
- Add games!

See the upstream [Configuration Wiki](https://github.com/Doezer/Questarr/wiki/Configuring-the-application#configure-app-behavior-in-settings--general) for more detailed info.

<details>
<summary><b>Getting IGDB API Credentials</b></summary>

IGDB provides game metadata (covers, descriptions, ratings, release dates, etc.).

1. Go to [Twitch Developer Console](https://dev.twitch.tv/console)
2. Log in with your Twitch account (create one if needed)
3. Click "Register Your Application"
4. Fill in:
   - **Name**: Questarr (or any name)
   - **OAuth Redirect URLs**: `http://localhost` (not used, but required)
   - **Category**: Application Integration
5. Click "Create"
6. Copy your **Client ID** and **Client Secret**
7. Add them to your `.env` file

</details>

<details>
<summary><b>Upgrading from v1.0 (PostgreSQL)</b></summary>

If you are upgrading from an older version that used PostgreSQL, you need to migrate your data.

The migration tooling was removed in v1.5.0 and is now run from the archived
**v1.4.2** release. Follow [docs/MIGRATION.md](docs/MIGRATION.md), which inlines
the pinned compose file and links the sources by tag permalink.

> This is only for **pre-v1.1 PostgreSQL** installations. Running Questarr _on_
> PostgreSQL as an opt-in backend is a separate feature — see
> `docs/DATABASE.md`.

See [docs/MIGRATION.md](docs/MIGRATION.md) for more details.

</details>

<details>
<summary><b>Advanced usage</b></summary>

### Docker compose

This is mainly for users who want the latest commit (e.g when trying out fixes for an issue) or contributing users.

1. **Clone the repository:**

```bash
git clone https://github.com/snapetech-org/QuestarrNG.git
cd QuestarrNG
```

1. **Configure the application:**
   Edit `docker-compose.yml` directly if you need to setup a specific environment.

1. **Build and start the containers:**

```bash
docker-compose up -d
```

1. **Access the application:**
   Open your browser to `http://localhost:5000`

### Update to latest version for Docker

Your database content will be kept.

```bash
git pull
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Reverse proxy / subdirectory deployment

Want to serve Questarr from a path like `https://xxx.domain.com/Questarr`
instead of its own subdomain? Set `QUESTARR_BASE_PATH=/Questarr` on the
container (or in `.env` for npm installs) and point your reverse proxy at it
— no rebuild required. See [docs/REVERSE_PROXY.md](docs/REVERSE_PROXY.md) for
full setup instructions (nginx, Traefik, Caddy).

Behind any reverse proxy, also set `TRUST_PROXY=1` so rate limits see real
client IPs (see the same doc).

</details>

## Roadmap

The original upstream roadmap is now partly delivered and partly superseded by
fork work. Post-processing, indexer links, optional PostgreSQL, RomM import
routing, the Playnite and SeerrNG integrations, and Real-Debrid downloads are
shipped. The remaining product proposals are version-aware game upgrades,
additional direct-download providers, importing owned Steam or GOG libraries,
and possible Gameyfin or user-defined webhook integrations. The maintained
[PRD](docs/PRD.md) marks what is shipped, what remains, and which ideas have no
delivery commitment. The [UI localization roadmap](docs/localization-roadmap.md)
tracks current language and calendar coverage, plus the remaining screen-level
translation and RTL work.

## Troubleshooting

See the upstream [Troubleshooting Wiki](https://github.com/Doezer/Questarr/wiki/Troubleshooting)

If you lose the local account password, an operator can reset it from the
QuestarrNG host or container with the [password-recovery CLI](docs/PASSWORD_RECOVERY.md).

If you run into an issue, go to the **Logs** page and click **Send Logs** before reporting it — it makes diagnosing the problem much easier.

### Getting Help

- **Issues**: [GitHub Issues](https://github.com/snapetech-org/QuestarrNG/issues)
- **Discussions**: [GitHub Discussions](https://github.com/snapetech-org/QuestarrNG/discussions)
- **Discord**: [Join our Server](https://discord.gg/STkp86wP9F)

## Project Security & Documentation

- [OIDC sign-in setup, account admission, and recovery](docs/oidc-authentication.md)
- [Shared OIDC provider catalog and setup links](https://github.com/snapetech-org/seerrng/blob/main/docs/maintainers/oidc-provider-catalog.md) · [cross-project contract](https://github.com/snapetech-org/seerrng/blob/main/docs/maintainers/oidc-cross-project-template.md)
- [What changed in the fork](docs/FORK_CHANGES.md) summarizes the maintained additions since the upstream baseline.
- [Import processing and security scans](docs/IMPORTS.md) explains RomM routing, archive handling, and optional malware checks.
- Start with [docs/GITHUB_DOCUMENTATION.md](docs/GITHUB_DOCUMENTATION.md) for the full documentation map.

## Upstream issue and PR resolution

QuestarrNG is reviewing the complete history of [Doezer/Questarr issues and pull
requests](docs/upstream-resolution/README.md), including closed issues, merged
PRs, and closed unmerged PRs. The goal is to implement missing actionable
behavior in this fork, verify behavior that already exists, and record a
source-backed disposition for every item. Upstream maintainers decide whether
to accept changes or close their issues and PRs.

The [campaign overview](docs/upstream-resolution/README.md) links to the full
[audit and evidence process](docs/upstream-resolution/AUDIT-PROCESS.md), the
[per-item ledger](docs/upstream-resolution/ledger.json), the generated
[1,163-item inventory](docs/upstream-resolution/inventory.md), and each batch's
[validation evidence](docs/upstream-resolution/evidence/). After Batch 83, the
ledger records 690 verified, 224 superseded, 14 not applicable, six
implemented-but-unverified, zero needing implementation, and 229 unreviewed
records. Batch 83 reviewed PRs #942–943, issue #944, and PRs #945–949. It
bounded recursive game-file scans and made partial results clear in the Files
tab. See the [campaign overview](docs/upstream-resolution/README.md),
[the Batch 83 validation record](docs/upstream-resolution/evidence/validation-batch-83.md),
and the [Batch 82 validation record](docs/upstream-resolution/evidence/validation-batch-82.md).
The DCO sign-off policy is implemented in the campaign branch, but its
rollout still needs a maintainer decision because the campaign history includes
unsigned commits. The full review and validation gate must pass before campaign
work is merged to `main`.

## Contributing

- See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) for guidelines on how to contribute to this project.
- See [DCO.md](DCO.md) for the Developer Certificate of Origin and sign-off instructions.
- See [MAINTAINERS.md](docs/MAINTAINERS.md) for how repository access and release permissions are managed.

### Contributors

<a href="https://github.com/snapetech-org/QuestarrNG/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=snapetech/QuestarrNG" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

## Legal Disclaimer

QuestarrNG is a self-hosted game manager designed solely for organizing, tracking, and automating game libraries using user-provided data and metadata APIs (such as IGDB). QuestarrNG does not host, distribute, or provide any copyrighted game content, ROMs, or download links. It is a technology-neutral tool: any indexers, download clients, or sources you configure are chosen and operated entirely by you. You are solely responsible for ensuring that your use of QuestarrNG, and any content you access or download through third-party services you configure, complies with all applicable laws and the terms of service of those third parties.

## License

GPL-3.0-only - see [COPYING](COPYING) for the full license text.

## Acknowledgments

- Inspired by [Sonarr](https://sonarr.tv/) and [GamezServer](https://github.com/05sonicblue/GamezServer)
- Game metadata powered by [IGDB API](https://www.igdb.com/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Security scanning supported by [Snyk](https://snyk.io) through the Snyk Open Source program
- AI code reviews by [CodeRabbit](https://coderabbit.ai), free for open source
- This project is tested with BrowserStack

## Local security scanning

Run `./scripts/security-scan-local.sh` for local Semgrep CE and the Trivy scanners that fit this repository. The installed pre-commit hook runs Semgrep on staged source/config files only; Trivy runs on demand or in CI. See [security-scanning.md](docs/security-scanning.md). Use `./scripts/update-security-tools.sh` to refresh local scanner data and the Trivy database.

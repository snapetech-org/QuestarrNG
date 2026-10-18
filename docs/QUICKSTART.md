# Quick start

QuestarrNG runs on your own server. The [main README](../README.md#installation)
lists the Windows installer, Docker Compose, optional PostgreSQL, and other
deployment options. This page covers a basic Docker install with SQLite.

## Start QuestarrNG

Install Docker, then run:

```sh
mkdir -p ./data
docker run -d -p 5000:5000 --user "$(id -u):$(id -g)" \
  -e PUID="$(id -u)" -e PGID="$(id -g)" \
  -v ./data:/app/data --name questarrng ghcr.io/snapetech-org/questarrng:latest
```

Open [http://localhost:5000](http://localhost:5000) and follow the setup
wizard. Keep the `./data` directory across upgrades; it contains your SQLite
database and application data. The image supports `linux/amd64` and `linux/arm64`.
The `latest` tag follows published releases; `dev` tracks main-branch builds for
testing. Pin a semantic-version tag to stay on one exact release. To update
this install, pull the current image, stop and remove the existing container,
then rerun the `docker run` command above. Keep the `./data` directory:

```sh
docker pull ghcr.io/snapetech-org/questarrng:latest
docker stop questarrng
docker rm questarrng
```

## Browse and track games

Choose a metadata provider, then browse games in Discover or add them through a
Steam wishlist. This catalog path does not require an indexer or downloader.

## Acquire game releases

To search for releases, add an enabled Torznab/Newznab indexer or connect
Prowlarr in **Settings → Indexers**. To send a grab, add and test a compatible
client in **Settings → Downloaders**. An indexer enables release search; a
downloader receives the selected release. Either can be added later without
blocking catalog browsing or imports of files already on disk.

Add games to your library before searching for releases. The [release picker](DOWNLOAD_RECOMMENDATIONS.md)
can bundle selected updates and optional, size-qualified extras with a main game.
If date filters hide every result on the current page, choose **Load more
results** to continue through later pages. On the Logs page, Copy and Send
use the filtered lines, while Clear empties the whole current log buffer.

## Import and organize existing files

Configure [library imports](IMPORTS.md) if you want QuestarrNG to organize
completed downloads. You can use imports without configuring indexers or a
downloader when the files already exist.

## Optional game-management features

Set notification preferences, add [RSS feeds](RSS.md), or use
[Backlog roulette](BACKLOG_ROULETTE.md) when you want those features.

For the details, see [Indexers and Prowlarr](INDEXERS.md),
[download import](IMPORTS.md), [notifications](NOTIFICATIONS.md),
[RSS feeds](RSS.md), and [downloader compatibility](DOWNLOADERS_COMPATIBILITY.md).

If QuestarrNG sits behind a reverse proxy, use HTTPS and follow the
[reverse proxy guide](REVERSE_PROXY.md). For Compose, Windows, PostgreSQL, and
home-server installations, start with the [main installation guide](../README.md#installation).

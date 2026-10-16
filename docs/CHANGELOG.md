# Changelog

All notable changes to this project will be documented in this file.

User-facing pull requests add validated fragments under [`release-notes/`](../release-notes/).
The release workflow adds those fragments to the versioned release notes and
Discord announcement while this file remains the chronological changelog.
For a reader-oriented summary of the Snapetech fork's additions since the
upstream baseline, see [What changed in QuestarrNG](FORK_CHANGES.md).

## [2.1.0] - 2026-10-15

### User-facing changes

#### Added

- **Database Migration:** Operators can copy a current PostgreSQL library into a migrated, empty SQLite database. Questarr keeps the source read-only and verifies all table contents inside one transaction; the older pre-v1.1 migration procedure remains separate.
- **Downloads:** Download torrent and NZB files directly from search results, or send the release to a configured downloader. When updates are available, choose which ones to include with the main game.
- **Library:** Create personal game lists for any theme, add games from your library to multiple lists, and rename or delete lists whenever plans change. Lists are private to your account and do not change a game's library status.
- **Community:** GitHub's issue chooser now includes a question template that asks for steps, environment details, and relevant logs while reminding people to remove secrets.
- **Games:** Game cards, Add Game search results, and details now treat a 0/10 IGDB score as a real rating, game details show HowLongToBeat estimates for close title matches, and desktop download searches use more screen width so release data is easier to read.
- **Downloads:** Add selected release groups from the download search dialog to Preferred Release Groups in Settings. Saving these groups keeps the existing automatic search filter setting unchanged.
- **Search:** Release Search can filter by verified torrent file extensions such as NSP or XCI. It inspects bounded torrent manifests and excludes unknown payloads instead of guessing from release names.
- **Library:** Library cards distinguish available game updates from ordinary search results. Availability changes refresh the owning user's library even when update notifications are muted.
- **Search:** Public HTTPS JSON catalogs in Hydra format can now supply torrent releases alongside existing indexers, with source attribution, bounded downloads, and normal search and acquisition rules.
- **Discover:** RAWG is now an optional game discovery provider alongside IGDB, with encrypted API key settings and separate provider game IDs.
- **Downloads:** Users can save an optional release-scoring profile to rank manual search results and limit automatic searches to releases that meet their format and quality preferences.

#### Changed

- **Downloads:** Long release names now wrap in the mobile download list instead of being clipped. When an indexer provides a safe comments page, the full title remains a link to that release.
- **Library:** The Library now uses clearer empty states with a direct next step. Add your first game from an empty library, add a searched title that is not in your collection, or clear filters when they hide every game.
- **Operations:** The operations guide now covers container health checks, log inspection, and safe SQLite or Postgres backup and recovery steps.
- **Container:** The default Compose file pulls the published GHCR image. Main builds use dev, while versioned releases update latest and keep an exact semantic-version tag for pinning.
  - **Action required:** Run docker compose pull and docker compose up -d to update an existing installation.
- **Integrations:** The xREL release browser now enables the next page only when another game release is available. It no longer relies on an unreliable upstream page count or shows a guessed total.
- **Contribution Policy:** Human contributors must sign off each non-merge commit with the Developer Certificate of Origin; GitHub-verified automation pull requests are exempt.
- **Install:** Unraid 6.10+ setup instructions now show how to install the QuestarrNG user template and configure its container path mapping.
- **Containers:** **Breaking:** New QuestarrNG container images are published under `ghcr.io/snapetech-org/questarrng`. Update Compose, Helm, Unraid, and other deployment configurations from `ghcr.io/snapetech/questarrng`. Existing tags in the old package remain available, but new releases will only appear in the organization package.
  - **Action required:** Update container references to ghcr.io/snapetech-org/questarrng.
- **Deployment:** **Breaking:** Production image releases now start only from a validated version-tag push; main merges and development/test image builds no longer publish `latest` or version tags.
  - **Action required:** Push a validated version tag to publish production images.
- **Interface:** More dialogs, settings, download screens, scoring, and provider controls now use the selected interface language, including status messages and file actions.
- **Ci:** The Windows service CI job now uses the .NET SDK selected for its runner on GitHub-hosted and trusted main runners.
- **Documentation:** New quick-start, indexer, notification, and RSS guides explain how to set up QuestarrNG and use its search and alert features.
- **Validation:** Independent validation tasks now run together in a bounded pool, reducing idle time while preserving dependencies, isolated results, and source checks. Superseded pull-request runs also release their concurrency slot after cancellation while current-run failures still reconcile.
- **Localization:** The interface now translates pages, settings, forms, and notifications into twelve locales alongside English. API errors show localized summaries while preserving their original details.
- **Localization:** Release group and release-name settings, category picker fallbacks, form validation, and log upload feedback now follow the selected interface language.
- **Repository:** QuestarrNG installation, support, and release links now use the snapetech-org repository address. Existing container image names remain unchanged.
- **Ci:** Trusted main checks and same-repository pull requests authored by snapetech can use the restricted runner pool after the readiness setting is enabled. Fork and bot pull requests remain on GitHub-hosted runners.
- **Api:** Questarr now translates recognized API and import diagnostic details, additional fixed labels in Custom Lists, downloader, logs, settings, indexer, and library workflows, and search empty-state guidance into the selected language. API clients continue to receive the existing English error details and stable error codes.
- **Releases:** Each version-tag release includes the Windows x64 installer and Helm chart with SHA-256 checksums; Home Assistant, CasaOS, Umbrel, and Helm metadata track the release version.
- **Interface:** Interface text across library, download, indexer, and settings screens now follows the selected language more consistently, including backlog roulette, download actions, file details, scoring, and provider configuration.

#### Fixed

- **Downloads:** Scheduled searches now include DLC and extras in the existing packs and add-ons results when those categories are enabled. Results from categories you turn off remain excluded.
- **Calendar:** Calendar release checks now recognize IGDB's explicit delayed release statuses, retain date-shift detection as a fallback, and notify users when a game first becomes delayed.
- **Metadata:** Manual metadata refresh now streams IGDB results in 100-game requests and saves updates in 50-game database transactions. A failed fetch no longer stops later batches, and the response reports games whose metadata could not be refreshed.
- **Forms:** Buttons used for form actions no longer submit the form unless they are explicitly marked as submit buttons.
- **Downloads:** When qBittorrent accepts a download but Questarr cannot confirm it yet, the app now shows that it is still checking and asks you to check qBittorrent before retrying.
- **Imports:** When you remove a game and choose to delete its files, Questarr now also removes files inside that user's enabled RomM library root. The configured root itself remains protected.
- **Settings:** Settings errors now explain that database migrations run at startup, show the manual migration command only for source installs, and offer a Try again action after the service is available.
  - **Action required:** Restart the service or container; source installs can run npm run db:migrate.
- **Library:** Add Game now handles records without IGDB IDs correctly. Mobile Add Game and preferred-release-group controls have clearer screen-reader names, and Deluge appears in the supported downloader list.
- **Downloads:** Linking a download that's already finished in a client now queues it for the normal import flow when post-processing is enabled. This also applies to bulk claims, so existing downloads can be added to the library without downloading them again.
- **Deployment:** Docker Compose once again accepts `PORT` from the project `.env` file as a fallback for both the host and container HTTP ports. Set `HOST_SIDE_PORT` or `CONTAINER_INTERNAL_SIDE_PORT` to override either side independently.
- **Accessibility:** The download-results options button now has a specific accessible name, making its purpose clearer to screen-reader users.
- **Downloads:** Manual download searches now use the game's chosen target platform before the account-wide default. If that platform is excluded by the Platforms setting, the dialog leaves its platform filter clear so results are not unexpectedly hidden.
- **Downloads:** The qBittorrent add request stops waiting for a matching torrent after 15 seconds while leaving accepted but unconfirmed downloads tracked, so users can check the client before retrying.
- **Downloads Logs:** Torrent errors now include qBittorrent's reported detail, and mobile logs explain when only the latest 200 entries are shown while Copy still includes every match.
- **Imports:** RomM import settings can now be saved by older clients that still send the fixed `multiFilePlacement: "subfolder"` field. The server ignores that legacy default while continuing to reject unrelated unknown settings.
- **Usability:** Search pagination stays available after date filtering, downloader and indexer priorities can be cleared and edited reliably, empty filtered logs disable unavailable actions, and auto-search notifications honor in-app and Apprise preferences independently.
- **Unraid:** The Unraid template now sets `UMASK=022` alongside its Unraid-compatible `PUID=99` and `PGID=100` defaults, so files created by QuestarrNG use the expected permissions.
- **Wishlist:** Wishlist games now move from Upcoming to Released automatically as their release time passes, including after returning to a backgrounded tab.
- **Settings:** Settings now show an error and a retry button when the release blacklist cannot be loaded.
- **Calendar:** Calendar month headings now expose the browser's regional language to assistive technologies when regional formatting uses system settings.
- **Imports:** Manual import review now warns that Move removes the selected source, and confirmation rejects a parent folder when Questarr can resolve the tracked download directory.
- **Downloads:** When qBittorrent accepts a download but its status lookup is unavailable, Questarr now returns promptly and keeps tracking the add by its correlation tag. If lookups succeed but no matching torrent appears, Questarr continues polling only within the existing 15-second limit and never resubmits an accepted add as a torrent-file upload.
- **Release Pipeline:** Successful version-tag releases now announce through the protected Discord channel. The announcement workflow fails visibly if its required webhook secret is missing.
- **Release Pipeline:** GitHub release bodies now keep the complete curated changelog when Windows and Helm assets are attached, so the Discord announcement can publish the same release notes.
- **Release Pipeline:** Version-tag builds now grant the Windows and Helm asset workflow the Actions permissions it needs to start and attach the verified release artifacts.
- **Search:** Verified file-type search now follows safe redirects from indexers before checking the torrent manifest, so redirected downloads can still be filtered by their actual extensions.
- **Downloads:** SABnzbd downloads now use the requested category, then the saved downloader category, then `games`; register custom categories in SABnzbd to keep them out of Default.
- **Imports:** Imports preserve existing game files during extraction, hold incomplete security scans for review, recover interrupted downloads, and recognize Wii U folders. Library import discovery, backlog roulette, Discover actions, and mobile settings also receive upstream fixes.
- **Ci:** Self-hosted Linux runners now install the pinned .NET SDK in a writable temporary directory, avoiding failures when the system-wide SDK directory is root-owned.
- **Releases:** Published container images now carry the version selected by the release tag, and release builds compile each architecture on native runners.

#### Security

- **Downloads:** Bundle downloads now block arbitrary private-network URLs while retaining access to exact origins configured for indexers, and every redirect is checked under the same rule.
- **Imports:** Pending import recovery now keeps a download tied to its original library owner and only allows it to be linked to a game in that same library.
- **Security:** Production 5xx responses no longer include internal error details. The server keeps the original error in its logs so operators can diagnose failures.
  - **Action required:** Check server logs when investigating production 5xx responses.
- **Dependencies:** Unused Passport, Steam OpenID, and session dependencies have been removed after QuestarrNG replaced the Steam sign-in flow.
- **Archive Extraction:** ARM64 images now build a native, pinned RARLAB UnRAR 7.23 extractor, so RAR5 and split-volume game archives work on 64-bit Raspberry Pi and Apple Silicon while receiving RARLAB's 7.23 archive-safety fixes.
- **Runtime:** Questarr's built-in HTTPS listener now explicitly requires TLS 1.2 or newer, and CI checks the Home Assistant ownership helper with address and undefined-behavior sanitizers.
- **Integrations:** Optional RAWG search now derives cache identifiers with a process-local keyed hash, so API credentials are not exposed through unkeyed digests.
- **Networking:** **Breaking:** Forwarded client addresses and protocol headers are trusted only when TRUST_PROXY is configured, preventing direct clients from bypassing login rate limits with forged proxy headers.
  - **Action required:** Set TRUST_PROXY to your trusted proxy hop count or addresses when deploying behind a reverse proxy.
- **Authentication:** Operators can reset a local account password from the host or container CLI, which follows the account password policy and never accepts the password as a command-line argument.
- **Downloads:** **Breaking:** QuestarrNG now rejects rTorrent's legacy MD5 Digest algorithm and requires servers to advertise SHA-256 Digest.
  - **Action required:** Upgrade rTorrent/ruTorrent to a version that advertises SHA-256 Digest before using it with QuestarrNG.
- **Security:** Security evidence now records the latest Scorecard CI-Tests sample and notes that one historical merged pull request still lacks a detected CI test.
- **Security:** Protected merges keep the required CI and security checks while following the maintainer-authorized single-maintainer review and access-approval policy.
- **Security:** Security documentation now consistently reflects the authorized single-maintainer pull request policy while retaining required automated checks and conversation resolution.
- **Security:** Validation documentation now explains how isolated task environments prevent ambient credentials and workflow settings from reaching test commands.

## [2.0.0] - 2026-10-14

### User-facing changes

#### Added

- **Database Migration:** Operators can copy a current PostgreSQL library into a migrated, empty SQLite database. Questarr keeps the source read-only and verifies all table contents inside one transaction; the older pre-v1.1 migration procedure remains separate.
- **Downloads:** Download torrent and NZB files directly from search results, or send the release to a configured downloader. When updates are available, choose which ones to include with the main game.
- **Library:** Create personal game lists for any theme, add games from your library to multiple lists, and rename or delete lists whenever plans change. Lists are private to your account and do not change a game's library status.
- **Community:** GitHub's issue chooser now includes a question template that asks for steps, environment details, and relevant logs while reminding people to remove secrets.
- **Games:** Game cards, Add Game search results, and details now treat a 0/10 IGDB score as a real rating, game details show HowLongToBeat estimates for close title matches, and desktop download searches use more screen width so release data is easier to read.
- **Downloads:** Add selected release groups from the download search dialog to Preferred Release Groups in Settings. Saving these groups keeps the existing automatic search filter setting unchanged.
- **Search:** Release Search can filter by verified torrent file extensions such as NSP or XCI. It inspects bounded torrent manifests and excludes unknown payloads instead of guessing from release names.
- **Library:** Library cards distinguish available game updates from ordinary search results. Availability changes refresh the owning user's library even when update notifications are muted.
- **Search:** Public HTTPS JSON catalogs in Hydra format can now supply torrent releases alongside existing indexers, with source attribution, bounded downloads, and normal search and acquisition rules.
- **Discover:** RAWG is now an optional game discovery provider alongside IGDB, with encrypted API key settings and separate provider game IDs.
- **Downloads:** Users can save an optional release-scoring profile to rank manual search results and limit automatic searches to releases that meet their format and quality preferences.

#### Changed

- **Downloads:** Long release names now wrap in the mobile download list instead of being clipped. When an indexer provides a safe comments page, the full title remains a link to that release.
- **Library:** The Library now uses clearer empty states with a direct next step. Add your first game from an empty library, add a searched title that is not in your collection, or clear filters when they hide every game.
- **Operations:** The operations guide now covers container health checks, log inspection, and safe SQLite or Postgres backup and recovery steps.
- **Container:** The default Compose file pulls the published GHCR image. Main builds use dev, while versioned releases update latest and keep an exact semantic-version tag for pinning.
  - **Action required:** Run docker compose pull and docker compose up -d to update an existing installation.
- **Integrations:** The xREL release browser now enables the next page only when another game release is available. It no longer relies on an unreliable upstream page count or shows a guessed total.
- **Contribution Policy:** Human contributors must sign off each non-merge commit with the Developer Certificate of Origin; GitHub-verified automation pull requests are exempt.
- **Install:** Unraid 6.10+ setup instructions now show how to install the QuestarrNG user template and configure its container path mapping.
- **Containers:** **Breaking:** New QuestarrNG container images are published under `ghcr.io/snapetech-org/questarrng`. Update Compose, Helm, Unraid, and other deployment configurations from `ghcr.io/snapetech/questarrng`. Existing tags in the old package remain available, but new releases will only appear in the organization package.
  - **Action required:** Update container references to ghcr.io/snapetech-org/questarrng.
- **Deployment:** **Breaking:** Production image releases now start only from a validated version-tag push; main merges and development/test image builds no longer publish `latest` or version tags.
  - **Action required:** Push a validated version tag to publish production images.
- **Ci:** The Windows service CI job now uses the .NET SDK selected for its runner on GitHub-hosted and trusted main runners.
- **Documentation:** New quick-start, indexer, notification, and RSS guides explain how to set up QuestarrNG and use its search and alert features.
- **Validation:** Independent validation tasks now run together in a bounded pool, reducing idle time while preserving dependencies, isolated results, and source checks. Superseded pull-request runs also release their concurrency slot after cancellation while current-run failures still reconcile.
- **Localization:** The interface now translates pages, settings, forms, and notifications into twelve locales alongside English. API errors show localized summaries while preserving their original details.
- **Localization:** Release group and release-name settings, category picker fallbacks, form validation, and log upload feedback now follow the selected interface language.
- **Repository:** QuestarrNG installation, support, and release links now use the snapetech-org repository address. Existing container image names remain unchanged.
- **Ci:** Trusted main checks and same-repository pull requests authored by snapetech can use the restricted runner pool after the readiness setting is enabled. Fork and bot pull requests remain on GitHub-hosted runners.

#### Fixed

- **Downloads:** Scheduled searches now include DLC and extras in the existing packs and add-ons results when those categories are enabled. Results from categories you turn off remain excluded.
- **Calendar:** Calendar release checks now recognize IGDB's explicit delayed release statuses, retain date-shift detection as a fallback, and notify users when a game first becomes delayed.
- **Metadata:** Manual metadata refresh now streams IGDB results in 100-game requests and saves updates in 50-game database transactions. A failed fetch no longer stops later batches, and the response reports games whose metadata could not be refreshed.
- **Forms:** Buttons used for form actions no longer submit the form unless they are explicitly marked as submit buttons.
- **Downloads:** When qBittorrent accepts a download but Questarr cannot confirm it yet, the app now shows that it is still checking and asks you to check qBittorrent before retrying.
- **Imports:** When you remove a game and choose to delete its files, Questarr now also removes files inside that user's enabled RomM library root. The configured root itself remains protected.
- **Settings:** Settings errors now explain that database migrations run at startup, show the manual migration command only for source installs, and offer a Try again action after the service is available.
  - **Action required:** Restart the service or container; source installs can run npm run db:migrate.
- **Library:** Add Game now handles records without IGDB IDs correctly. Mobile Add Game and preferred-release-group controls have clearer screen-reader names, and Deluge appears in the supported downloader list.
- **Downloads:** Linking a download that's already finished in a client now queues it for the normal import flow when post-processing is enabled. This also applies to bulk claims, so existing downloads can be added to the library without downloading them again.
- **Deployment:** Docker Compose once again accepts `PORT` from the project `.env` file as a fallback for both the host and container HTTP ports. Set `HOST_SIDE_PORT` or `CONTAINER_INTERNAL_SIDE_PORT` to override either side independently.
- **Accessibility:** The download-results options button now has a specific accessible name, making its purpose clearer to screen-reader users.
- **Downloads:** Manual download searches now use the game's chosen target platform before the account-wide default. If that platform is excluded by the Platforms setting, the dialog leaves its platform filter clear so results are not unexpectedly hidden.
- **Downloads:** The qBittorrent add request stops waiting for a matching torrent after 15 seconds while leaving accepted but unconfirmed downloads tracked, so users can check the client before retrying.
- **Downloads Logs:** Torrent errors now include qBittorrent's reported detail, and mobile logs explain when only the latest 200 entries are shown while Copy still includes every match.
- **Imports:** RomM import settings can now be saved by older clients that still send the fixed `multiFilePlacement: "subfolder"` field. The server ignores that legacy default while continuing to reject unrelated unknown settings.
- **Usability:** Search pagination stays available after date filtering, downloader and indexer priorities can be cleared and edited reliably, empty filtered logs disable unavailable actions, and auto-search notifications honor in-app and Apprise preferences independently.
- **Unraid:** The Unraid template now sets `UMASK=022` alongside its Unraid-compatible `PUID=99` and `PGID=100` defaults, so files created by QuestarrNG use the expected permissions.
- **Wishlist:** Wishlist games now move from Upcoming to Released automatically as their release time passes, including after returning to a backgrounded tab.
- **Settings:** Settings now show an error and a retry button when the release blacklist cannot be loaded.
- **Calendar:** Calendar month headings now expose the browser's regional language to assistive technologies when regional formatting uses system settings.
- **Imports:** Manual import review now warns that Move removes the selected source, and confirmation rejects a parent folder when Questarr can resolve the tracked download directory.
- **Downloads:** When qBittorrent accepts a download but its status lookup is unavailable, Questarr now returns promptly and keeps tracking the add by its correlation tag. If lookups succeed but no matching torrent appears, Questarr continues polling only within the existing 15-second limit and never resubmits an accepted add as a torrent-file upload.
- **Search:** Verified file-type search now follows safe redirects from indexers before checking the torrent manifest, so redirected downloads can still be filtered by their actual extensions.
- **Downloads:** SABnzbd downloads now use the requested category, then the saved downloader category, then `games`; register custom categories in SABnzbd to keep them out of Default.
- **Imports:** Imports preserve existing game files during extraction, hold incomplete security scans for review, recover interrupted downloads, and recognize Wii U folders. Library import discovery, backlog roulette, Discover actions, and mobile settings also receive upstream fixes.
- **Ci:** Self-hosted Linux runners now install the pinned .NET SDK in a writable temporary directory, avoiding failures when the system-wide SDK directory is root-owned.

#### Security

- **Downloads:** Bundle downloads now block arbitrary private-network URLs while retaining access to exact origins configured for indexers, and every redirect is checked under the same rule.
- **Imports:** Pending import recovery now keeps a download tied to its original library owner and only allows it to be linked to a game in that same library.
- **Security:** Production 5xx responses no longer include internal error details. The server keeps the original error in its logs so operators can diagnose failures.
  - **Action required:** Check server logs when investigating production 5xx responses.
- **Dependencies:** Unused Passport, Steam OpenID, and session dependencies have been removed after QuestarrNG replaced the Steam sign-in flow.
- **Archive Extraction:** ARM64 images now build a native, pinned RARLAB UnRAR 7.23 extractor, so RAR5 and split-volume game archives work on 64-bit Raspberry Pi and Apple Silicon while receiving RARLAB's 7.23 archive-safety fixes.
- **Runtime:** Questarr's built-in HTTPS listener now explicitly requires TLS 1.2 or newer, and CI checks the Home Assistant ownership helper with address and undefined-behavior sanitizers.
- **Integrations:** Optional RAWG search now derives cache identifiers with a process-local keyed hash, so API credentials are not exposed through unkeyed digests.
- **Networking:** **Breaking:** Forwarded client addresses and protocol headers are trusted only when TRUST_PROXY is configured, preventing direct clients from bypassing login rate limits with forged proxy headers.
  - **Action required:** Set TRUST_PROXY to your trusted proxy hop count or addresses when deploying behind a reverse proxy.
- **Authentication:** Operators can reset a local account password from the host or container CLI, which follows the account password policy and never accepts the password as a command-line argument.
- **Downloads:** **Breaking:** QuestarrNG now rejects rTorrent's legacy MD5 Digest algorithm and requires servers to advertise SHA-256 Digest.
  - **Action required:** Upgrade rTorrent/ruTorrent to a version that advertises SHA-256 Digest before using it with QuestarrNG.
- **Security:** Security evidence now records the latest Scorecard CI-Tests sample and notes that one historical merged pull request still lacks a detected CI test.
- **Security:** Protected merges keep the required CI and security checks while following the maintainer-authorized single-maintainer review and access-approval policy.
- **Security:** Security documentation now consistently reflects the authorized single-maintainer pull request policy while retaining required automated checks and conversation resolution.
- **Security:** Validation documentation now explains how isolated task environments prevent ambient credentials and workflow settings from reaching test commands.

## [1.11.0] - 2026-10-13

### User-facing changes

#### Added

- **Support:** The repository funding configuration now includes Ko-fi as an option for users who want to support project maintenance.
- **Settings:** Settings > Appearance separates interface language from regional date, time, and number formats; translated navigation, the calendar, and download dialogs honor those choices, including localized release dates and calendar week starts.
- **Localization:** Choose a display language during initial setup or later in Settings. Navigation and language controls are translated in twelve locales; other screens continue to fall back to English.

#### Changed

- **Integrations:** The fork guide now records QuestarrNG's current upstream comparison, standalone and SeerrNG-specific additions, and the capabilities needed to stop maintaining the fork.
- **Localization:** The Release Calendar and game download dialog now translate headings, controls, search filters, empty states, release categories, result guidance, and update actions where catalog entries are available. Dates and counts use the selected regional format. Missing text falls back to English; Arabic labels use local direction metadata, with full RTL review still outstanding.

#### Security

- **Supply Chain:** Build workflows now use an integrity-locked npm runtime, and the Home Assistant build pins its QuestarrNG base image by digest.
- **Security:** **Breaking:** JWT secrets are validated and rotated, invalidating affected sessions; CI audits locked dependencies and npm tooling, and version tags wait for clean Trivy scans of both Linux architectures plus zero open alerts and successful CodeQL and Semgrep scans.
  - **Action required:** Use a random JWT_SECRET containing at least 32 bytes, or unset it to generate one. Release maintainers must complete all security scans and resolve open alerts before publishing.
- **Validation:** Validation tasks now isolate inherited credentials and configuration, keep Playwright browsers available to isolated test processes, and remove task-owned temporary files after execution.
- **Ci:** Validation now keeps local credentials out of test snapshots while preserving legitimate source and deployment files. It also masks the original checkout under runtime mount aliases and requires sandbox verification in CI, so candidate tests cannot read private host files or silently skip isolation checks.
- **Ci:** Pull-request test jobs no longer receive the Codecov upload token, preventing candidate test processes from reaching it through later upload steps.
- **Validation:** Pull request tests and builds run inside an isolated sandbox with offline dependencies and source-bound receipts. The sandbox supports loopback-only tests while keeping host services, resolver settings, and external networking unavailable. Base-sourced checks validate the exact candidate snapshot, while Codecov uploads and Discord tag announcements run from trusted default-branch workflows.
- **Ci Security:** Validation snapshots hide dotted and extensionless credentials, private/API keys, access/refresh tokens, client secrets, and non-source files beneath credential folders while retaining source modules. The local launcher isolates the host root, skips deleted indexed files, and requires an explicit command; CI receipt downloads are limited to the current workflow attempt.

#### Removed

- **Packaging:** **Breaking:** QuestarrNG no longer publishes a YunoHost package, so existing installations will not receive future updates through YunoHost.
  - **Action required:** Migrate existing YunoHost installations to a supported deployment to continue receiving QuestarrNG updates.

## [1.10.0] - 2026-10-12

### User-facing changes

#### Changed

- **Integrations:** SeerrNG can show verified Steam-library ownership and community play-time estimates; requests retain exact IGDB identity, distinguish local files from ownership, offer multi-file archives, and stage Real-Debrid downloads locally before import.

## [1.9.3] - 2026-10-11

### User-facing changes

#### Changed

- **Release Pipeline:** QuestarrNG CI now records source-bound receipts for the full test suite and both Node build runners. Final CI reconciliation requires all three results to come from the same workflow attempt, source snapshot, and test inventory.

#### Fixed

- **Validation:** Validation CI now isolates nested contract fixtures from GitHub runner source metadata and pins its receipt download action correctly, allowing valid source-bound results to be reconciled.

## [1.9.2] - 2026-10-06

### User-facing changes

#### Added

- **Integration:** SeerrNG requests can now retrieve a request-scoped `.tar.gz` bundle when an imported game has multiple registered files, while single-file downloads keep using the existing stream route.


## [1.9.1] - 2026-10-06

### User-facing changes

#### Added

- **Game Files:** Game file browsing now lets you set a file’s category, and completed downloads record installed versions so older updates are no longer suggested.

#### Security

- **Indexers:** Prowlarr sync requires HTTPS by default and blocks HTTP redirects, preventing API keys from being forwarded without explicit opt-in to trusted local network transport.
- **Deployment:** **Breaking:** Production and Home Assistant images now run the app as the unprivileged questarr user; Compose definitions map it to PUID/PGID, and the Home Assistant startup helper can change ownership only within its persistent /data volume. The scanner toolchain and HTTP cache parser also received fixes for the open PyJWT and ReDoS alerts.
  - **Action required:** For direct Docker installs or custom PUID/PGID values, match the runtime user to the mounted data owner before upgrading.

## [1.9.0] - 2026-10-04

### User-facing changes

#### Added

- **Game Details:** Game details now include an expansions tab with available DLC and expansion covers, release years, category labels, and links to their IGDB pages.
- **Library Platforms:** Platform preferences now carry across library filters, discovery, game adding, download searches, and import eligibility. Hide shelved or already-owned results by default, and track games on a Playing page with notes, milestones, screenshots, and Steam achievements.
- **Discovery:** Settings now support a global release-name blacklist that filters matching terms from manual searches, auto-search cycles, and AI-assisted release selection.

#### Security

- **Imports:** Optional VirusTotal hash lookups and local ClamAV scans run before downloads are unpacked or moved into the library. Flagged files are quarantined and create a Security Alert instead of being imported. See the [import and scanning guide](IMPORTS.md).

## [1.8.3] - 2026-10-03

### User-facing changes

#### Added

- **Settings:** System settings now include a Ko-fi link for users who want to support QuestarrNG fork maintenance.

#### Security

- **Dependencies:** All application dependencies now pass the full npm security audit, including development tooling. The cache-policy fix from upstream PR #60 is covered locally while it awaits maintainer review, and license checks no longer pull in a separate npm resolver stack.

## [1.8.1] - 2026-10-03

### User-facing changes

#### Security

- **Dependencies:** Questarr now pins a tested upstream fix for CVE-2026-93748, preventing stale-cache directives from reusing shared responses that require validation while upstream reviews the fix.

## [1.8.0] - 2026-10-03

### User-facing changes

#### Changed

- **Integrations:** The SeerrNG provider API now has a versioned OpenAPI contract with a conformance test for its handshake and required route parameters.

#### Security

- **Imports:** Archive imports now reject traversal paths and links, and enforce configurable total-entry and declared-expansion limits before archive data is decompressed or written into a game library.
  - **Action required:** Set ARCHIVE_MAX_EXPANDED_BYTES or ARCHIVE_MAX_ENTRIES if your archives need different limits.
- **Containers:** Compose and Helm deployments can run QuestarrNG as a non-root user with a read-only root filesystem and no Linux capabilities. The image entrypoint preserves `UMASK` and checks the writable data volume without changing ownership; rootless file logs are stored there at `/app/data/server.log`. Published images now include SBOM and provenance attestations.
  - **Action required:** Prepare the data volume with the configured UID and GID before enabling rootless mode.
- **Integrations:** Integration API keys can now be limited to SeerrNG routes and expire after a configurable 30–365 days; existing keys retain their current access, and Settings shows each key's scope and expiry.
  - **Action required:** Create a replacement key if a client should use the new scope or expiration settings.

## [1.7.3] - 2026-10-02

### User-facing changes

#### Changed

- **Release Pipeline:** Release-note fragments now appear in versioned releases, and Discord announcements use the shared channel webhook configured as the `DISCORD_RELEASE_WEBHOOK` Actions secret.

#### Security

- **Proxy:** YunoHost proxy requests now use a fixed upstream host and forward WebSocket upgrades only, blocking attacker-controlled host and h2c upgrade headers.
- **Dependencies:** Questarr now bundles a locally patched node-forge release that rejects malformed RSA PKCS#1 v1.5 DigestInfo signatures (CVE-2026-85393).

## [1.7.2] - 2026-10-01

### Security

- Downloader and integration requests now pin HTTPS and HTTP connections to the DNS address checked by the SSRF guard. SABnzbd no longer retries requests with certificate validation disabled; self-signed installations can trust their CA through `NODE_EXTRA_CA_CERTS`.
- File browser, import, SSL certificate, and screenshot paths now use canonical containment checks, including existing symlink parents and missing destination paths. Import confirmation rejects library destinations redirected outside the configured root by a symlink.
- Download-relative paths reject absolute and parent-directory components. Without an explicit path mapping, manual import overrides are restricted to the tracked download's reported directory.
- Replaced the Prowlarr and Synology string regexes that could take excessive time on crafted input, and added a development-server request limit.
- Removed npm from the production image and pinned the Python notification runtime with hashes. Updated Apprise and oauthlib to patched releases.

### Changed

- Upgraded Express to 5.2.1 and retained the existing extended query-parser behavior. TypeScript 7 remains excluded until the current typescript-eslint peer range supports it.
- Upgraded the Windows service to .NET 10 LTS and pinned its SDK and NuGet dependency lock to current servicing versions.
- Enabled automated dependency and code scanning workflows and applied compatible Dependabot updates.

## [1.7.1] - 2026-09-29

### Fixed

- Indexer HTTP 401 errors now explain when Questarr withheld an API key because the feed uses HTTP, and distinguish the Prowlarr/indexer opt-in from the downloader setting. Indexer search logs no longer retain feed API keys in request URLs. Downloader test failures now state when the HTTP opt-in did not reach the test request.

## [1.7.0] - 2026-09-29

### Added

- The SeerrNG catalog endpoint can return the exact day-precision IGDB release date for a requested platform, including `null` when IGDB has no complete date.

## [1.6.1] - 2026-09-28

### Changed

- Versioned images and installation manifests now report QuestarrNG 1.6.1 consistently. This maintenance release also removes unused release-branch triggers; application behavior is unchanged.

## [1.6.0] - 2026-09-28

### Added

- **RomM imports**: route matched ROM downloads into configured RomM platform folders. Import settings now include a RomM library root, transfer/conflict behavior, platform slug mappings, and manual destination selection. Existing mappings receive safe default slugs during database migration.
- **Prowlarr HTTP opt-in**: when syncing indexers from an HTTP Prowlarr instance, administrators can explicitly allow its API key to be sent to the synced HTTP indexers. New indexers remain opted out by default, and syncing with the option off preserves existing per-indexer choices.
- **Prowlarr feed diagnostics**: test the management API separately from each enabled torrent or usenet feed to identify indexer-level failures without exposing API keys or feed URLs.
- **Downloader connection checks**: the Allow insecure LAN acknowledgement is now applied to unsaved connection-test requests, so operators can test downloaders on trusted HTTP LANs as configured.
- **Proxmox install instructions**: the pinned-version example now installs QuestarrNG 1.6.0 from the maintained Snapetech repository.

### Fixed

- **File browser scope**: directory browsing is limited to configured library and download-mapping roots, and requests through symlinks that escape those roots are rejected.
- **Archive imports**: restored directory archive detection and categorized transfer handling so archive and categorized imports follow the maintained import pipeline.
- **Production startup**: the compiled server now resolves the shared game-journal schemas and starts successfully after a production build.
- **Database startup**: SQLite and PostgreSQL migrations now execute the RomM platform mapping update as separate statements, so fresh and upgraded databases can start successfully.
- **RomM import filenames**: filesystem-reserved characters now become spaces, preserving word boundaries in safe ROM destination names.
- **Screenshot uploads**: malformed image data now returns a client error instead of surfacing as a server failure.
- **Release images**: the tagged QuestarrNG image now publishes both `linux/amd64` and `linux/arm64`, matching the documented supported architectures.

### Security

- **IP address parsing dependency**: raised the `ip-address` override to `^10.7.0` (lockfile resolves 10.7.2) to include current upstream security fixes.

### Breaking changes

- Removed the unused legacy `PATCH /api/games/:id/notes` endpoint. API clients should use the per-user journal endpoints (`GET`/`POST /api/games/:id/journal` and `DELETE /api/games/:id/journal/:entryId`).

### Additional changes prepared for 1.5.0 and included in 1.6.0

The 1.5.0 release was not published. Its completed changes ship in 1.6.0:

### Removed

- **Legacy PostgreSQL migration tooling**: removed `scripts/pg-to-sqlite.ts` and
  `docker-compose.migrate.yml`. The tool dated from the v1.1 move off PostgreSQL
  and only knew about 8 of the project's 19 tables, so pointing it at a current
  database would have silently skipped the rest — and it continued past
  per-table failures while still reporting `Migration completed.` Operators
  still migrating a pre-v1.1 PostgreSQL installation should use the archived
  **v1.4.2** release — see [MIGRATION.md](./MIGRATION.md), which now inlines the
  pinned compose file, links the sources by tag permalink, and spells out how to
  verify the result.

## [1.4.1 - 1.4.2] - 2026-08

- **Downloader connection checks**: the insecure-LAN acknowledgement is now
  applied consistently to test-connection requests, allowing configured
  downloaders on trusted HTTP LANs to be tested without bypassing the setting.
- **Documentation**: corrected `docs/SECRETS.md` §8, which presented the
  `pg-to-sqlite` credential-logging issue as still open. It was real in
  **v1.1.0–v1.3.1**, which printed the full `DATABASE_URL` (embedding
  `user:password@host`), and was fixed in **v1.4.0** by commit `99984867`; §8
  was never updated when that landed, and its line reference had drifted onto
  the already-fixed line. §8 now states the affected range, the fix, and that
  **operators who ran the migration on an affected tag and retained the logs
  should rotate that Postgres password.**

### Security

- **1.4.1 Dependency Vulnerabilities**: Fixed 6 known vulnerabilities in `brace-expansion` (3), `fast-xml-parser`, `js-yaml`, and `body-parser`, plus a devDependency-only fix in `fast-uri` and a second, devDependency-only resolution path for the `brace-expansion` advisories.
- **1.4.2 Dependency Vulnerabilities**: Fixed 4 known vulnerabilities in `ip-address` (3) and `socket.io-parser`.

### Vulnerabilities Addressed

#### 1.4.1

### Changed

- Dependency updates: `undici` 7.29.0 → 8.9.0 (direct dependency, used by the SSRF-safe fetch wrapper in `server/ssrf.ts`). No vulnerability fix — see `docs/CVE_FIXES_BY_RELEASE.md` for verification. Major version bump; undici 8.9.0 requires Node `>=22.19.0`, so Questarr's own `engines.node` floor is raised from `>=20` to `>=22.19.0` to match — this only formalizes existing practice, since CI (`node-version: 26.x`) and the production Docker image (`node:26-alpine`) were already on Node 26. Full test suite and `server/__tests__/ssrf.test.ts` verified green against the new version.

- **QuestarrNG releases**: version checks and release links now follow the
  Snapetech fork. Releases publish versioned images under
  `ghcr.io/snapetech/questarrng`; `latest` continues to track the fork's main
  build.

## [1.4.2] - 2026-08-11

Hotfix release, tagged directly off `v1.4.1` rather than from `main` — not part of this branch's history. Fixed the same `ip-address` and `socket.io-parser` advisories independently patched above for `main`'s own accumulated changes (see the `[1.5.0]` entry). Full details in the `v1.4.2` tag and its own copy of this file.

## [1.4.1] - 2026-08-02

Hotfix release addressing dependency vulnerabilities flagged by `npm audit`.

### Security

- **Dependency Vulnerabilities**: Fixed 3 known vulnerabilities in `brace-expansion`, `js-yaml`, and `body-parser`, plus a second, devDependency-only resolution path for the same `brace-expansion` advisory.

### Vulnerabilities Addressed

- **brace-expansion** 5.0.7 → 5.0.8 — fixes **CVE-2026-14257** (GHSA-mh99-v99m-4gvg, HIGH) — DoS via unbounded expansion length causing an out-of-memory process crash.
- **js-yaml** 5.2.1 → 5.2.2 — fixes GHSA-pm4m-ph32-ghv5 (no CVE assigned, HIGH) — exponential parsing time in flow collections leading to denial of service.
- **body-parser** 1.20.5 → 1.20.6 — fixes **CVE-2026-12590** (GHSA-v422-hmwv-36x6, LOW) — an invalid `limit` value silently disabled size enforcement, allowing arbitrarily large request payloads.
- **fast-uri** (npm `overrides` pin, dev-only at the time) 3.1.3 → 3.1.4 — fixes **CVE-2026-16221** (GHSA-v2hh-gcrm-f6hx, HIGH) — host confusion via a literal backslash authority delimiter.
- **minimatch** override pinned to `^10.2.5` — closes a second resolution path for the `brace-expansion` advisories: `eslint-plugin-react`'s bundled `minimatch@3.1.5` still pulled the vulnerable `brace-expansion@1.1.x`. devDependency-only (not shipped in the production image), but flagged by `npm audit` without `--omit=dev`, so pinned for a fully clean audit.

#### 1.4.2

- **ip-address** (transitive, via `express-rate-limit`) 10.2.0 → 10.5.0 — fixes 3 CVEs; no `overrides` pin needed, `express-rate-limit`'s `^8.5.2` range already permitted 10.5.0:
  - **CVE-2026-69192** (GHSA-mwp4-54f8-5fhr, HIGH) — `Address4` decoded leading-zero octets as decimal while resolvers decode them as octal, allowing SSRF and trust-boundary bypass
  - **CVE-2026-54272** (GHSA-22jq-vg5j-6vgg, MODERATE) — misclassification of IPv4-mapped/NAT64 IPv6 addresses
  - **CVE-2026-69198** (GHSA-4xrf-jv44-h6hh, MODERATE) — a CIDR suffix on the parsed address suppressed special-use classification
- **socket.io-parser** (npm `overrides` pin) 4.2.6 → 4.2.7 — fixes **CVE-2026-69185** (GHSA-2m8v-j782-fhvr, HIGH, CVSS 7.5) — zero-attachment memory exhaustion, vulnerable range `4.0.0 - <4.2.7`. Reaches production via `socket.io`/`socket.io-client` (real-time download-progress and notification updates).

## [1.4.0] - 2026-07-16

Migration note:

- The `PORT` variable in `docker-compose.yml` has been split into two: `HOST_SIDE_PORT` (host-side binding, default `5000`) and `CONTAINER_INTERNAL_SIDE_PORT` (internal container port, default `5000`). If you had `PORT` set in your `.env` to customize the host port, rename it to `HOST_SIDE_PORT`.
- Current Compose files also accept `PORT` as a backward-compatible fallback for both host and internal ports. Explicit `HOST_SIDE_PORT` and `CONTAINER_INTERNAL_SIDE_PORT` values override that fallback.
- With Post-processing, don't forget to add your volume mapping to the docker compose file.

An easter egg has been added to the app; shouldn't be too hard to find if you think about the very famous easter eggs in gaming! Let me know what you think.

### Added

- **Post-Processing Pipeline**: Added an automated post-processing pipeline that handles unpacking and organizing files after a download completes (#583)
  - Files can be unpacked automatically by setting auto-unpack setting
  - An import modal is displayed via an alert in the library when the system cannot find the input or output path.
- **Import History**: New page listing import tasks (game claims, post-processing imports, Steam syncs) with a retention purge cron job to keep the history tidy (#714).
- **Deluge Support**: Added Deluge as a supported downloader (#697).
- **Synology Download Station**: Added support for Synology's built-in Download Station as a downloader (#567).
- **Apprise Notifications**: Added Apprise API and CLI notification modes. Use API mode with a remote Apprise server or CLI mode with the local `apprise` binary from Questarr settings. Bundled Python and Apprise in the default image so CLI mode works without a separate image split.
- **Personal Notes**: Added the ability to attach personal notes to a game.
- **Shelved Status**: Added a "shelved" status for games (#645).
- **Real-Time Logs**: Added a real-time log streaming page with configurable detail level and truncation for large payloads.
- **Send Logs**: Added the ability to send logs directly from the app for troubleshooting (#648).
- **Search Improvements**: Added a date filter and infinite scroll to search, plus the ability to delete a result from the library directly from search (#673).
- **Library Ratings**: Added a user rating filter and inline rating in the library's list view; the Stats page now shows average user rating.
- **Favorite groups**: Added favorite release groups for auto downloading releases, in the settings.
- **G4U as indexer**: Added g4u.to as an indexer type, using their VIP API (#689).
- **Vite Base Path**: Added support for deploying behind a custom base path (#630).
- **Code of Conduct**: Added Contributor Covenant Code of Conduct.
- **Downloaders Compatibility doc**: Added a document detailing compatibility for supported downloaders.

### Security

- **SSRF**: Hardened outbound fetches with DNS rebinding protection (#698).
- **Dependency Vulnerabilities**: Fixed 3 known vulnerabilities in `esbuild`, `form-data`, and `ws` (#734).
- **CI Hardening**: Applied StepSecurity best practices, added a blocking Semgrep SAST gate and secretlint scanning, and added automatic SBOM generation to the Docker release pipeline.
- **OpenSSF**: passed baseline 1, 2 and 3 security self-eval (ongoing for 'passing' check). Update to current checks and new ones for hardened security. New policies. See SECURITY.md on GitHub.

### Changed

- **Dashboard**: Consolidated the Dashboard into the Library component, removing the separate Library page.
- **Docker**:
  - Refactoring of the entrypoint script.
  - `SQLITE_DB_PATH` is now optional and exported with a default of `/app/data/sqlite.db`.
  - The `PORT` variable in `docker-compose.yml` has been split into two: `HOST_SIDE_PORT` (host-side binding, default `5000`) and `CONTAINER_INTERNAL_SIDE_PORT` (internal container port, default `5000`). If you had `PORT` set in your `.env` to customize the host port, rename it to `HOST_SIDE_PORT`.
- **Dependencies**: Node 22 to 26. Removed duplicate `@types/multer` entry from `package.json`; updated Radix UI, semver, and other minor dependencies; upgraded `codecov/codecov-action` from v5 to v7; updated numerous packages via Dependabot including `lucide-react`, `recharts`, `framer-motion`, `jsdom`, `express`, `express-rate-limit`, `@tanstack/react-query`, `react-hook-form`, and GitHub Actions.
- **Performance**: Optimized the Add Game modal's collection-status check with a Set lookup (#677); the downloads page now polls every 30 seconds.
- **Downloaders Module**: Refactored `downloaders.ts` into smaller modules for easier maintenance (#627).
- **Notifications Behaviour**: the notifications now trigger only once per event, instead of once per cron job.
- **Genres & Platforms Display**: Overflow-safe tag list for genres and platforms on game cards (#680).
- **Aborted Downloads**: Definitive downloader failures are now surfaced as "Aborted" instead of an unclear stuck state.
- **List View**: Removed the ultra-compact view in favor of an updated column-based row view.
- **Date display**: year-only release dates now display in full.
- **Release Date Sorting when adding a game**: IGDB results are not sorted by release date.
- **Mobile Experience**: Significant improvements to mobile layout and navigation (#644).
- **Downloader/Indexer Version Logging**: Periodic logging of downloader and indexer versions to aid troubleshooting (#649).

### Removed

- Removed the HLTB integration from Questarr (no API or stable service).

### Fixed

- Fixed status switcher UI and badge positioning in game details (#764).
- Fixed handling of the `stoppedDL` state in qBittorrent v5+.
- Fixed an error when adding a torrent via qBittorrent.
- Fixed a scrolling issue in the claim modal.
- Fixed Torznab/Prowlarr download URL rewriting so proxied URLs are no longer double-wrapped on host aliases (#647).
- Fixed the files view and missing seed/leech numbers in download details.
- Hardened download status checks and migrated the Steam logger.
- Addressed edge cases in auto-search download rules
- Fixed the "Has results" badge that would create an offset in the game card.
- Fixed the Home Assistant add-on: moved to the repo root and corrected /data permissions on fresh installs (#696). See [../questarr/README.md]

### Vulnerabilities Addressed

- **js-yaml** 4.1.1 → 5.2.1 — fixes **CVE-2026-53550** (GHSA-h67p-54hq-rp68, MODERATE) — quadratic-complexity DoS in merge-key handling via repeated aliases.
- **multer** 2.1.1 → 2.2.0 — fixes the 2 CVEs left open in the v1.3.0
  - **CVE-2026-5038** (GHSA-3p4h-7m6x-2hcm, MODERATE) — DoS via incomplete cleanup of aborted uploads
  - **CVE-2026-5079** (GHSA-72gw-mp4g-v24j, HIGH) — DoS via deeply nested field names
- **form-data** (transitive, resolved 4.0.5 → 4.0.6) — fixes **CVE-2026-12143** (GHSA-hmw2-7cc7-3qxx, HIGH) — CRLF injection via unescaped multipart field names/filenames.
- **ws** (transitive, resolved 8.18.3 → 8.21.0) — fixes 2 CVEs:
  - **CVE-2026-45736** (GHSA-58qx-3vcg-4xpx, MODERATE) — uninitialized memory disclosure
  - **CVE-2026-48779** (GHSA-96hv-2xvq-fx4p, HIGH) — memory exhaustion DoS from tiny fragments/data chunks
- **esbuild** (devDep) 0.28.0 → 0.28.1 — fixes GHSA-g7r4-m6w7-qqqr (no CVE assigned) — the Windows dev-server arbitrary-file-read issue flagged as still-open in the v1.2.1/v1.3.0 entries is now fixed.
- **esbuild, nested copy** — the new npm `overrides` entry (`@esbuild-kit/core-utils` → `esbuild ^0.25.0`) bumps that dependency's bundled esbuild from 0.18.20 to 0.25.12, fixing GHSA-67mh-4wv8-2f99 (no CVE, MODERATE — dev server accepts arbitrary cross-origin requests). Separately, `tsx`'s own duplicate nested esbuild copy (0.27.7, carrying the same GHSA-g7r4-m6w7-qqqr as above) was deduped away entirely by this bump round rather than upgraded.
- **vite** (devDep) 8.0.12 → 8.1.3 — fixes both issues left open in the v1.3.0:
  - **CVE-2026-53571** (GHSA-fx2h-pf6j-xcff) — `server.fs.deny` bypass
  - **CVE-2026-53632** (GHSA-v6wh-96g9-6wx3) — launch-editor NTLMv2 hash disclosure via UNC path on Windows

## [1.3.1] - 2026-05-13

### Fixed

- Fix NZB URL encoding for Prowlarr and other indexers where `+` characters in base64-encoded links caused "Invalid link" errors — applies to qBittorrent, Transmission, and rTorrent clients.
- Fix broken indexer URLs when fetching NZBs through clients that relay the request
- Fix auto-search download rules handling.
- Fix CRLF line endings in Docker entrypoint script to prevent container start failures on Linux hosts.

### Changed

- Improve rTorrent error message when Digest authentication fails.
- Added retry algo before marking a download as failed, reducing false-positive failures.
- Optimize dashboard statistics computation for faster page load.
- Optimize calendar year view by replacing `Date` parsing with string prefix matching, significantly reducing render time for large libraries.
- Add missing ARIA label to RSS feed delete button for screen reader accessibility.
- Updated Docker Compose and Dockerfile configuration.
- Dependency updates: React, express-rate-limit, fast-xml-parser, @types/express-session, and Docker CI actions.

### Addressed Vulnerabilities

- None

## [1.3.0] - 2026-04-11

### Added

- **Steam Wishlist Sync**: New button near Add game (displayed with Steam ID is provided in the settings) to sync up your backlog with your Steam wishlist, adding all games as wanted.
- **Add Game UX**: Pre-fill the add game search value with the current dashboard search query; display release date in the modal.
- **New game badges**: Three new games badges:
  - Results available, badge displayed when a game has downloads available (#517).
  - Update available, for owned games that have update type downloads available.
  - "Early Access" badge (#519).
- **Game Details Modal Redesign**:
  - Tabbed UI with IGDB metadata, full download history, game related links.
  - Game Data Integrations: IGDB and Steam metadata enrichment, gameplay-time estimates (#537), PCGamingWiki game URL lookup (#538), and NexusMods integration (#540).
  - User Ratings: Rate games directly from the game details (#530).
- **Notification on Download**: Notification updated when a download is sent to the download client, to display the downloader's name.
- **Download Linking**: Per-game and batch linking to games to claim existing downloads (#543).
- **New settings**
  - **Preferred Platform**: Select a preferred platform and filter results accordingly (#531).
  - **Preferred Release Groups**: Configure preferred release groups for auto-download, auto search and pre-filtering (#491).
  - **Auto-Search Control**: Disable auto-search for unreleased games with possibility to enable in settings (#394).
- **Stats Page**: New statistics page with Discord sharing support (#384, #493).
- **Blacklist Releases**: Blacklist unwanted releases directly from download search results (#490).
- **Updates Filter**: Filter library to show only games with available updates (#548).
- **Hide from Library**: Hide button in game details, accessible from all pages (#439).
- **Search Fields**: Added search/filter field to calendar, downloads, and wishlist pages.
- **Calendar — Year-Only Section**: Separate calendar section for games with a year-level release date but no exact date.
- **Download Enhancements**: Download indicators and shared view controls (#484); freeleech status, poster name, and leecher count per download item (#516); "Questarr-added" toggle (#523); platform filter in download dialog (#518).
- **Sidebar Page Counters**: Sidebar now shows active download count only; full counters added to the downloads page (#503).
- **Wishlist Improvements**: Toggle to show/hide unreleased games with reordered sections (released first) (#460).
- **Login Page**: GitHub link with current version info (#481).
- **Inline Priority**: Change indexer and downloader priority inline without opening settings.
- **PageToolbar**: Unified toolbar component replacing the standalone SearchBar and DisplaySettingsModal across pages (#521).
- **Migration Repair**: Automatic schema repair for the v1.2.2 → v1.3.0 migration path, to account for people using v1.3.0 before release. (#542).

### Security

- **SSRF**: Fixed SSRF vulnerabilities in RSS feed fetching (#404, #468) and magnet link redirects in qBittorrent (#508).
- **SSRF DNS Rebinding**: Fixed DNS rebinding bypass in SSRF protection layer (#385).
- **Rate Limiting**: Added brute-force rate limiting to the login endpoint (#455).
- **Credential Exposure**: Fixed credential logging, weak session secret enforcement, and missing brute-force protection (#415).
- **Information Leakage**: Fixed error messages exposing internal details (#421).
- **axios CVE**: Resolved critical axios vulnerability (#547).
- **CI Hardening**: Applied security best practices and pinned action SHAs in GitHub Actions workflows (#494, #504).
- **node-forge**: Upgraded from 1.3.3 to 1.4.0 to resolve a known vulnerability (#496).

### Changed

- **Lazy Loading**: Game details and download dialogs are now lazy-loaded for faster initial page load (#422).
- **Performance**: Server-side filtering for user games (#386); batch DB updates in game update cron job (#405); memoized sorted game lists in wishlist (#509); memoized search result sorting (#533).
- **Steam**: Removed Steam sign-in button and Steam API key requirement; fixed wishlist sync (#428).
- **IGDB**: Platform retrieval is now paginated to return complete results (#471).
- **RTorrent**: Refactored download path handling to prevent double-nesting of category directories.
- **Download Dialog**: Removed non-functional files field from the game download dialog UI; dialog no longer auto-closes after a successful download.
- **Game Card**: Displays primary genre only and shows N/A for unrated games.
- **Notifications**: Game update notifications now trigger only for owned games (#438).

### Fixed

- SABnzbd downloads lost on queue→history transition (#511).
- RTorrent download directory and NZB file parameter stripping (#472).
- Transmission download failures: RPC errors now surfaced correctly (#436).
- Torznab client not correctly handling Prowlarr redirect links (#487).
- Magnet link redirect handling for Transmission and rTorrent clients.
- Platform select dropdown overflowing the viewport (#512).
- Download search results, UI state, and download action visibility (#515, #557).
- IGDB request failures on the Discover page (#522).
- Sort option "Health" not sorting correctly (#390).
- Search bar position displaced by clear button; stats bar disappearing during search.
- Validation error when adding a game without a cover URL.
- Pino logging objects by reference instead of value.
- One-time IGDB retry on HTTP 429 to avoid hammering the API.
- Download results table header not sticky during scroll.

### Addressed Vulnerabilities

- **fast-xml-parser** 5.3.7 → 5.7.1 — fixes 4 CVEs:
  - **CVE-2026-33036** (GHSA-8gc5-j5rx-235r, HIGH) — numeric entity expansion bypassing all expansion limits (incomplete fix for CVE-2026-26278)
  - **CVE-2026-27942** (GHSA-fj3w-jwp8-x2g3, LOW) — stack overflow in XMLBuilder with `preserveOrder`
  - **CVE-2026-41650** (GHSA-gh4j-gqv2-49f6, MODERATE) — XML Comment/CDATA injection via unescaped delimiters
  - **CVE-2026-33349** (GHSA-jp2q-39xq-3w4g, MODERATE) — entity expansion limit bypassed when set to `0` (JS falsy-evaluation bug)
- **node-forge** 1.3.3 → 1.4.0 — fixes 4 CVEs:
  - **CVE-2026-33896** (GHSA-2328-f5f3-gj25, HIGH) — `basicConstraints`/RFC 5280 cert-chain validation bypass
  - **CVE-2026-33891** (GHSA-5m6q-g25r-mvwx, HIGH) — DoS via `BigInteger.modInverse(0)` infinite loop
  - **CVE-2026-33894** (GHSA-ppp5-5v6c-4jwp, HIGH) — RSA-PKCS1 v1.5 signature forgery (Bleichenbacher-style)
  - **CVE-2026-33895** (GHSA-q67f-28xg-22rw, HIGH) — Ed25519 signature malleability (missing canonical-scalar check)
- **socket.io-parser** (npm `overrides` pin) 4.2.5 → 4.2.6 — fixes **CVE-2026-33151** (GHSA-677m-j7p3-52f9, HIGH) — unbounded binary attachments DoS
- **drizzle-orm** 0.45.1 → 0.45.2 — fixes **CVE-2026-39356** (GHSA-gpj5-g38j-94v9, HIGH) — SQL injection via improperly escaped SQL identifiers
- **express-rate-limit** 8.2.1 → 8.3.2 — fixes **CVE-2026-30827** (GHSA-46wh-pxpv-q5gq, HIGH) — IPv4-mapped IPv6 addresses bypass per-client rate limiting on dual-stack servers
- **multer** 2.0.2 → 2.1.1 — fixes 3 of 5 CVEs present since multer's introduction in v1.2.1:
  - **CVE-2026-3520** (GHSA-5528-5vmv-3xc2, HIGH) — DoS via uncontrolled recursion
  - **CVE-2026-2359** (GHSA-v52c-386h-88mc, HIGH) — DoS via resource exhaustion
  - **CVE-2026-3304** (GHSA-xf7r-hgr6-v32p, HIGH) — DoS via incomplete cleanup

---

## [1.2.2] - 2026-02-26

### Security

- **Docker**: Fixed container running as root user; adjusted user permissions for safer defaults (#424, #417).
- **SSRF Protection**: Fixed HTTP request SSRF vulnerability (#418).
- **fast-xml-parser**: Upgraded from 5.3.5 to 5.3.7 to address CVE (#416).
- **CI**: Pinned 3rd-party GitHub Actions to commit SHAs (#419).

### Changed

- Added `repository` and `engines` fields to `package.json`.
- Updated CI dependencies: `docker/build-push-action` 6.18.0 → 6.19.2 (#408), `docker/setup-qemu-action` 3.2.0 → 3.7.0 (#409).
- Updated runtime dependencies: `react-hook-form` (#410), `pino` 10.3.0 → 10.3.1 (#412), `@tanstack/react-query` 5.90.20 → 5.90.21 (#413), `dotenv` 17.2.4 → 17.3.1 (#414).
- Updated dev dependencies group (#411).

### Addressed Vulnerabilities

- **fast-xml-parser** 5.3.5 → 5.3.7 — fixes **CVE-2026-26278** (GHSA-jmr7-xgp7-cmfj, HIGH) — DoS via entity expansion in DOCTYPE (no expansion limit).

## [1.2.1] - 2026-02-21

### Added

- **SSL Support**: Added SSL support with optional HTTP to HTTPS redirection (#395).
- **ARM64 Support**: Added ARM64 architecture to CI builds (#388).

### Changed

- HSTS is disabled if SSL is disabled.
- Updated dependencies including `fast-xml-parser`, `semver`, `dotenv` (#378, #379, #380, #381).

### Fixed

- Fixed issue with tracked `sqlite.db` and updated `.gitignore`.

### Addressed Vulnerabilities

- **fast-xml-parser** 5.3.4 → 5.3.5 — fixes **CVE-2026-25896** (GHSA-m7jm-9gc2-mpf2, CRITICAL) — entity-encoding bypass via regex injection in DOCTYPE entity names.

## [1.2.0] - 2026-02-08

- **RSS Feed Support**: Added a dedicated page for RSS feeds with capabilities to manage feeds and view items.
- **xREL Integration**: Implemented integration with xREL.to for game release notifications and metadata.
- **Download Modal Redesign**: Complete redesign of the download dialogs (simple and advanced) for improved usability.
- **Compact View**: Added a density setting to toggle between comfortable and compact list views in Dashboard, Library, and Wishlist.
- **Enhanced Notifications**: Added links to notifications, allowing direct navigation to relevant games or pages.
- **Security hardening**: Introduced protections for SSRF, missing security headers, and improved IPv6 validation.

### Changed

- **Privacy**: Removed Google Fonts dependency for better privacy and offline support.
- **Performance**: Optimized metadata refresh with chunked fetching and improved Prowlarr indexer synchronization.
- **Settings**: Updated settings page with tabbed navigation for better organization.
- **UX**: Enhanced password visibility toggles and accessibility throughout the app.
- **Logging**: Improved log truncation for better performance and privacy.

### Fixed

- Fixed Content Security Policy (CSP) preventing version checks.
- Resolved UI issue where the close button overlaid the cover image in GameCard.
- Fixed timestamp calculation issues affecting notification times.
- Reduced log verbosity for SSL verification errors.

### Addressed Vulnerabilities

- **fast-xml-parser** 5.3.3 → 5.3.4 — fixes **CVE-2026-25128** (GHSA-37qj-frw5-hhjh, HIGH) — RangeError DoS via numeric entities.

## [1.1.0] - 2026-01-19

### Added

- **SQLite Support**: Migrated database engine from PostgreSQL to SQLite for a simpler, "single-file" deployment.
- **Migration Tooling**: Added `docker-compose.migrate.yml` and `pg-to-sqlite.ts` to automatically convert data from old PostgreSQL installations.
- **Improved Docker Experience**: Default environment variables and automatic directory creation for a true "Pull & Run" experience.
- **Migration UI Warning**: Added a prominent banner on the Setup page to prevent users from accidentally skipping the migration process.

### Changed

- Refactored `storage.ts` and `schema.ts` for SQLite compatibility.
- Simplified `docker-compose.yml` (removed PostgreSQL service).
- Updated `README.md` and added `docs/MIGRATION.md` with detailed upgrade instructions.

### Fixed

- Improved reliability of database initialization on fresh installs.

## [1.0.5] - 2026-01-18

### Changed

- Update to docker-compose.yml file to make port a variable throughout.

### Fixed

- Initial setup not working

## [1.0.4] - 2026-01-13

- Initial release of the changelog

### Added

- feat: added links to torrent on indexer if available
- feat: add indexer filtering to download items in GameDownloadDialog
- feat: add indexerName to DownloadItem interface
- feat: add auto sorting functionality for downloaders and indexers based on priority and enabled status
- Add contributors list and shorten readme

### Changed

- refactor: added new max width for download title, aligned tooltip with changes, added underlines on hover to links
- Dep updates
- Update downloader and indexer pages to sort by enabled status, then priority and update disabled style
- feat: update downloader input placeholder to reflect selected type
- Allow IGDB configuration during initial setup, removing the need to edit the .env or docker-compose file.
- Updated deployment workflow
- Improved URL parsing to fix some issues when using external indexers/downloaders
- Refactoring of migration runner for more reliability

### Fixed

- fix: added missing seperator to download modal #312

---

> This changelog follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

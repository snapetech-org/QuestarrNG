# Upstream resolution campaign

## Scope and ownership

Review every issue and pull request in Doezer/Questarr, including closed issues,
merged PRs, and closed unmerged PRs. The refreshed inventory has **1,246
records**: 235 issues and 1,011 PRs. Implement actionable behavior that is missing
from QuestarrNG, verify behavior that already exists, and record an
evidence-backed disposition for every source item. The user confirmed the full
historical scope on October 12, 2026.

“Resolved” means addressed or given a justified disposition in QuestarrNG. This
campaign does not change upstream GitHub statuses: Doezer's maintainers decide
whether to accept the work, merge it, publish it, or close the original issue
or PR. Historical patches are evidence to inspect, not instructions to replay
blindly. Preserve the fork's integrations, security, deployment, and database
behavior when implementing upstream requests.

## Current ledger snapshot

The live audit refreshed upstream main
6b14c6943938fd22d9943368baca3c72b1fa957c. The sanitized source snapshot has
235 issues and 1,011 pull requests (1,246 records total) and was generated at
2026-10-31 04:04:24 UTC. The current ledger records 44 source-changed records;
each needs renewed review against its current source. Batch 84 reviewed PRs
#950–#957 and Batch 85 reviewed PRs #958–#963; all 14 source digests matched
the refreshed snapshot.

| Review status | Items |
| --- | ---: |
| verified | 699 |
| superseded | 227 |
| not-applicable | 14 |
| implemented-unverified | 8 |
| needs-implementation | 0 |
| unreviewed | 298 |
| **Total** | **1,246** |

The ledger gives 948 records an assigned disposition. The eight
implemented-unverified items include four integrations awaiting live-service
checks, DCO enforcement awaiting maintainer rollout, PR #933 awaiting an
Inno Setup build and Windows installation/service-lifecycle checks, plus the
new fallback-category and cookie-first auth changes from Batch 84. Forty-four
source-changed records and 298 unreviewed records remain. Batch 84's new
category notice and cookie-first auth behavior still need exact-head tests and
browser evidence on compatible private ephemeral JIT capacity. These counts
describe progress, not campaign completion. See the
[Batch 85 review evidence](evidence/validation-batch-85.md).


## Project records

- [Every issue and PR](inventory.md) is the generated navigation table. Its
  history column reports commit ancestry only; ancestry does not prove behavior.
- [The resolution ledger](ledger.json) is authoritative for each source's
  findings, acceptance checks, evidence, dependencies, source digest, and review
  status.
- [The source snapshot](sources.json) records sanitized issue and PR list-export
  data. It does not contain complete issue timelines, PR review threads, or
  diffs.
- [The audit and evidence process](AUDIT-PROCESS.md) defines source review,
  status meanings, evidence standards, refresh procedure, and the merge gate.
- [Batch evidence](evidence/) records focused and combined validation results.

## Scratch space and cleanup

Validation uses a unique task directory for temporary databases, browser
reports, and downloaded test services. Local temporary storage is used when it
has enough room; the LVM-backed NFS share may be used for larger or
speed-insensitive scratch only after confirming its current host, mount path,
and free space. The [audit process](AUDIT-PROCESS.md#task-scratch-and-cleanup)
defines the isolation, preservation, and cleanup steps. Every batch evidence
file records what scratch was used and what was removed or deliberately left
untouched.

The `capturedAt`, `forkHead`, and `upstreamHead` fields identify the inventory
generation. They are not a pointer to the latest campaign commit. Refresh the
source snapshot before final review and revisit any item whose source changed.

## Completion and merge gate

Review source details and linked requests, translate requirements into
acceptance checks, make changes in dependency-aware batches, and verify the
resulting user behavior. Test persistence on SQLite and PostgreSQL when a change
touches both database paths. Changes under `client/src/**` need a screenshot or
recording of the running UI from `npm run dev:test`; include the visual evidence
in the pull request description.

The campaign is ready for merge to QuestarrNG `main` only after a fresh complete
inventory has no `unreviewed`, `needs-implementation`, or
`implemented-unverified` entries; every other entry has source-backed evidence;
source changes have been re-reviewed; required UI evidence is present; and the
combined validation suite passes. See the full [completion criteria](AUDIT-PROCESS.md#campaign-completion-and-merge-gate).

## Initial open-item findings

| Item                                                                            | Required investigation / proposed treatment                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#923: update notification](https://github.com/Doezer/Questarr/issues/923)      | Maintainer comments say bell/Apprise notifications already exist and update management is in progress. Verify the actual fork behavior and thumbnail indication without duplicating notification machinery.                                                           |
| [#906: cross-server libraries](https://github.com/Doezer/Questarr/issues/906)   | This is a protocol proposal, not a completed specification for Questarr. Inspect the referenced protocol and closed PR #1083. Define identity, peer revocation, separate browse/download grants, local file boundaries and compatibility tests before implementation. |
| [#406: file-type search](https://github.com/Doezer/Questarr/issues/406)         | Verified torrent-manifest extension filtering with safe redirect handling; magnets, Usenet and unknown payloads fail closed rather than relying on release-title text.                                                                                                |
| [#336: alternative game sources](https://github.com/Doezer/Questarr/issues/336) | Verified optional Hydra-format public HTTPS catalogs, bounded schema and torrent-link checks, source attribution, and integration with aggregated search; curated catalog origin is not proof of malware safety.                                                      |
| [#1172: v1.5 release preparation](https://github.com/Doezer/Questarr/pull/1172) | Verified the applicable docs and browser coverage in QuestarrNG; preserve its 1.10.0 release identity and secure HTTP opt-in defaults. Upstream tagging and publication remain Doezer release operations.                                                             |
| [#1166: release scoring engine](https://github.com/Doezer/Questarr/pull/1166)   | Engine-only PR with substantial review follow-ups. Review latest head, title utility prerequisites and regex dependency. Link closed #1103 and issue #1090; full release-scoring feature may require persistence, search integration and UI beyond this PR.           |
| [#1131: RAWG metadata](https://github.com/Doezer/Questarr/pull/1131)            | The maintainer requested RAWG as an optional alternative, not an IGDB replacement. QuestarrNG implements that direction with separate IDs and passing stubbed-provider tests; a live RAWG API response still needs an operator key.                                   |

These findings were preliminary; the follow-up sections record completed implementation and final dispositions.

## First implementation batch

Issue [#1169](https://github.com/Doezer/Questarr/issues/1169) and PR
[#1170](https://github.com/Doezer/Questarr/pull/1170): ported the SABnzbd category
fallback and five upstream regression cases from Vincent A's commit
`58d984d2cda90f1b04fffb5deffb15527dbeeec5`. Requests now select the explicit
category, then the saved downloader category, then `games`.

The two configured-category cases failed before the fix; all 19 tests in the
two SABnzbd suites pass afterward. TypeScript checking and changed-production-file
lint pass. [Before](evidence/sabnzbd-before.txt) and
[after](evidence/sabnzbd-after.txt) results are retained.

The reporter subsequently said the upstream fix still did not work on a dev
image. We reproduced the full path through Questarr's authenticated downloader
API and SABnzbd 5.1.3: the configured category survived save and reload, Test
Connection succeeded, a request without its own category entered the saved
category, and an explicit request category overrode it. With no configured
category, the adapter uses `games`. SABnzbd maps unregistered category names to
`*` (Default), so the compatibility guide now calls out that the category must
also exist in SABnzbd. Both entries are now `verified`; the test queue was
cleared and no Usenet server was configured, so no content was downloaded.
See [batch 6](evidence/validation-batch-6.txt).

## Refresh and review workflow

Follow the [audit process](AUDIT-PROCESS.md#review-and-implementation-workflow)
to refresh the inventory and collect full issue timelines and PR review
threads. The refresh script preserves reviews, flags changed source digests,
and does not promote an item to resolved. Use only the ledger's defined statuses
and record evidence for each disposition.

## Working location

Campaign work is being delivered from the isolated `codex/upstream-resolution`
branch in the `QuestarrNG-upstream-resolution` sibling worktree. The original
checkout remains separate from this campaign branch.

## Initial integration checkpoint — October 12, 2026

Upstream main through `fb650bab` is merged with fork behavior preserved. This
includes import/library discovery, backlog roulette, download recovery, archive
update handling and Prowlarr changes. The unsafe blanket HTTP-consent backfill is
excluded: revoked consent stays revoked.

Later batches delivered thumbnail update badges (#923), Hydra-format JSON
catalogs (#336), strict torrent-manifest extension filtering (#406), the standalone
release scoring engine (#1166), and Prowlarr release-preparation fixes/coverage (#1172).
The scoring source comes from upstream head `9998f5a9`; its Jessomadic/Questarr
GPL attribution remains in the source. Release-preparation ports come from
`07d7386b`.

Initial validation: 3,997 tests passed, seven skipped; statements 84.62%, branches 77.44%,
functions 82.02%, lines 86.02%. TypeScript, lint, secret scanning and production
build pass. See [checkpoint evidence](evidence/validation-batch-1.txt).
Running UI screenshots are in `docs/pr-evidence/upstream-*.png`.

This is a checkpoint, **not completion of all 1,147 items**. Optional RAWG support
and issue #1081's per-user Socket.IO delivery are now implemented; federation,
integrated scoring profiles, real-service checks and most historical per-item
reviews remain. The ledger distinguishes verified behavior from integration work
still awaiting real external services. No upstream issue or PR has been closed.

## Follow-up: optional RAWG provider

RAWG is now available as an optional, additive metadata and discovery provider
from **Settings → Integrations**. It stores a separate provider ID, encrypts the
API key, keeps IGDB active for SeerrNG, applies per-user content filters and
provides attribution only when RAWG is configured. See [RAWG setup and terms](../RAWG.md).
Upstream PR #1131 remains open; its maintainer explicitly asked for this optional
provider behavior. The browser journey passes with stubbed RAWG results, but a
live response remains unverified until a valid API key is available.

Issue #906 is recorded as `not-applicable`: its author explicitly states the
federation specification is an offer, not a feature request. Closed PR #1103 is
now verified: release profiles persist, manual searches explain and sort scored
results, and opt-in automatic search admits only accepted releases. PR #1083 is
`not-applicable` because it only records the same protocol offer in contributor
documentation. Issue #406 is also verified: search checks the actual torrent
manifest and follows SSRF-checked redirects; unknown, magnet and Usenet results
are excluded with the limitation shown in the running UI. Issue #336 is verified:
operators can configure Hydra-format public HTTPS catalogs, and their torrent
links join normal aggregated search with source attribution. Catalog origin does
not certify release safety; the existing scanning controls remain applicable.
At that checkpoint, the ledger had 1,037 unreviewed records. Each of the four open issues
and four open PRs has a preliminary disposition; review status is tracked
separately from GitHub state. Issue #37 still needs the remaining mutation
routes moved to shared Zod validation.

## Follow-up: v1.5.0 release-preparation coverage (#1172)

The latest PR head is 9a4fd4d8. QuestarrNG now has quick-start, indexer/Prowlarr,
notification and RSS guides, a 33-page Mintlify navigation map, and a more
detailed Import guide covering archive updates, Wii U, recovery, ClamAV review,
disc images and Sort Extras. Twenty-six browser journeys for roulette, Discover,
settings organization and post-RC1 behavior pass, along with 60 focused
Prowlarr/SSRF unit tests. Version-specific 1.5.0 metadata is not copied over the
fork's current 1.10.0 identity. Existing HTTP integrations remain opted out
unless an operator explicitly grants that permission. Doezer retains control of
the upstream merge, tag and release publication.

## Follow-up: dependency and CI security fixes (#1186)

The fork already had PyJWT 2.15.1, a `fast-copy` 4.1.0+ override, no Tailwind
Typography or selector-parser dependency, and a single `engine.io` override.
QuestarrNG now pins Semgrep 1.180.0 in its hash-locked CI toolchain and records
that fork-specific update under v1.10.0. A clean hash-checked install passed,
`uv pip check` passed, the npm audit reported zero vulnerabilities, and the
configured SAST scan covered 928 tracked files with zero ERROR-severity
findings. The scan produced one WARNING on a route that checks both lexical and
real-path containment. This disposition resolves the applicable request while
leaving Doezer's PR open for its maintainer.

## Follow-up: per-user Socket.IO events

Issue [#1081](https://github.com/Doezer/Questarr/issues/1081) is verified. Every
private `notifyUser` event is routed to the authenticated owner's socket room,
including download status, library scan progress, game refreshes and import task
updates. Events without a known owner are dropped. Socket tests cover delivery
between two users and unknown-owner suppression; the full unit suite passes.

## Follow-up: early API, download and startup requests (#1–25, #237/#245/#260)

The shared download-status contract now lives in `shared/schema.ts`. Database
environment settings are validated through Zod with an explicit Postgres opt-in,
and indexer/downloader PATCH bodies pass through shared Zod schemas before
reaching storage. QuestarrNG's Copilot instructions now describe the current
React 19/Vite 8/Express 5 stack and the dual-database layout. Existing discovery
download actions, qBittorrent support, download details/history, indexer
categories/testing, carousel controls, and first-user setup/login were checked
against their original requests.

The production image was rebuilt and smoke-tested: `nanoid` resolved at runtime,
both migration journals were packaged, first-start migrations completed, and
the health and protected SeerrNG routes returned their expected responses. Issue
#260 is `not-applicable`: the report showed a Compose hostname/internal-port
mismatch, and the reporter confirmed that a clean pull fixed it.

At that checkpoint, the ledger had 1,105 unreviewed items, 38 verified, 3
`not-applicable`, and one implemented-but-unverified integration. The full suite
passed with 4,016 tests and 7 skips; typecheck, lint, format, production build,
and PostgreSQL schema checks also passed. The downloads-page screenshot was
captured after its loading state settled and is included in the review evidence:

![Downloads page after loading](../pr-evidence/upstream-download-status.png)

## Follow-up: early search and product requests (#26–60, PRs #61–69)

Multi-indexer search, background notifications, library statistics, settings,
health/readiness probes, downloader fallback and rTorrent support, indexer
controls, download details/errors, authentication, and structured error handling
are present in the fork and documented per item in the ledger. The health
request uses separate liveness and readiness routes so public probes do not
reveal component-specific details.

IGDB search now retries transient 429 and 5xx responses for at most three
requests, honors bounded `Retry-After` delays, and reduces routine search logs to
debug level. The PostCSS `from` setting from PR #101 is restored in Vite; the
production build has no PostCSS warning. Issue #37 remains open in the ledger:
validation is not yet uniformly Zod-based across every POST/PATCH body.

This batch passed the full suite with 4,019 tests and 7 skips, plus typecheck,
lint, and production build. See [batch 10 evidence](evidence/validation-batch-10.txt).
The ledger now has 1,062 unreviewed items, 80 verified, 3 `not-applicable`, one
implemented-but-unverified integration, and one item still needing implementation.

## Follow-up: cleanup, dependency, and deployment requests (#70–95)

The next slice covers Replit cleanup, dependency upgrades, the indexer sidebar,
downloader fallback and rTorrent support, rate limiting, indexer test UI,
discovery downloads, and on-demand image publishing. Current package and action
versions supersede the historical dependency PRs. Dependabot now requests only
labels available in this fork, and the README documents the manual image
workflow and where runtime credentials belong. Review feedback was checked
against current source, including replies on several threads that remain marked
unresolved upstream.

This batch passed formatting and YAML parsing checks. No application code changed;
the latest full run remains 4,019 tests passed and 7 skipped. The ledger now has
1,037 unreviewed items, 105 verified, 3 `not-applicable`, one
implemented-but-unverified integration, and one item still needing
implementation. See
[batch 11 evidence](evidence/validation-batch-11.txt).

Public source snapshots redact database connection strings found in support
reports; the collection script applies the same redaction on refresh.

## Follow-up: settings, multi-select, runtime, and dependency requests (#96–111)

PR #96 asked to restore `drizzle-zod` 0.7 after the 0.8.3 type migration failed;
the maintainer then requested a migration instead of a revert. Merged PR #110
now supplies that migration, so #96 is recorded as superseded. The read-only
settings API is protected by the default-deny authentication boundary and omits
the IGDB client ID. Client-only game fields are filtered before API submission,
example directories are excluded from typechecking, and health/readiness probes
remain available. Dependency PRs #104–108 are satisfied by newer locked package
versions and pinned checkout actions.

The Torznab category multi-select request (#102) was already implemented, but
reviewing its accessibility behavior exposed nested buttons: each category's
remove button lived inside the popover trigger button. The trigger now reports
the selection count and removable category badges sit outside it. A component
test verifies removal does not open the trigger, and the running indexer dialog
was checked in a browser. The [multi-select screenshot](../pr-evidence/upstream-torznab-multiselect.png)
is ready to attach to the eventual upstream PR description.

Issue #109 and PR #111 cover Replit cleanup and working development/production
builds. No Replit runtime artifacts remain. Development mode was exercised via
`npm run dev:test`; the production build and server start passed, and the
`/api/health`, `/login`, and nested `/activity/imports` routes returned HTTP 200. PR #103's downloader error response and notifications were verified in the
current route and client consumers. PR #101's PostCSS fix and PR #110's
`drizzle-zod` migration also pass the current build and typecheck.
The three records flagged by source digest (#237, #245, and #260) were also
rechecked. #237's last comment uses `localhost` for PostgreSQL inside the app
container, a hostname configuration issue also explained in #260; its original
nanoid and first-start migration problems are fixed.

Batch 12 passed the full suite (**4,020 passed, 7 skipped**), typecheck, lint,
format check, and production build. The browser test used a stubbed category
response; it did not contact a live indexer. The ledger now has **120 verified**,
**1 superseded**, **1,021 unreviewed**, **3 not-applicable**, **1
implemented-but-unverified**, and **1 needs-implementation** record. Issue #37
still needs shared Zod validation across every POST/PATCH route. See
[batch 12 evidence](evidence/validation-batch-12.txt).

## Follow-up: discovery, logging, downloads, and downloader requests (#112–125)

All fourteen PRs in this range were reviewed against their descriptions and
available discussion/review feedback. The nominal workflow and discovery
carousel requests are already supported; aggregated indexer search, typed Zod
configuration, bounded IGDB search, qBittorrent/rTorrent support, downloader
priority explanations, and download detail views are present. The abandoned
minimal qBittorrent PR #123 is superseded by #119. Dependency PRs #124–125 are
satisfied by newer locked versions.

Review found two implementation gaps. Several logging paths covered by PR #114
still used `console`, and unsafe bundle URLs were written into the warning; all
now use structured Pino logging without echoing the URL. PR #121's requested
unique genre, platform, and wishlist counts were missing from the current Stats
page; those cards are now present and tested. PR #122's rTorrent tracker query
requested five fields but interpreted ten, which made tracker state/error
reporting inaccurate. The matching XML-RPC fields are now requested and mapped,
with a fallback for older servers. The [running Stats page screenshot](../pr-evidence/upstream-global-library-stats.png)
is ready to include in the eventual upstream PR description.

Batch 13 passed the full suite (**4,022 passed, 7 skipped**), typecheck, lint,
format check, and production build. The Stats page was opened through
`npm run dev:test` in a headless browser; game/config responses were stubbed for
repeatable screenshot data. The refreshed upstream snapshot still contains
1,147 items. The ledger now has **133 verified**, **2 superseded**, **1,007
unreviewed**, **3 not-applicable**, **1 implemented-but-unverified**, and **1
needs-implementation** record. Issue #37 remains the outstanding implementation
item. See [batch 13 evidence](evidence/validation-batch-13.txt).

## Follow-up: dependencies, accessibility, and download feedback (#126–140)

All fifteen items in this range were reviewed against their PR descriptions,
changed files, discussion, and review records. The PRs have no submitted code
reviews. PR #128 says its dependency was already current; Dependabot closed
#134 and #139 because those grouped packages were updatable another way. Their
requested versions are now met or exceeded in the manifest and lockfile. Issue
#129 has no description and only a one-word comment, so it does not specify a
product change. Closed PR #138 asked for the same search tooltip later merged
with an accessible label in PR #140.

The memoization requests (#130, #132, #135, and #137) are present in the current
GameCard, library callback, DiscoverPage callbacks, and carousel section. The
historical SearchBar from #131 has since been replaced by PageToolbar and the
library filters, whose search, clear, filter-toggle, and remove-filter controls
have accessible names.

Two gaps needed code changes. PR #133's download dialog only disabled the
selected release button and showed no visible progress text. It now shows a
spinner and “Downloading...” on the active result, announces the state, and
disables all other direct-download buttons until the request settles. PR #136's
label had been attached to a generic clickable card. The game title is now a
real keyboard-focusable details button. Browser verification also exposed
portal clicks reopening the details dialog over the download dialog; the card
now ignores clicks from nested controls and its React portals. The screenshots
of both running states are ready for the eventual upstream PR description:
[download progress](../pr-evidence/upstream-download-pending-feedback.png) and
[keyboard-accessible details](../pr-evidence/upstream-view-details-accessible.png).

Batch 14 passed the full suite (**4,025 passed, 7 skipped**), typecheck, lint,
format check, and production build. `npm run dev:test` was exercised with
stubbed catalog, search, indexer, downloader, and in-flight download responses;
no real indexer or downloader was contacted. The refreshed inventory still has
1,147 items (705 merged PRs, 208 closed unmerged PRs, and 2 open PRs). PRs #1172
and #1186 merged during the refresh; their final source states were rechecked
and remain satisfied by the fork's release behavior and security fixes. The
ledger now has **146 verified**, **3 superseded**, **992
unreviewed**, **4 not-applicable**, **1 implemented-but-unverified**, and **1
needs-implementation** record. Issue #37 remains the outstanding
implementation item. See [batch 14 evidence](evidence/validation-batch-14.txt).

## Upstream main reconciliation — October 12, 2026

Upstream main through `ad69b8ca` is reconciled into the resolution branch. The
integration retains QuestarrNG's 1.10.0 version, image and repository identity,
security hardening, and SeerrNG/Real-Debrid behavior. Upstream's release guide,
browser evidence, and real-stack coverage were incorporated; the library-import
guide is now in the fork's documentation navigation.

The upstream migration `0044_backfill_insecure_lan` was excluded. QuestarrNG
already uses migration number 0044 for game and library fields, and backfilling
every existing HTTP connection to enabled would regrant permission even when a
user had explicitly revoked it. The real-stack upgrade fixture now begins after
the HTTP opt-in fields are introduced and verifies that both HTTP and HTTPS
permissions stay disabled through the remaining fork migrations.

Validation: 4,025 tests passed and seven skipped; typecheck, lint, formatting,
and production build passed. The real migration runner applied migrations 0035
through 0050 to the persisted fixture, and all four seeded permission values
remained `false`. `npm run test:stack` could not start locally because
`qbittorrent-nox` is not installed; the updated CI stack workflow installs the
required download clients. See
[reconciliation evidence](evidence/validation-upstream-main-reconcile.txt).

## Follow-up: carousel performance and accessibility (#141–147)

Discover now memoizes each carousel's query key by its own filters. Stable
mutation callbacks keep unrelated sections from rerendering when a genre or
platform changes. A regression test confirms that changing the genre leaves the
Popular Games key and callbacks untouched. PR #142's Dashboard handlers are
superseded by the fork's separate-page layout and PageToolbar.

Carousel refreshes keep their spinner and dimmed stale results, announce
“Updating [section]…” to assistive technology, and make the stale carousel
inert while it is hidden. A headless browser drove the running app through a
delayed refresh; the screenshot shows the live state:
[carousel refresh](../pr-evidence/upstream-carousel-refresh-accessibility.png).
GameCard cover images already load lazily, `/api/config` omits database
connection details, and Discover genre/platform filters already debounce by
300 ms.

The full suite passed with **4,027 tests and 7 skips**. The focused carousel
tests also passed after the final accessibility markup change. TypeScript,
lint, format check, and production build passed; Vite still reports its existing
large-chunk advisory. Upstream inventory remains at 1,147 records with no
source changes since review. The ledger now has **152 verified**, **4
superseded**, **985 unreviewed**, **4 not-applicable**, **1
implemented-but-unverified**, and **1 needs-implementation** record. Issue #37
remains the outstanding implementation item. See
[batch 15 evidence](evidence/validation-batch-15.txt).

## Follow-up: Discover title sync and upstream PRs #148–154

Genre and platform carousel headings now follow the same debounced values as
their query keys. During the debounce the old title stays with the old results;
once the new query begins, its heading appears with the matching cache or
loading skeleton. A headless browser captured the running transition:
[filter title sync](../pr-evidence/upstream-discover-filter-title-sync.png).

The rest of this PR group is covered by the existing opacity transition,
conditional lazy modal mounting in GameCard, the hardened `/api/config`
response, PageToolbar's labeled search and clear action, and the shared
`useDebounce` hook. The refreshed ledger now records **159 verified**, **4
superseded**, **978 unreviewed**, **4 not-applicable**, **1
implemented-but-unverified**, and **1 needs-implementation** record. Issue #37
remains the outstanding implementation item. See
[batch 16 evidence](evidence/validation-batch-16.txt).

## Follow-up: config, search, health, cache, and tooltip PRs #155–161

Settings no longer shows database connection state or a connection URL, and its
initial load has explicit success and error outcomes. Search already uses the
shared 500 ms debounce hook. The health endpoints expose only a generic status,
and the IGDB client reuses successful responses within their TTL. The separate
Dashboard refactor in #156 has no target in QuestarrNG's current page layout;
#158 was closed unmerged after newer dependency updates became available, and
the fork's current package versions are newer than that PR's requests.

GameCard's rating and release-date tooltips were present but skipped by keyboard
focus. Their triggers are now focusable with a visible focus ring. A keyboard
interaction in the running app captured the tooltip:
[GameCard metadata tooltip](../pr-evidence/upstream-gamecard-metadata-tooltips.png).

All 4,030 tests passed, with 7 skipped; typecheck, lint, format check, and the
production build passed. Vite continues to report its existing large-chunk
advisory. The ledger now records **164 verified**, **6 superseded**, **971
unreviewed**, **4 not-applicable**, **1 implemented-but-unverified**, and **1
needs-implementation** record. Issue #37 remains the outstanding
implementation item. See [batch 17 evidence](evidence/validation-batch-17.txt).

## Follow-up: upstream PRs #162–168

Health checks now have regression coverage for generic liveness/readiness
responses and readiness failures. The fork already has the compatible Zod 4
dependency pair and inferred insert types, Tailwind 4 sidebar rail selectors,
and accessible labels on the header controls. Added tests also lock in
whitespace-insensitive IGDB cache hits, the carousel empty state, and traversal
rejection for downloader and torrent paths.

All 4,034 tests passed, with 7 skipped; typecheck, lint, format check, and the
production build passed. Vite continues to report its existing large-chunk
advisory. The refreshed ledger records **171 verified**, **6 superseded**,
**964 unreviewed**, **4 not-applicable**, **1 implemented-but-unverified**, and
**1 needs-implementation** record. Issue #37 remains the outstanding
implementation item. See [batch 18 evidence](evidence/validation-batch-18.txt).

## Follow-up: upstream PRs #169–175

Genre and platform query conditions now have regression coverage for
order-independent cache keys. Discover already shows loading spinners in both
filter dropdowns, and the carousel navigation tooltips now have direct test
coverage. IGDB game searches cache processed results by query, limit, and local
filters: successful results last 15 minutes and empty results last 5 minutes.

Per-download path overrides must be relative and cannot contain parent
segments, with the same guard in the API validator and the Transmission and
rTorrent clients. Configured downloader roots remain allowed to be absolute.
The Search dialog now tells users to enter a relative path or leave the field
blank to use the configured default. The live dialog was captured here:
[download path guidance](../pr-evidence/upstream-relative-download-path-guidance.png).

PR #171 was closed as a duplicate of the earlier path-traversal work. The
other PRs in this group have no submitted code reviews or actionable comments;
their requested behavior is present in the fork or covered by this batch.
All 4,050 tests passed, with 7 skipped. Typecheck, lint, format check, and the
production build passed; Vite continues to report its existing large-chunk
advisory. The ledger now records **178 verified**, **6 superseded**, **957
unreviewed**, **4 not-applicable**, **1 implemented-but-unverified**, and **1
needs-implementation** record. Issue #37 remains outstanding. See
[batch 19 evidence](evidence/validation-batch-19.txt).

## Follow-up: upstream PRs #176–182

No application changes were needed for this group. The disabled-carousel
navigation tooltip (#176), IGDB search-result cache (#178), sidebar-trigger
tooltip (#179), and background refresh feedback in the Library grid (#182) are
already present and covered by tests. The traversal proposals (#177 and #181)
are duplicates of the protections recorded in batch 19; #177 has no file diff,
and the maintainer explicitly called #181 a duplicate. The old development
dependency group bump (#180) was closed as no longer needed, and the fork
already declares newer versions.

Focused tests passed: 3 carousel tests and 5 GameGrid tests. There were no
additional actionable review comments; the remaining comments were generic
Jules greetings. The ledger now records **182 verified**, **9 superseded**,
**950 unreviewed**, **4 not-applicable**, **1 implemented-but-unverified**, and
**1 needs-implementation** record. Issue #37 remains outstanding. See
[batch 20 evidence](evidence/validation-batch-20.txt).

## Follow-up: upstream PRs #183–187 and issues #188–189

PR #183's extra carousel-title state is not present in the fork: the title is a
prop and `GameCarouselSection` is memoized. PR #184's SSRF concern is covered by
the shared `safeFetch` layer, which validates all resolved addresses, pins the
connection to the validated address, and revalidates redirects. The fork keeps
private LAN downloader hosts available for self-hosted installations while
blocking metadata, link-local, and unspecified targets. PR #185's Download
icon already has a tooltip; View Details is a visible text button. PR #186's
search notifications remember the last query in a ref, so that bookkeeping
adds no state update. PR #187 duplicates the path protections reviewed in
batch 19.

Issue #188 is covered by the routed Library page and live Library, Wishlist,
and Downloads badges. For #189, Calendar and Wishlist moved under a collapsed
“More” group; those routes remain accessible, and the group opens when either
route is active. Trending is not a standalone page or navigation item in the
fork; trending mods are shown in game details. Live screenshots show the
collapsed and expanded navigation states:
[collapsed](../pr-evidence/upstream-low-priority-pages-collapsed.png) ·
[expanded](../pr-evidence/upstream-low-priority-pages-expanded.png).

Focused validation passed: 15 test files and 244 tests, including sidebar,
carousel, GameCard, search notifications, downloader SSRF, and downloader
client coverage. Typecheck, lint, formatting, and production build passed. Vite
continues to report its existing large-chunk advisory. The ledger now records
**188 verified**, **10 superseded**, **943 unreviewed**, **4 not-applicable**,
**1 implemented-but-unverified**, and **1 needs-implementation** record. Issue
#37 remains outstanding. See [batch 21 evidence](evidence/validation-batch-21.txt).

## Follow-up: downloader and query refinements (#190–196)

PR [#190](https://github.com/Doezer/Questarr/pull/190) is superseded by newer
versions of all nine proposed development dependencies already declared and
locked in QuestarrNG. Issue [#191](https://github.com/Doezer/Questarr/issues/191)
is verified: Prowlarr indexer sync, Torznab/Newznab mapping, diagnostics, saved
sync settings, and feed integration are present, with explicit consent required
for insecure LAN HTTP. PR [#192](https://github.com/Doezer/Questarr/pull/192) is
not applicable as written because TanStack Query v5 removed per-query `onError`
callbacks; Discover keeps its supported error handling. PR #193 duplicates the
verified GameCard tooltip work from PR #185, and PR #194 is covered by the
verified path-traversal protections from PRs #171, #174, #177, #181, and #187.

Issue [#195](https://github.com/Doezer/Questarr/issues/195) is verified: the
Downloads API filters each downloader’s results to its configured category,
case-insensitively, and excludes uncategorized entries while filtering. Issue
[#196](https://github.com/Doezer/Questarr/issues/196) is also verified: each
GameDownloadDialog result offers a Copy Torrent Link action, tested against the
actual result URL. Five focused suites passed (122 tests, one skipped); see
[batch 22 evidence](evidence/validation-batch-22.txt).

The ledger now records 192 verified, 12 superseded, 936 unreviewed,
5 not-applicable, 1 implemented-but-unverified, and 1 needs-implementation
records. Issue #37 remains outstanding.

## Follow-up: discovery, library, theme and smart-add items (#198–207)

Issues [#198](https://github.com/Doezer/Questarr/issues/198),
[#199](https://github.com/Doezer/Questarr/issues/199),
[#201](https://github.com/Doezer/Questarr/issues/201),
[#202](https://github.com/Doezer/Questarr/issues/202), and
[#203](https://github.com/Doezer/Questarr/issues/203) are verified against the
current app. Discover hides are persisted; the final #199 commits explicitly
choose Adventure despite the stale Action title; GameCards have no Launch
control; the root Library has working filters; and the theme toggle changes the
page styling. The workflow-permissions commit later linked to #203 does not
implement the theme behavior.

Issue [#205](https://github.com/Doezer/Questarr/issues/205) is implemented. When
the user picks a main release, the add-on dialog keeps updates selected by
default and offers extras up to 25% of the main release size as unchecked
suggestions. Larger extras and results with unknown sizes are left out. The
dialog shows item sizes, supports combining selected updates and extras, and
keeps a clear main-game-only action. The 25% cutoff is our conservative reading
of “a lot smaller,” chosen to make the suggestion predictable and transparent.
The [release-selection guide](../DOWNLOAD_RECOMMENDATIONS.md) documents the
exact size checks, default selections, and user choices.

PR [#207](https://github.com/Doezer/Questarr/pull/207) is superseded: all nine
dependency updates in that PR are older than the versions declared and locked
in the fork.

Seven focused UI suites passed (76 tests, one skipped). TypeScript checking and
format checking passed. Headless-browser verification covered the theme class
and computed background change, and the smart-add flow was captured from
`npm run dev:test` with representative search results in
[desktop](../pr-evidence/upstream-smart-add.png) and
[mobile](../pr-evidence/upstream-smart-add-mobile.png) screenshots.
See [batch 23 validation](evidence/validation-batch-23.txt).

The ledger now records **198 verified**, **13 superseded**, **929 unreviewed**,
**5 not-applicable**, **1 implemented-unverified**, and **1 needs-implementation**.
Issue #37 remains outstanding.

## Follow-up: search, calendar, and download items (#208–225)

Issues [#208](https://github.com/Doezer/Questarr/issues/208) and [#209](https://github.com/Doezer/Questarr/issues/209) are verified: download results remain scrollable on desktop and mobile, and extended search supports the query and filtering controls requested. Issue [#210](https://github.com/Doezer/Questarr/issues/210) now has bug, feature, and question templates; #211 and #215 are covered by the existing README, license, contribution guide, and docs.

Issues [#212](https://github.com/Doezer/Questarr/issues/212), [#214](https://github.com/Doezer/Questarr/issues/214), and [#222](https://github.com/Doezer/Questarr/issues/222) are verified against the current calendar, wishlist, and details layouts. Issue [#213](https://github.com/Doezer/Questarr/issues/213) is superseded: upstream later removed the Trending page and its navigation. Issue [#216](https://github.com/Doezer/Questarr/issues/216) marks a game owned when its main download completes.

Issue [#217](https://github.com/Doezer/Questarr/issues/217) now has a visible direct torrent/NZB file action separate from adding a release to a downloader. The action is limited to safe file URLs, preserves the update-selection step, and release titles wrap cleanly on mobile. Running-app screenshots show the desktop result list, update choice, and mobile layout in [desktop](../pr-evidence/upstream-direct-download.png), [update-choice](../pr-evidence/upstream-direct-download-bundle.png), and [mobile](../pr-evidence/upstream-direct-download-mobile.png) views. Issue [#219](https://github.com/Doezer/Questarr/issues/219) recognizes IGDB’s explicit delayed status with date-shift fallback and notifications. Issues [#220](https://github.com/Doezer/Questarr/issues/220) and [#221](https://github.com/Doezer/Questarr/issues/221) are covered by header storage reporting and configurable scheduled searches.

PR [#223](https://github.com/Doezer/Questarr/pull/223) is superseded by the fork’s current npm tooling and existing dependency, mock, documentation, and template state. PRs [#224](https://github.com/Doezer/Questarr/pull/224) and [#225](https://github.com/Doezer/Questarr/pull/225) are verified: notification actions have accessible names, and metadata refresh batches IGDB requests and database writes.

The focused GameDownloadDialog suite passed (46 tests, 1 skipped); type checking, lint, and format checks passed. Headless-browser evidence was captured from `npm run dev:test`. See [batch 24 validation](evidence/validation-batch-24.txt).

The ledger now records **213 verified**, **15 superseded**, **912 unreviewed**, **5 not-applicable**, **1 implemented-unverified**, and **1 needs-implementation** records. Issue #37 remains outstanding.

## Follow-up: repository hardening, Usenet, and version tracking (#226–233)

PRs [#226](https://github.com/Doezer/Questarr/pull/226) and [#227](https://github.com/Doezer/Questarr/pull/227) are superseded by the current npm toolchain, passing checks, and existing contribution/operations guidance and PR template. The checked repository docs and local memory files contain no stale pnpm policy.

Issue [#228](https://github.com/Doezer/Questarr/issues/228) and merged PR [#233](https://github.com/Doezer/Questarr/pull/233) are verified: Prowlarr sync and Newznab search accept Usenet indexers, results retain NZB metadata, and only SABnzbd/NZBGet are used for Usenet downloads. Issue [#230](https://github.com/Doezer/Questarr/issues/230) is also verified. Installed versions can be entered directly or learned from completed game/edition releases; scheduled searches ignore versions already installed. Version and target-platform selection are scoped to each library entry.

Ten focused Usenet and version-tracking suites passed (285 tests). See [batch 25 validation](evidence/validation-batch-25.txt).

The ledger now records **216 verified**, **17 superseded**, **907 unreviewed**, **5 not-applicable**, **1 implemented-unverified**, and **1 needs-implementation** records. Issue #37 remains outstanding.

## Follow-up: startup, qBittorrent, search and accessibility (#239–244)

PR [#239](https://github.com/Doezer/Questarr/pull/239) is superseded by the fork’s current startup design: the app uses its own SQLite/PostgreSQL migration runners and existing structured logger, so production startup does not need to ship or invoke `drizzle-kit`. Issues [#240](https://github.com/Doezer/Questarr/issues/240) and [#241](https://github.com/Doezer/Questarr/issues/241) are verified: the container starts the compiled app, which applies migrations itself, and the logger import and production TypeScript build pass.

Issue [#242](https://github.com/Doezer/Questarr/issues/242) is verified against the qBittorrent VPN fix later delivered in [PR #276](https://github.com/Doezer/Questarr/pull/276). When qBittorrent cannot fetch an indexer URL through its VPN network, the client can fetch the torrent file and upload it to qBittorrent. If the add is accepted but the torrent cannot be confirmed yet, Questarr keeps its correlation tag and shows a “Checking qBittorrent” message that asks users to check the client before retrying. The free-space lookup also falls back to qBittorrent server-state data. A headless screenshot of the running pending-confirmation state is in [PR evidence](../pr-evidence/upstream-qbittorrent-pending.png).

PR [#243](https://github.com/Doezer/Questarr/pull/243) is verified: IGDB fallback searches run concurrently, with regexes compiled once and the five-request cap preserved. PR [#244](https://github.com/Doezer/Questarr/pull/244) is verified: notification rows are semantic buttons with native keyboard activation and an explicit button type.

Ten focused test suites passed (211 tests, one skipped). Type checking, lint, formatting, and the production Vite/TypeScript builds passed. See [batch 26 validation](evidence/validation-batch-26.txt).

The ledger now records **221 verified**, **18 superseded**, **901 unreviewed**, **5 not-applicable**, **1 implemented-unverified**, and **1 needs-implementation** records. Issue #37 remains outstanding.

## Follow-up: build, downloader concurrency, accessibility and operations (#246–251)

Issue [#246](https://github.com/Doezer/Questarr/issues/246) is verified. Its `cron.ts` type errors match the follow-up reported in #241 and are absent from the current production build. The reporter later confirmed that updating Node/npm fixed installation; the fork requires Node 22.19 or newer. The database connection error mentioned when closing #246 was the separate report tracked in #260.

PR [#247](https://github.com/Doezer/Questarr/pull/247) is verified: download and free-space lookups use parallel downloader requests, while per-client failures leave other results available. PR [#248](https://github.com/Doezer/Questarr/pull/248) is verified: Calendar navigation and Discover settings have descriptive accessible names, now checked through role-based page tests.

PR [#249](https://github.com/Doezer/Questarr/pull/249) is verified. The old type mismatch is fixed in the current code; the maintained contribution guide and PR template replace its generic templates, and [the operations guide](../OPERATIONS.md) now explains health checks, logs, and safe SQLite/Postgres backup and recovery. Its placeholder task list is replaced by this per-item ledger.

PR [#250](https://github.com/Doezer/Questarr/pull/250) is superseded: the workflows use the pinned step-security build/push action rather than the old upstream action. PR [#251](https://github.com/Doezer/Questarr/pull/251) is superseded by the pinned metadata-action v6.2.0, above the requested v5.10.0.

Four focused suites passed (386 tests), including the downloader routes and rendered accessibility names. TypeScript checking passed; the production build was also verified in [batch 26](evidence/validation-batch-26.txt). See [batch 27 validation](evidence/validation-batch-27.txt).

The ledger now records **225 verified**, **20 superseded**, **895 unreviewed**, **5 not-applicable**, **1 implemented-unverified**, and **1 needs-implementation** records. Issue #37 remains outstanding.

## Follow-up: dependency update PRs (#252–259)

All eight requests are superseded by versions already in the fork. Current
workflow pins use step-security registry-login and Buildx wrappers, and the
checkout SHA matches upstream v7.0.1. I corrected stale workflow comments that
called that SHA v6.2.0. The package manifest and lockfile exceed the requested
versions of react-hook-form, fast-xml-parser, TanStack Query, Drizzle ORM, and
Recharts. No older action or package-lock changes need to be replayed.

The manifest, lockfile, and workflow pins were checked directly; no application
code changed in this batch. See [batch 28 evidence](evidence/validation-batch-28.txt).

## Follow-up: database, Usenet, downloader setup and hardening (#261–266)

Issue [#261](https://github.com/Doezer/Questarr/issues/261) is verified: the
reporter confirmed a no-cache Compose rebuild reached the initial setup screen.
The current fork also has documented SQLite/Postgres startup configuration and
more actionable Postgres connection diagnostics.

Issue [#262](https://github.com/Doezer/Questarr/issues/262) is verified: the
reporter tested the fix and closed the report after NZB submission worked. The
current download validator accepts NZB URLs, search preserves the Usenet type,
and downloader selection sends those results to SABnzbd or NZBGet.

PR [#263](https://github.com/Doezer/Questarr/pull/263) is verified: downloader
forms use a consistent Host field with separate Port and TLS controls, defaults
that follow the selected client, and client-specific setup guidance. PR
[#264](https://github.com/Doezer/Questarr/pull/264) is verified through the
fork-adapted sidebar link and version check, which point at QuestarrNG and its
releases. PR [#265](https://github.com/Doezer/Questarr/pull/265) is verified:
route pages load lazily under a shared loading fallback, and the production
build emits distinct page chunks. PR
[#266](https://github.com/Doezer/Questarr/pull/266) is verified: Helmet applies
security headers with the app's tailored CSP, while the optional Postgres pool
has a configurable size, bounded connection/query waits, and idle-client error
handling.

Eight focused suites passed (461 tests), and TypeScript checking passed. A
production Vite build emitted separate route chunks; it also reports large
shared chunks (the entry chunk is about 865 KB), so the build confirms route
splitting without claiming a measured initial-load reduction. See
[batch 29 evidence](evidence/validation-batch-29.txt).

The ledger now records **231 verified**, **28 superseded**, **881 unreviewed**,
**5 not-applicable**, **1 implemented-unverified**, and **1 needs-implementation** records. Issue #37 remains outstanding.

## Follow-up: bundle security, indexers, accessibility and ROM support (#267–273)

PR [#267](https://github.com/Doezer/Questarr/pull/267) is verified with a
stronger bundle-specific SSRF boundary. The shared URL checker allows private
addresses for configured self-hosted integrations, so it was too permissive for
arbitrary bundle links. The ZIP endpoint now allows public downloads plus exact
configured indexer origins, and `safeFetch` checks every redirect under that
policy. The SSRF protections and LAN Prowlarr exception are covered by tests and
documented in the [threat model](../THREAT_MODEL.md) and
[security assessment](../SECURITY_ASSESSMENT.md).

PR [#268](https://github.com/Doezer/Questarr/pull/268) is verified: the
carousel refresh button has the accessible name “Refresh games,” now asserted
through its button role. Issue [#269](https://github.com/Doezer/Questarr/issues/269)
is verified: Discover downloads create or reuse the library game first, so the
request uses a UUID instead of a temporary `igdb-*` ID.

Issue [#270](https://github.com/Doezer/Questarr/issues/270) is verified: local
Prowlarr URLs pass indexer validation, category choices survive syncs, and
Newznab search applies the saved category filter. Issue
[#271](https://github.com/Doezer/Questarr/issues/271) is verified against the
fork's retro workflow: optional RAWG discovery, console-to-RomM platform
mappings, and reviewed ROM imports into RomM folders. PR
[#272](https://github.com/Doezer/Questarr/pull/272) is verified: bundle files
are fetched in parallel with a limit of five and individual failures do not
abort the ZIP. PR [#273](https://github.com/Doezer/Questarr/pull/273) is
superseded by the stricter #267 implementation: its duplicate `isSafeUrl`
check still inherited the self-hosted private-network allowance.

Twelve focused suites passed (322 tests, one skipped; 323 total), TypeScript checking and
server lint passed, and Prettier passed for the changed source files. The new
security release note validates. See [batch 30 evidence](evidence/validation-batch-30.txt).

The ledger now records **237 verified**, **29 superseded**, **874 unreviewed**,
**5 not-applicable**, **1 implemented-unverified**, and **1 needs-implementation** records. Issue #37 remains outstanding.

## Follow-up: storage caching, qBittorrent, and repository hardening (#274–279)

PR [#274](https://github.com/Doezer/Questarr/pull/274) is verified: the
storage endpoint fetches enabled downloaders concurrently and reuses its
in-memory result for 30 seconds. Individual downloader failures remain
isolated in the response. Issue
[#275](https://github.com/Doezer/Questarr/issues/275) is `not-applicable`:
the reporter later found that their Prowlarr configuration excluded `.rar`
results, then apologized for the false alarm; Questarr did not need a code
change.

PR [#276](https://github.com/Doezer/Questarr/pull/276) is verified against the
qBittorrent client and regression suites: it can fetch a torrent file itself
and upload it when qBittorrent is behind a VPN, exposes download details, and
maps current client status into the downloads view. PRs
[#277](https://github.com/Doezer/Questarr/pull/277) and
[#279](https://github.com/Doezer/Questarr/pull/279) are verified: action
buttons now default to `type="button"`, explicit form submits still work, and
the storage cache has a concrete TypeScript shape. The fork's
[operations guide](../OPERATIONS.md), contributor guide, and this per-item
ledger provide the operational and task-tracking guidance requested by the
closed PRs. Running-browser evidence for the form behavior is in
[PR evidence](../pr-evidence/upstream-button-form-safety.png).

Issue [#278](https://github.com/Doezer/Questarr/issues/278) is
`not-applicable`: the maintainer found no schema change in the reported v1.0.1
release, and the reporter confirmed that recreating their stale local database
volume restored login. The current Postgres baseline declares the user settings
columns used by the app; no reproducible migration defect was reported after
the volume reset.

The API-route and Button suites passed (372 tests), as did four focused
qBittorrent suites (61 tests). TypeScript, changed-file ESLint, Prettier, and
the production client build passed, as did the `npm run dev:test` browser
interaction. See [batch 31 evidence](evidence/validation-batch-31.txt).

The ledger now records **241 verified**, **29 superseded**, **868 unreviewed**,
**7 not-applicable**, **1 implemented-unverified**, and **1 needs-implementation**
records. Issue #37 remains outstanding.

## Follow-up: downloader/indexer behavior, Steam wishlist and hardening (#280–285)

PR [#280](https://github.com/Doezer/Questarr/pull/280) is verified: HTTP(S)
indexer URLs work for localhost and private/internal hosts, logger defaults
remain environment-appropriate, and downloader validation reflects the
integrations the fork actually supports. Regression tests retain Deluge support
while rejecting unsupported uTorrent and Vuze types. The fork also has the
link button variant from this PR.

PR [#281](https://github.com/Doezer/Questarr/pull/281) is verified: indexers
and downloaders sort enabled-first by priority and name, disabled cards are
visually muted, and the downloader name prompt follows the selected type. PR
[#282](https://github.com/Doezer/Questarr/pull/282) is verified: qBittorrent
free-space lookup falls back from `app/free_space` to `sync/maindata` and then
`transfer/info`, with invalid responses handled safely.

PR [#283](https://github.com/Doezer/Questarr/pull/283) is verified against the
fork’s GitHub-recognized contributor and PR guidance, maintained operations
guide, upstream ledger, and current type/lint/build checks; its generic version
bump was not applied to the fork. Issue
[#284](https://github.com/Doezer/Questarr/issues/284) is verified: users can
manually or automatically sync their Steam wishlist, and matched games enter
their QuestarrNG wishlist as wanted games. PR
[#285](https://github.com/Doezer/Questarr/pull/285) is verified: torrent and
Usenet search results retain and display their source indexer name, which also
drives filtering and priority ordering.

Twelve focused suites passed (290 tests, one skipped). TypeScript, lint,
Prettier, and the production client/server build passed. The production build
continues to report its existing large-chunk advisory. See
[batch 32 evidence](evidence/validation-batch-32.txt).

The ledger now records **247 verified**, **29 superseded**, **862 unreviewed**,
**7 not-applicable**, **1 implemented-unverified**, and **1 needs-implementation**
records. Issue #37 remains outstanding.

## Follow-up: container installs, xREL, settings recovery and download sources (#286–291)

Issue [#286](https://github.com/Doezer/Questarr/issues/286) is verified: the
default Compose file pulls the published multi-architecture GHCR image, and the
installation docs explain the stable, testing and pinned-version tags. Issue
[#287](https://github.com/Doezer/Questarr/issues/287) is verified against the
existing xREL API client, release page, settings and scheduled notifications.

Issue [#288](https://github.com/Doezer/Questarr/issues/288) is verified: the
Settings error now explains that migrations run at startup, gives the source
install command only where it applies, stops automatic retry loops, and offers
a **Try again** action. The running app showed the alert after one failed
settings request; the action recovered when the endpoint became available.
See [browser evidence](../pr-evidence/upstream-settings-db-migration-help.png).
PR [#289](https://github.com/Doezer/Questarr/pull/289) is verified: results
link to their source page when it is available, with unsafe URL schemes
excluded. PR [#290](https://github.com/Doezer/Questarr/pull/290) is verified:
the download dialog’s indexer filter now has a regression test that selects an
indexer and checks the matching results.

Issue [#291](https://github.com/Doezer/Questarr/issues/291) is verified: main
builds publish as `dev`, versioned releases publish as both `latest` and the
exact semantic version, and commit-SHA tags remain immutable. The default
Compose file pulls the registry image, while the README and quick start explain
how to update it. The linked release-pattern request #305 remains tracked for
its own per-item review. See [batch 33 evidence](evidence/validation-batch-33.txt).

Six focused suites passed (96 tests, one skipped). TypeScript, lint, Prettier,
the production client/server build, and Docker Compose validation passed. The
build retains its existing large-chunk advisory. The ledger now records
**253 verified**, **29 superseded**, **856 unreviewed**, **7 not-applicable**,
**1 implemented-unverified**, and **1 needs-implementation** records. Issue
#37 remains outstanding.

## Follow-up: hardening, G4U, download rules and release titles (#292–305)

PRs [#292](https://github.com/Doezer/Questarr/pull/292) and
[#295](https://github.com/Doezer/Questarr/pull/295) are verified against the
fork's stronger lint, type-safety, and operations baseline. Contributor and PR
templates, an operations guide, and this per-item ledger cover the requested
maintenance artifacts. Postgres uses a configurable bounded pool (default 10,
minimum 2), five-second connection and statement timeouts, and explicit pool
shutdown; this retains operator control instead of hardcoding a 20-connection
pool.

Issue [#293](https://github.com/Doezer/Questarr/issues/293) is verified: G4U
VIP API support is implemented, and multi-word game titles are converted to the
dot-separated query format G4U expects. Issue
[#294](https://github.com/Doezer/Questarr/issues/294) is verified: desktop
titles already use the available row width, and long titles now wrap fully on
mobile instead of being clipped. Safe source-page links are covered by PR #289.
See [mobile browser evidence](../pr-evidence/upstream-release-name-mobile-full.png).

Dependency PRs [#296](https://github.com/Doezer/Questarr/pull/296),
[#297](https://github.com/Doezer/Questarr/pull/297),
[#298](https://github.com/Doezer/Questarr/pull/298),
[#299](https://github.com/Doezer/Questarr/pull/299), and
[#302](https://github.com/Doezer/Questarr/pull/302) are verified against the
current lockfile, which contains each requested version or a later one. PR
[#300](https://github.com/Doezer/Questarr/pull/300) is superseded: its upstream
build check failed, maintainers described the update as breaking, and the bot
reported the dependency already up to date. This fork uses drizzle-zod 0.8.3
and passes its current checks, so the PR does not require a separate change.
PR [#301](https://github.com/Doezer/Questarr/pull/301)'s download rules are
implemented across settings, manual searches, and scheduled auto-search; a
regression test confirms the selected categories filter scheduled results. PR
[#303](https://github.com/Doezer/Questarr/pull/303)'s contributor list and
collapsible IGDB setup guide are already present in the README.

Issue [#304](https://github.com/Doezer/Questarr/issues/304) is verified: the
current Questarr Discord invite is linked in the README and documentation, and
the invite endpoint confirms it is active. Issue
[#305](https://github.com/Doezer/Questarr/issues/305) is verified with the tag
workflow from batch 33: main builds publish `dev`, while semantic-version
releases publish `latest`, the exact version, and an immutable commit tag.
See [batch 34 validation](evidence/validation-batch-34.txt).

Seven focused suites passed (579 tests, seven skipped). TypeScript, lint,
formatting, the production build, and Compose validation passed. The build
retains its existing large-chunk advisory. The ledger now records **266
verified**, **30 superseded**, **842 unreviewed**, **7 not-applicable**,
**1 implemented-unverified**, and **1 needs-implementation** records. Issue #37
remains outstanding.

## Batch 48 — October 13, 2026

Batch 48 reviewed issues #506, #507, #510, #514, and #515, plus PRs #508, #509,
#511–513, and #516–519, #521, and #522. Issue #506 is fixed by the bounded,
scrollable Radix platform selector in PR #512. Magnet redirects from #507 are
allowed through the downloader handoff without weakening HTTP(S) SSRF checks.
The Wishlist memoizes sorted groups, and the SABnzbd queue-to-history path
checks individual download history before marking a download missing; transient
lookup failures do not count as misses.

Issue #514 exposed a remaining gap: adding a game saved its target platform and
automated searches used it, but manual download search only applied the
account-wide preference. The dialog now uses the game's target first, then the
account default. If that target is excluded by the Platforms setting, the
dialog leaves the filter clear so the user is not shown an empty list. The
[running UI evidence](../pr-evidence/upstream-game-platform-preselection-batch-48.png)
shows a PS5-targeted game filtering to its PS5 release while the account default
is PC. PR #518's multi-platform search filter remains available for manual
adjustments. Issue #515's actions remain reachable because the shared
ScrollArea fixes the Radix viewport's table-layout wrapper.

PR #516's torrent and Usenet result metadata is mapped and displayed. PR #517's
tabbed game details, owner-scoped download history, ratings, and links are
present in both supported storage implementations. PR #519 persists and
displays IGDB early-access status. PR #521's shared PageToolbar is used by
Library, Wishlist, Playing, and Calendar. PR #522 aligns discovery query
freshness with cache headers and rounds time-window query keys. PR #513 is
superseded: the fork now locks newer dependency versions and pins Codecov to
v7.1.1.

The audit suite passed across 25 test files and 1,047 tests (one skipped). After
the #514 fix, four focused client/server suites passed 220 tests (one skipped).
Typecheck, lint, formatting, production build, release-note validation, and
diff checks are recorded in [batch 48 evidence](evidence/validation-batch-48.txt).
The ledger now records **435 verified**, **72 superseded**, **630 unreviewed**,
**8 not-applicable**, **1 implemented-unverified**, and **1 needs-implementation**
item. Issue #37 remains outstanding.

## Batch 49 — October 13, 2026

Batch 49 reviewed PRs #523–534 and #537–538, plus issues [#535](https://github.com/Doezer/Questarr/issues/535)
and [#536](https://github.com/Doezer/Questarr/issues/536). Downloads already had
the Questarr-only source toggle (#523), personal half-step ratings are scoped to
the signed-in user (#530), preferred-platform filtering applies to manual and
automated searches (#531), and search sorting is memoized (#533). PR #532's
tooltip names and carousel boundary roles are present; this batch also preserves
a valid 0/10 score in game cards, Add Game search results, and every details tab.

Issue #535's desktop download-search dialog now uses 96% of the viewport up to
2000px, keeping Date, Size, Health, and Actions readable on wide screens while
remaining viewport-bound on smaller displays. Issue #536 was explicitly
withdrawn by its author. PR #537's HowLongToBeat lookup is implemented with
close-title matching, three completion estimates, a direct game link, and a
search fallback; transient provider failures are not cached. PR #538's
PCGamingWiki lookup and game-details link are present with a title-search
fallback.

Dependency requests #524–526, #528–529, and #534 are superseded by newer locked
versions or a newer SHA-pinned harden-runner action. The full dependency audit
reports zero vulnerabilities. See the [Add Game zero-score screenshot](../pr-evidence/upstream-rating-zero-add-game-batch-49.png),
[game-card screenshot](../pr-evidence/upstream-rating-zero-card-batch-49.png),
[HowLongToBeat details screenshot](../pr-evidence/upstream-hltb-details-batch-49.png),
[wide download-search screenshot](../pr-evidence/upstream-wide-download-search-batch-49.png),
[release note](../../release-notes/2026-10-13-hltb-and-wide-download-search.md),
and [batch 49 validation](evidence/validation-batch-49.txt).

Focused validation passed across 12 test files and 710 tests (one skipped).
Typecheck, lint, formatting, secret scanning, dependency audit, and production
build passed; the build retains its existing large-chunk advisory. The ledger
now records **444 verified**, **78 superseded**, **614 unreviewed**,
**9 not-applicable**, **1 implemented-unverified**, and **1
needs-implementation** item. Issue #37 remains outstanding.

## Follow-up: RomM, IGDB, downloads and hardening (#306–319)

PRs [#306](https://github.com/Doezer/Questarr/pull/306),
[#314](https://github.com/Doezer/Questarr/pull/314), and
[#319](https://github.com/Doezer/Questarr/pull/319) are verified against the
fork's lint, type-check, format, and build gates. The fork has contributor and
operations guidance; its source-bound CI build plan runs those checks. PR #306's
maintainer-requested removal of `TASKS.md` and `PR_TEMPLATE.md` is reflected in
the fork's checked-in artifacts.

PR [#307](https://github.com/Doezer/Questarr/pull/307) is verified: SQLite
migrations use a journal-aware idempotent runner with schema repair, while
Postgres uses Drizzle migrations under an advisory lock. PR
[#308](https://github.com/Doezer/Questarr/pull/308)'s search labels and
keyboard-accessible storage tooltip are present. PR
[#309](https://github.com/Doezer/Questarr/pull/309)'s bundle download validates
URLs and fetches through the SSRF-safe client, allowing only configured private
indexer origins. PRs [#310](https://github.com/Doezer/Questarr/pull/310) and
[#317](https://github.com/Doezer/Questarr/pull/317) are verified: IGDB ID
lookups batch requests in parallel within the configured rate limit, and the
regular request queue spaces other API calls.

Issue [#311](https://github.com/Doezer/Questarr/issues/311)'s ROM-management
request is implemented through RomM platform routing, library imports, and
post-processing. Removing a game with file deletion enabled now also permits
paths strictly inside that user's enabled RomM root, after canonical path
validation. A regression test confirms disabled RomM roots remain protected.
RAR extraction support is installed in the production image and covered by the
archive-import suite. SteamGridDB was mentioned as an optional artwork idea;
this fork continues to use its existing IGDB artwork integration. The linked
implementation PR [#363](https://github.com/Doezer/Questarr/pull/363) remains
scheduled for its separate ledger review. PR
[#312](https://github.com/Doezer/Questarr/pull/312)'s separator is present in
both download layouts. Issue
[#313](https://github.com/Doezer/Questarr/issues/313) is verified against
[#322](https://github.com/Doezer/Questarr/pull/322): qBittorrent detects magnet
redirects and reports actionable download errors.

PR [#315](https://github.com/Doezer/Questarr/pull/315) is verified: initial
setup accepts IGDB credentials when neither the database nor environment is
configured, and existing installations can manage credentials in Settings. PR
[#316](https://github.com/Doezer/Questarr/pull/316) is verified: auto-search
timestamps persist in user settings across restarts. PR
[#318](https://github.com/Doezer/Questarr/pull/318) is verified with a small
follow-up fix: selected categories now filter scheduled results, with DLC and
extras routed into the existing packs/add-ons availability channel. This also
closes the remaining scheduled-category gap shared with PR #301.

See [batch 35 validation](evidence/validation-batch-35.txt) and the release
notes for [RomM file removal](../../release-notes/2026-10-12-romm-library-file-deletion.md)
and [scheduled download categories](../../release-notes/2026-10-12-auto-search-selected-categories.md).

Fifteen backend suites passed (718 tests). The AddGameModal suite passed 15
tests separately, and GameDownloadDialog passed 49 tests (one skipped). The
ledger now records **280 verified**, **30 superseded**, **828 unreviewed**,
**7 not-applicable**, **1 implemented-unverified**, and **1
needs-implementation** records. Issue #37 remains outstanding.

## Batch 36 — October 12, 2026

Batch 36 reviewed [PRs #320–322 and #324, #326–327, #331–333](inventory.md)
and [issues #323, #325, #328–330](inventory.md). The manual-download flow
avoids automatic per-card searches while retaining cached availability. PR #321
is superseded by the sanitized merged #322; the existing qBittorrent redirect
fix also resolves issue #313. Setup, logout, dependency-update, and operational
hardening requests were verified against the current fork.

The current PostgreSQL-to-SQLite migration request (#329, related to PR #327)
now has a complete-schema copy tool. It requires both databases to have current
migrations, refuses a non-empty SQLite target, reads PostgreSQL read-only, and
verifies every copied table in a rollback-safe transaction. The legacy pre-v1.1
migration procedure remains separate. See the [migration guide](../DATABASE.md),
[release note](../../release-notes/2026-10-12-current-postgres-to-sqlite-migration.md),
and [batch 36 validation](evidence/validation-batch-36.txt).

The ledger now records **291 verified**, **33 superseded**, **814 unreviewed**,
**7 not-applicable**, **1 implemented-unverified**, and **1
needs-implementation** records. Issue #37 remains outstanding.

## Batch 37 — October 12, 2026

Batch 37 reviewed [PRs #334–335 and #337–347](inventory.md) and issue [#344](https://github.com/Doezer/Questarr/issues/344); issue #336 was reviewed in batch 5. The dependency requests are already exceeded by the locked versions. Metadata refresh uses 50-game transactions, and the merged IPv6 SSRF protections are present. Issue #344's reporter confirmed that the fresh-install problem cleared after the image was updated.

PR #338 is superseded by the later hardening iterations. PR #342's verification and risk-analysis prompts now live in GitHub's `.github/PULL_REQUEST_TEMPLATE.md`; PR #343's type, lint, and formatting work passes the current gates. The remaining fixed-delay setup test now waits for both field-validation messages. PR #345's shared empty state is now used in the Library, retaining its Add Game flow, providing a direct add action for a no-result search, and letting users clear filters from an empty filtered view. The IGDB rate-limit fallback also uses a module-specific structured logger. See the [release note](../../release-notes/2026-10-12-library-empty-states.md), [visual evidence](../pr-evidence/upstream-library-empty-state-batch-37.png), and [batch 37 validation](evidence/validation-batch-37.txt).

The ledger now records **303 verified**, **34 superseded**, **801 unreviewed**,
**7 not-applicable**, **1 implemented-unverified**, and **1
needs-implementation** records. Issue #37 remains outstanding.

## Batch 38 — October 12, 2026

Batch 38 reviewed [PRs #348–360](inventory.md) and issue [#361](https://github.com/Doezer/Questarr/issues/361). The four dependency updates are exceeded by the versions locked in this fork. The atomic setup and route typing, logout action, production security headers, Prowlarr sync hardening, keyboard focus behavior, RSS feeds, compact lists, and Apprise notifications are present. PR #354's requested 1.1.0 version bump is superseded by the current 1.10.0 release.

The xREL release integration is present and SSRF-hardened. Its game-filtered latest feed now scans until it finds an extra game result before enabling Next, instead of estimating from an unreliable upstream page count. The page shows the current page without a fabricated total. See the [release note](../../release-notes/2026-10-12-xrel-release-pagination.md), [visual evidence](../pr-evidence/upstream-xrel-pagination-batch-38.png), and [batch 38 validation](evidence/validation-batch-38.txt).

The ledger now records **316 verified**, **35 superseded**, **787 unreviewed**,
**7 not-applicable**, **1 implemented-unverified**, and **1
needs-implementation** records. Issue #37 remains outstanding.

## Batch 39 — October 12, 2026

Batch 39 reviewed [PRs #362–370 and #372–374](inventory.md) and [issues #371
and #375](inventory.md). The Steam wishlist workflow uses authenticated manual
SteamID64 linking; the upstream OAuth/session callback was not ported after its
review identified account-linking and secret-management risks. RomM imports,
root-folder scanning, the redesigned download dialog, GameCard labels, and
release-group filtering are present. Dependency targets are exceeded by the
current locked versions, and Prowlarr endpoints use the shared SSRF-safe fetcher.

Metadata refresh now streams IGDB data in bounded request batches while keeping
database writes at 50 games per transaction. A failed chunk is logged, later
chunks continue, and the response counts games that could not be refreshed. See
the [release note](../../release-notes/2026-10-12-metadata-refresh-chunk-resilience.md)
and [batch 39 validation](evidence/validation-batch-39.txt).

The ledger now records **330 verified**, **35 superseded**, **773 unreviewed**,
**7 not-applicable**, **1 implemented-unverified**, and **1
needs-implementation** records. Issue #37 remains outstanding.

## Batch 40 — October 12, 2026

Batch 40 reviewed [issues #376–377](inventory.md), [PRs #378–381](inventory.md),
[issue #382](inventory.md), [PRs #383–387](inventory.md), and [issues #388–391](inventory.md).
Issue #376's personal ratings, journal notes, and shelved lifecycle state were
already present; this batch adds private, per-user custom game lists with
create, rename, delete, and multi-list membership. SQLite and PostgreSQL schemas
match, storage and API operations enforce ownership, and deleting a list removes
only its memberships. The responsive Library page is shown in the
[running UI evidence](../pr-evidence/upstream-custom-lists-batch-40.png).

The dependency targets are exceeded by the current lockfile. HTTP remains
supported unless SSL is configured, fixing issue #382; PR #383's wildcard CORS
and disabled HSTS proposal is superseded by the fork's explicit-origin and
SSL-aware security configuration. The Stats page, DNS-pinned SSRF protection,
server-side status filtering, accessible game actions, ARM64 builds, responsive
card grid, health sorting, and release-group filtering were verified. See the
[personal lists release note](../../release-notes/2026-10-12-personal-game-lists.md)
and [batch 40 validation](evidence/validation-batch-40.txt).

The ledger now records **345 verified**, **36 superseded**, **757 unreviewed**,
**7 not-applicable**, **1 implemented-unverified**, and **1
needs-implementation** records. Issue #37 remains outstanding.

## Batch 41 — October 13, 2026

Batch 41 reviewed issues [#392–393](inventory.md), PRs [#394–405](inventory.md),
and issue [#407](https://github.com/Doezer/Questarr/issues/407). Issue #406 was
already verified in batch 4. Preferred release groups, release blacklisting,
unreleased-game auto-search controls, SSL certificate path protections, RSS
SSRF defenses, update batching, and dynamic game-card accessibility labels are
present with regression coverage. The requested dependency and GitHub Action
versions are all exceeded by the versions locked or pinned in QuestarrNG.

The #407 claim flow now sends an already-completed client download through the
normal completion/import pipeline when post-processing is enabled. This works
for both single claims and bulk claims; imports use the same path resolution and
manual-review fallback as downloads started in QuestarrNG. With post-processing
disabled, a completed claim keeps its terminal completed status. See the
[release note](../../release-notes/2026-10-13-claimed-download-post-processing.md)
and [batch 41 validation](evidence/validation-batch-41.txt).

The ledger now records **360 verified**, **36 superseded**, **742 unreviewed**,
**7 not-applicable**, **1 implemented-unverified**, and **1
needs-implementation** records. Issue #37 remains outstanding.

## Batch 42 — October 13, 2026

Batch 42 reviewed PRs [#408–423](inventory.md). The requested dependency and
GitHub Action versions are met or exceeded by the current lockfile and
SHA-pinned workflows. Security PRs #415–419 are covered by the fork's current
authenticated settings boundary, throttled login route, persisted random JWT
secret, safe-fetch downloader paths, non-root container, and pinned actions.
The old Passport/Steam OAuth session path is no longer part of the application.

PR #420 was a 1.2.2 release roll-up. Its substantive dependency, security,
metadata, and Docker changes are present in fork-adapted form, while the old
release/tag operation is superseded by QuestarrNG's current 1.10.0 release
line. PR #421 exposed a remaining production error leak: generic 5xx messages
were returned, but `err.details` still reached clients. Production 5xx
responses now omit details while server logs retain the original error. PRs
#422 and #423 are present with lazy-loaded dialogs, visible loading feedback,
and game-specific accessible labels in standard and compact cards. See the
[production error security release note](../../release-notes/2026-10-13-production-error-details.md)
and [batch 42 validation](evidence/validation-batch-42.txt).

The ledger now records **375 verified**, **37 superseded**, **726 unreviewed**,
**7 not-applicable**, **1 implemented-unverified**, and **1
needs-implementation** records. Issue #37 remains outstanding.

## Batch 43 — October 13, 2026

Batch 43 reviewed issues [#426](https://github.com/Doezer/Questarr/issues/426)
and [#437](https://github.com/Doezer/Questarr/issues/437), plus PRs #424–425,
#427–428, #430–436, and #438–440. The five dependency PRs are superseded by
newer locked versions. Real-Debrid is already shipped as a first-class
downloader with device authorization, local staging, and the shared import
flow; the PRD and product score now reflect that. Steam wishlist sync uses the
official no-key endpoint, Steam OpenID login is gone, and unused Passport,
Steam OpenID, and session packages have been removed. The optional Steam API
key remains for the separate owned-game and player-achievement features.

Transmission now surfaces its RPC failure reason and logs thrown errors with
Pino's `err` serializer. PR #436 closes issue #437, so there is no separate
issue patch. The fork's existing contextual accessibility names were retained;
the remaining download-result menu name now says “More download options.”
Indexer changes refresh both indexer queries and clear cached search results.
Review-thread follow-ups for the indexer PR were also checked: IGDB settings
are covered by the default-deny API auth boundary, timestamp fields use
millisecond mode, and the status query no longer needs an `any[]` cast.

The download-dialog menu was exercised in the running `dev:test` app. See the
[UI screenshot](../pr-evidence/upstream-download-options-accessibility-batch-43.png),
the [download accessibility release note](../../release-notes/2026-10-13-download-options-accessibility.md),
the [dependency security note](../../release-notes/2026-10-13-unused-steam-auth-dependencies.md),
and [batch 43 validation](evidence/validation-batch-43.txt).

The ledger now records **386 verified**, **42 superseded**, **710 unreviewed**,
**7 not-applicable**, **1 implemented-unverified**, and **1
needs-implementation** record. Issue #37 remains outstanding.

## Batch 44 — October 13, 2026

Batch 44 reviewed PR #441, PRs #443–452, issues [#453](https://github.com/Doezer/Questarr/issues/453)
and [#454](https://github.com/Doezer/Questarr/issues/454), and PRs #455–457. The
ten dependency requests are superseded by newer locked package versions or
newer SHA-pinned Docker actions. Coverage now emits LCOV, keeps the stronger
local floors, tightens the Codecov project tolerance to 1%, and configures
per-file PR comments and generated/test/config ignores.

Issue #453 is covered by the narrow-screen release-title test and existing
running screenshot. Issue #454's bridge-mode port split was already in Compose;
the README now explains changing the host port, and indexer URL validation
trims trailing spaces. Login throttling and the sidebar/notification screen
reader context are present with regression coverage. The Wishlist filter
memoization was already present; this batch fixes stale release categories by
refreshing time-dependent grouping and when a backgrounded tab becomes visible.
See the [running Wishlist screenshot](../pr-evidence/upstream-wishlist-date-rollover-batch-44.png),
the [release note](../../release-notes/2026-10-13-wishlist-release-categories.md),
and [batch 44 validation](evidence/validation-batch-44.txt).

The ledger now records **392 verified**, **52 superseded**, **694 unreviewed**,
**7 not-applicable**, **1 implemented-unverified**, and **1
needs-implementation** record. Issue #37 remains outstanding.

## Batch 45 — October 13, 2026

Batch 45 reviewed issues [#458](https://github.com/Doezer/Questarr/issues/458),
[#459](https://github.com/Doezer/Questarr/issues/459), and
[#466](https://github.com/Doezer/Questarr/issues/466), plus PRs #460–465 and
#467–473. Transmission downloads request and map labels so the configured
category filter excludes unrelated torrents; the Prowlarr download path safely
handles proxy URLs and redirects to magnet links. The Wishlist unreleased toggle,
Steam sync improvements, memoized filtering, RSS SSRF checks, descriptive
accessible labels, IGDB pagination, rTorrent path handling, and RomM import flow
are already present with regression coverage. PR #470's small-screen settings
tabs and string-safe SQLite migration handling are also in place; archive
extraction uses the Alpine-native 7-Zip package instead of the incompatible
`7zip-bin` binary.

The four dependency PRs #462–465 are superseded by newer locked versions. The
Unraid template already used the requested PUID 99 and PGID 100 and kept app
data, library, and downloads separate; it now also sets the requested UMASK 022. The RomM import flow addresses the reviewed manual-review, HTTP status,
and placed-file reporting issues from PR #473. See the
[Unraid template release note](../../release-notes/2026-10-13-unraid-template-permissions.md)
and [batch 45 validation](evidence/validation-batch-45.txt).

The ledger now records **404 verified**, **56 superseded**, **678 unreviewed**,
**7 not-applicable**, **1 implemented-unverified**, and **1
needs-implementation** record. Issue #37 remains outstanding.

## Batch 46 — October 13, 2026

Batch 46 reviewed PRs [#474–489](inventory.md) and issues [#485](https://github.com/Doezer/Questarr/issues/485)–[#486](https://github.com/Doezer/Questarr/issues/486). Dependency PRs #474–479 and roll-up #482 are superseded by the newer package versions and SHA-pinned Codecov action already in the fork. The password and URL trimming from #480 is present; login keeps trying the original password first so accounts created with surrounding spaces still work. #481's version link is shared between login and the sidebar, and #483's game-specific accessible labels are present.

PR #484's download summaries aggregate in SQL, with the indicators, search-result state, filters, and shared view controls already wired through the UI. PR #487's Torznab client builds Prowlarr proxy links with URL parameters and has focused tests. PR #488's preferred-group filtering falls back to all results when no group matches; settings and the manual-search prefilter are present. The independent title-cleaning, error-message, platform-detection, and icon-type improvements from #489 are also present.

Issue #485 is fixed for clients carrying the old fixed `multiFilePlacement: "subfolder"` field: the RomM settings route now drops only that legacy default and still rejects other unknown keys. Issue #486 is not applicable as an implementation request: its report used an unreleased 1.3.0 build, and the requested server logs were never supplied, so the unsafe-URL rejection cannot be distinguished from the intended SSRF guard. The guard remains in place.

Focused validation passed: 12 test files and 845 tests (one skipped), including auth compatibility, RomM settings, Torznab rewriting, preferred-group filtering, download summaries, and the affected UI components. Typecheck, lint, formatting, secret scanning, and release-note validation are recorded in [batch 46 evidence](evidence/validation-batch-46.txt). The ledger now records **412 verified**, **63 superseded**, **662 unreviewed**, **8 not-applicable**, **1 implemented-unverified**, and **1 needs-implementation** record. Issue #37 remains outstanding.

## Batch 47 — October 13, 2026

Batch 47 reviewed PRs #490–502 and #504, plus issues #503 and #505. PR #490's
per-game release blacklist filters both manual searches and automated searches
before notifications or downloads. Preferred release-group settings and
fallback behavior from PR #491 are present; the missing maintainer follow-up is
now covered too: users can save selected search groups to Settings without
changing the automatic pre-filter switch. The running dialog is shown in the
[UI evidence](../pr-evidence/upstream-preferred-groups-batch-47.png).

PR #492's Kubernetes chart is present and passes `helm lint`. Its validation
rejects multiple SQLite replicas and databases outside persisted storage; the
install notes explain LoadBalancer address watching and Questarr's persisted
generated JWT key. PR #493's stats dialog offers image download, only posts to
Discord after the user selects that action, and calls the entry point “Share”
when no webhook is configured. The server revalidates webhook destinations and
uses the SSRF-safe fetcher. Workflow injection protection from #494 and
StepSecurity's hardening from #504 are also present, including SHA-pinned
actions, least-privilege permissions, a digest-pinned Docker base image, and
the repository's pre-commit configuration.

PR #497 is superseded by the merged preferred-groups work in #491, including
the new search-to-settings action. PR #495 was closed as merged with #496; the
fork's lockfile has `socket.io-parser` 4.2.7, and its vendored `node-forge` is
1.4.1-questarr.2. Dependency PRs #498–502 are superseded by the newer locked
versions and Codecov action already in the fork.

Issue #503's seven reports are covered: downloader names are validated before
testing or saving, while a client-managed default download path remains
optional and Real-Debrid's local staging path is required; download search is
debounced; game detail dialogs can be closed and covers open details; qBittorrent
seeding and complete progress enter the completion/import path; and the
Downloads badge counts only active transfers. Issue #505 is covered by
Discovery Settings' hidden-games list and per-game Unhide action, which also
uses a responsive drawer on mobile.

Focused validation passed across 15 test files and 649 tests (one skipped),
including the search save/merge behavior, blacklist and preferred-group search,
Discord sharing, downloader validation, game-card interactions, qBittorrent
status mapping, completion handling, and active-download counts. `helm lint`
and the `dev:test` browser run passed; typecheck, lint, formatting, secret
scanning, release-note validation, and diff checks are recorded in
[batch 47 evidence](evidence/validation-batch-47.txt). The ledger now records
**420 verified**, **71 superseded**, **646 unreviewed**, **8 not-applicable**,
**1 implemented-unverified**, and 1 needs-implementation record. Issue #37
remains outstanding.

## Batch 50 — October 13, 2026

Issue [#37](https://github.com/Doezer/Questarr/issues/37) asked for shared Zod
validation across mutation routes. The server now uses a reusable `validate`
middleware to parse request bodies, apply normalized parsed data before route
handlers, and return a consistent 400 response with structured validation
details. Submitted values are excluded from error responses and logs. Body
validation now covers the mutation routes for authentication and settings,
games and libraries, downloads, imports, integrations, API keys, Steam, game
journals, and RSS. Query and parameter validation remains on its existing
path.

An AST contract test checks every body-consuming POST, PATCH, and PUT route in
the six route modules for Zod validation middleware. Focused invalid/happy-path
tests and the full regression suite pass. The full Vitest run passed 4,140
tests across 256 files (7 skipped); typecheck, lint, formatting, production
build, and all 49 Playwright E2E tests passed. The build retains Vite's existing
large-chunk advisory. See [batch 50 validation](evidence/validation-batch-50.txt).

Issue #37 is now verified in the ledger. The review status totals are 445
verified, 78 superseded, 9 not-applicable, 1 implemented-unverified, 0
needs-implementation, and 614 unreviewed. The campaign still has substantial
historical review work remaining.

## Batch 51 — October 13, 2026

Batch 51 reviewed upstream PRs [#539](https://github.com/Doezer/Questarr/pull/539)–
[#540](https://github.com/Doezer/Questarr/pull/540),
[#542](https://github.com/Doezer/Questarr/pull/542)–
[#543](https://github.com/Doezer/Questarr/pull/543),
[#545](https://github.com/Doezer/Questarr/pull/545)–
[#548](https://github.com/Doezer/Questarr/pull/548), and issues
[#541](https://github.com/Doezer/Questarr/issues/541) and
[#544](https://github.com/Doezer/Questarr/issues/544). Their route, storage,
migration, download-claim, NexusMods, update-filter, and UI behavior is already
present in the fork and covered by the current regression tests. PR #539's
user-isolation and authentication fixes, PR #542's transactional SQLite schema
repair, PR #543's ownership-checked claim flows, and PR #545's search/dialog
fixes were checked against the actual implementation and review feedback.

Issue #541 was a required downloader name that the reporter mistook for a
prefilled placeholder; the reporter confirmed that entering the name allowed
the save. Issue #544 was closed as a duplicate of already-verified issue #391.
WIP PR #546 is superseded by the completed release checks in PR #547. The
NexusMods integration from PR #540 is implemented and stub-tested, but remains
`implemented-unverified` until a valid operator key can verify a live response.
The available-update filter from PR #548 includes desktop and mobile running
screenshots in [the PR evidence directory](../pr-evidence/).

Focused regression validation passed across 18 test files: 789 tests passed,
with 1 skipped. `npm audit` found zero vulnerabilities, and the resolved Axios
version is 1.20.0. The broader full-suite, browser, typecheck, lint, format, and
production-build results are recorded in
[batch 50 evidence](evidence/validation-batch-50.txt). See
[batch 51 evidence](evidence/validation-batch-51.txt) for the exact test group
and item-by-item validation.

After this batch, the ledger records 452 verified, 80 superseded, 9
not-applicable, 2 implemented-unverified, 0 needs-implementation, and 604
unreviewed items. The historical audit remains in progress.

## Batch 52 — October 13, 2026

Batch 52 reviewed PRs [#549](https://github.com/Doezer/Questarr/pull/549)–
[#561](https://github.com/Doezer/Questarr/pull/561), PR
[#564](https://github.com/Doezer/Questarr/pull/564), and issues
[#550](https://github.com/Doezer/Questarr/issues/550),
[#563](https://github.com/Doezer/Questarr/issues/563), and
[#566](https://github.com/Doezer/Questarr/issues/566)–
[#568](https://github.com/Doezer/Questarr/issues/568). The Library dashboard
integration, Logs page, calendar optimization, accessible action labels,
download-search/state fixes, and long-title dialog behavior are present and
covered by regression tests. Dependency PRs #551–556 and aggregate PR #558 are
superseded by newer locked versions. PR #564's merge commit is an ancestor of
the campaign branch. Issue #563 is covered by the SSRF-safe fetcher, including
a regression that proves a reverse-proxy hostname is preserved in the HTTP
Host header while the validated IP is pinned.

Issues #567 and #568 have working Synology Download Station and Deluge adapters
with mocked API coverage, but remain `implemented-unverified` until a live
Synology service and Deluge daemon can be tested. Issue #566 is recorded as
superseded by the canonical long-title issue #550. The long-title end-to-end
run is retained in [visual evidence](evidence/issue-550-long-title.png).

The focused regression group passed 29 test files: 468 tests passed and 1 was
skipped. The full Vitest suite passed 4,144 tests across 259 files, with 7
skipped. Playwright passed all 50 tests. Typecheck, lint, formatting, secret
scanning, production build, override checks, license checks, and deprecated
dependency checks passed. Vite emitted its existing large-chunk advisory.
Production audit found zero vulnerabilities; invoking `audit:prod` through
`npm run` hit npm's project-scoped `EALLOWSCRIPTS` error, while running
`node scripts/audit-prod.mjs` directly passed. Exact results and cleanup notes
are in [batch 52 validation](evidence/validation-batch-52.txt).

After this batch, the ledger records 460 verified, 88 superseded, 9
not-applicable, 4 implemented-unverified, 0 needs-implementation, and 586
unreviewed items. The historical audit remains in progress.

## Batch 53 — October 13, 2026

Batch 53 reviewed upstream PRs [#569](https://github.com/Doezer/Questarr/pull/569)–
[#583](https://github.com/Doezer/Questarr/pull/583). Dependency updates #569–578
are superseded by newer versions pinned in QuestarrNG or by current image
workflows that no longer use the requested actions. PR #579's RSS delete
control has a feed-specific accessible name and pending state. PR #580's
statistics calculation uses one linear pass and handles missing or non-finite
ratings and years.

Reviewing PR #581's comments exposed a risky single-file RomM overwrite,
directory hardlink failures, and path-prefix collisions. The current importer
removes only the exact conflicting file, links directory trees file by file,
and uses segment-aware path mappings. PR #582's download-status behavior keeps
malformed rules observable, prunes stale miss counters, and isolates downloader
errors. Review of PR #583 found a cross-user privacy gap in recovery: pending
downloads now retain their original game owner, and listing, skipping, and
relinking are restricted to that owner and their games. SQLite and PostgreSQL
migrations backfill the owner from the associated game. The review's filesystem
traversal, symlink-mode, extension-preservation, and symlink-walk findings are
also covered by regression tests.

The focused import and mapping group passed 160 tests across five files. The
full Vitest suite passed 4,164 tests across 261 files (7 skipped), and the
isolated serial Playwright run passed all 50 browser journeys, including
orphaned-download recovery. Typecheck, lint, format, secret scanning, SQLite and
PostgreSQL schema checks, build, license, override, deprecation, and production
audit checks passed. Vite emitted its existing large-chunk warning; the SQLite
schema checker reported pre-existing journal timestamp-order warnings. Exact
results and cleanup are in [batch 53 evidence](evidence/validation-batch-53.txt).

After batch 53, the ledger records 465 verified, 98 superseded, 9
not-applicable, 4 implemented-unverified, 0 needs-implementation, and 586
unreviewed items. Validation used a task-owned local scratch directory; the
temporary database, server, reports, and config were removed. Existing auth
state and screenshots were restored, and the unrelated port-5100 server was
left untouched. The full audit remains in progress.

## Batch 54 — October 13, 2026

Batch 54 reviewed issues [#586](https://github.com/Doezer/Questarr/issues/586),
[#595](https://github.com/Doezer/Questarr/issues/595),
[#597](https://github.com/Doezer/Questarr/issues/597), and
[#599](https://github.com/Doezer/Questarr/issues/599), plus PRs #587–594,
[#596](https://github.com/Doezer/Questarr/pull/596),
[#598](https://github.com/Doezer/Questarr/pull/598), and
[#600](https://github.com/Doezer/Questarr/pull/600). The eight dependency PRs
are superseded by a newer Buildx image pipeline, newer locked dependency
versions, or packages no longer used.

Issue #586's Prowlarr regression is covered by a new assertion that the proxied
download URL retains its required `file` parameter. Steam ID saving uses the
server's `PATCH` route, and the YearView uses the requested memoized entries and
date-prefix filtering. Issue #597's chown guard checks the existing ownership
before attempting changes; a container smoke test with a deliberately failing
`chown` stub passed for a correctly owned data mount. The upstream reporter also
confirmed that fix worked.

PR #600 and issue #599 are verified: `+` is escaped only inside Prowlarr's
base64 `link` parameter, while filename query values retain their space
semantics. qBittorrent direct and fallback requests use the corrected URL, and
torrent errors remain recoverable during the grace period. The PR's inline
review feedback was checked: the query-parameter concern is covered by the
focused tests; the self-signed TLS/FormData concern refers to a removed insecure
fallback. Current SABnzbd uploads use explicit multipart bytes and the TLS
certificate remains verified; private CAs are trusted through
`NODE_EXTRA_CA_CERTS`. SonarCloud reported one security hotspot on the upstream
PR, but its details endpoint returned 403; local review and the targeted tests
passed.

The focused regression run passed 230 tests across 11 files. Typecheck, lint,
formatting, shell syntax, and diff checks passed. The current `entrypoint.sh`
also completed in the container smoke test without calling the failing `chown`
stub. No production source under `client/src/**` changed, and no NFS scratch
space was needed. Exact results are in [batch 54 evidence](evidence/validation-batch-54.txt).

After batch 54, the ledger records 472 verified, 106 superseded, 9
not-applicable, 4 implemented-unverified, 0 needs-implementation, and 571
unreviewed items. The full audit remains in progress.

## Batch 55 — October 13, 2026

Batch 55 reviewed PRs [#601](https://github.com/Doezer/Questarr/pull/601),
[#602](https://github.com/Doezer/Questarr/pull/602), #603–606,
[#609](https://github.com/Doezer/Questarr/pull/609),
[#611](https://github.com/Doezer/Questarr/pull/611),
[#612](https://github.com/Doezer/Questarr/pull/612),
[#613](https://github.com/Doezer/Questarr/pull/613), and
[#615](https://github.com/Doezer/Questarr/pull/615), plus issues
[#607](https://github.com/Doezer/Questarr/issues/607),
[#608](https://github.com/Doezer/Questarr/issues/608),
[#610](https://github.com/Doezer/Questarr/issues/610), and
[#614](https://github.com/Doezer/Questarr/issues/614). The source refresh also
added open PR #1203 to the inventory; it remains unreviewed for the next batch.

The NFS ownership guard and strict auto-search group filter are present. The
deduplication review found the important torrent-versus-Usenet edge case: same
title and same protocol results collapse to the highest-priority indexer, while
same-title results with different protocols remain separate choices. A new
cron regression test proves the latter cannot accidentally trigger a single
candidate auto-download. qBittorrent's `QBT_SID_*` cookie handling is covered by
the linked PR and the original reporter's successful 5.2 test.

The external API request is satisfied by the documented JWT API for adding
games with IGDB IDs and retrieving per-game download records, with a narrower
API-key integration API for machine clients. The later request for aggregate
progress and richer indexer metadata was explicitly referred to a separate
issue by the upstream maintainer. Issue #610 did not reproduce as a migration
defect in the current fork: a fresh SQLite migration created the `users` and
`user_settings` tables with all 39 current settings columns, and a real HTTP
smoke completed first-account setup plus settings GET, PATCH, and reread with
200 responses and persisted state—even with IGDB unconfigured. The report was
against v1.3.0; the upstream maintainer also could not reproduce it on a fresh
deployment.

The last `actions/github-script` v7 pin was upgraded to the same immutable v9
revision already used by the other workflow. The remaining requests in the
dependency roll-up are superseded by newer locked versions or actions no
longer used. The v1.3.0 release merge is superseded by the current 1.10.0 line;
its NFS and Prowlarr behavior is covered by current code and regression tests.
The Prowlarr 500 report is handled by qBittorrent's asynchronous-accept path,
which avoids resubmitting a download when immediate verification is delayed.

The focused API, auto-search, downloader, and migration groups passed 775 tests
across 15 files, and the full Vitest suite passed 4,165 tests across 261 files
(7 skipped). A fresh isolated SQLite database completed every migration and
contained the `users` and `user_settings` tables; the follow-up HTTP smoke
successfully created an account, loaded settings, saved a setting, and verified
the persisted value. The changed GitHub
workflow parsed successfully as YAML, and all current `actions/github-script`
references use the v9 SHA. No production source under `client/src/**` changed,
so this batch required no new running-UI screenshot. Validation used
`/tmp/questarr-upstream-batch55-work`; its SQLite database and downloaded issue
screenshot were removed after checks. No NFS scratch space or unrelated
services were touched. Exact results are in
[batch 55 evidence](evidence/validation-batch-55.txt).

After batch 55, the ledger records 481 verified, 112 superseded, 9
not-applicable, 4 implemented-unverified, 0 needs-implementation, and 557
unreviewed items. The upstream snapshot contains 1,163 records, and the full
audit remains in progress.

## Batch 56 — October 13, 2026

Batch 56 reviewed PRs [#616](https://github.com/Doezer/Questarr/pull/616)–
[#625](https://github.com/Doezer/Questarr/pull/625), issue
[#626](https://github.com/Doezer/Questarr/issues/626), PRs
[#627](https://github.com/Doezer/Questarr/pull/627) and
[#628](https://github.com/Doezer/Questarr/pull/628), issue
[#629](https://github.com/Doezer/Questarr/issues/629), and PR
[#630](https://github.com/Doezer/Questarr/pull/630). The dependency-only bumps
#616–620 and #624 are superseded by newer current versions; #625's 1.4.0
backport is superseded by the current 1.10.0 line.

The qBittorrent error view now shows the reported `error_string`, with a safe
fallback when the client omits it. Duplicate qBittorrent submissions resolve to
the existing download, and an accepted but unconfirmed request does not upload a
second copy. Downloader modules and reviewed safety feedback are present in the
current code. The security header and preferred-release-group accessibility
requests are verified with regression tests.

The mobile logs view now caps rendered cards at the latest 200 matching entries
and tells users that Copy still includes all matches. A headless Chromium run at
390×844 returned 205 mock lines, rendered exactly 200, excluded the oldest item,
showed the newest item and cap explanation, and confirmed the copy toast said
all 205 lines were copied. The screenshot is
[batch-56-mobile-logs.png](evidence/batch-56-mobile-logs.png).

Reverse-proxy subpath behavior was checked in production at `/Questarr`: all 14
JavaScript, CSS, and font assets and all 9 observed API calls returned 200, with
no browser errors or failed requests. Unknown nested paths without a runtime
asset hint now fail closed instead of guessing a mount prefix.

Focused regression checks passed 152 tests across 12 files; the path, API, and
reverse-proxy test group passed 426 tests across 4 files. The full suite passed
4,171 tests across 261 files, with 7 skipped. Type checking, lint, formatting,
and the production build passed; Vite reported its existing large-chunk
advisory. Exact outcomes and scratch cleanup are in
[batch 56 validation evidence](evidence/validation-batch-56.txt).

After batch 56, the ledger records 489 verified, 119 superseded, 9
not-applicable, 4 implemented-unverified, 0 needs-implementation, and 542
unreviewed items. The four refreshed-source flags noted above remain open for
renewed triage, and the full audit remains in progress.

## Batch 57 — October 13, 2026

Batch 57 reviewed PRs [#631](https://github.com/Doezer/Questarr/pull/631)–
[#645](https://github.com/Doezer/Questarr/pull/645). PRs #631–638 are
superseded by the merged dependency roll-up #641 and the newer dependency and
workflow versions currently in QuestarrNG. The release/1.4.0 backport #642 is
superseded by the current mainline SSRF implementation in #640. PR #641 itself
is verified against its merge commit and the current dependency state.

The Discovery local-game parsing optimization in #639 is present and covered by
the page tests. The high-priority outbound-fetch protections in #640 validate
resolved addresses and redirects, pin validated connections, preserve Host/TLS
semantics, and strip cross-origin credentials; downloader-specific SSRF and TLS
regressions pass. PR #643's qBittorrent accepted-but-unconfirmed flow preserves
the accepted result and warns users before retrying, avoiding false server
errors and duplicate uploads.

Mobile drawers and navigation from #644 were exercised in Chromium at 390×844.
The Shelved status from #645 persists through the API, and the compact-card
status control stays disabled during an active download. Four screenshots show
the mobile status picker, Add Game drawer, discovery settings drawer, and More
navigation sheet. The browser run found no horizontal overflow or page errors.

Focused client checks passed 159 tests across 11 files, with one skipped. The
focused downloader/security group passed 118 tests across 8 files; the async
download route regression file passed all 10 tests. The full suite passed
4,172 tests across 261 files, with 7 skipped. Type checking, lint, formatting,
production build, secret scanning, and release-note validation passed. See
[batch 57 validation evidence](evidence/validation-batch-57.txt) for commands,
environment details, and cleanup.

After batch 57, the ledger records 495 verified, 128 superseded, 9
not-applicable, 4 implemented-unverified, 0 needs-implementation, and 527
unreviewed items. The four refreshed-source flags noted above remain open for
renewed triage, and the full audit remains in progress.

## Batch 58 — October 13, 2026

Batch 58 reviewed issue [#646](https://github.com/Doezer/Questarr/issues/646)
and PRs [#647](https://github.com/Doezer/Questarr/pull/647)–
[#661](https://github.com/Doezer/Questarr/pull/661), along with the live
verification gap for issue [#568](https://github.com/Doezer/Questarr/issues/568).
Issue #646 and PR #647 are verified: Torznab/Prowlarr URL rewriting recognizes
host aliases such as `localhost` and `127.0.0.1`, so a proxied download URL is
not wrapped twice. Tests also cover container IPs, reverse-proxy scheme/port
and base paths, and external raw URLs.

PR #648's Send Logs flow was exercised in the running application. The dialog
shows what will be shared and where the report is stored; its redaction,
IPv6, timestamp, malformed-response, clipboard, rate-limit, and failure cases
are covered by tests. The transport was tested with mocked responses. No real
logs were sent to the support collector. PR #649's periodic downloader and
indexer version checks and normalized Torznab/Newznab paths are covered by
focused tests and use the safe outbound-fetch path.

PRs #650–655 are superseded by the dependency roll-up in #656 and newer current
versions. The requested workflow action revisions are pinned immutably at later
versions, and the requested package targets are present or exceeded in the
manifest and lockfile. PR #656 is verified against that current dependency
state. The GitHub Actions Dependabot wildcard group in #660 parses and matches
its intended configuration.

PR #657 and issue #568 are verified against a live Deluge 2.2.0 daemon in an
isolated Docker network. The run covered authentication and WebUI auto-connect,
the Label plugin, adding and listing a synthetic magnet, applying and reading
back Questarr's label, an empty file list, pause/resume, and removal. No tracker
was contacted. The disposable service and network were removed afterward; the
test port was confirmed free. The Add Downloader form is shown in the running
UI evidence.

PR #658's collection check uses a Set and ignores missing IGDB IDs, avoiding a
false “already added” match when both records have no ID. A regression test
covers that case, and a stable empty query result keeps the memoized lookup
stable before data loads. PR #659's preferred-release-group action has a
meaningful accessible name, checked by a role-based test and shown in the
running Settings capture. PR #661 keeps polling after qBittorrent accepts a URL
but has not listed it yet; transient lookup errors do not trigger a duplicate
upload, and the retry path is bounded by regression tests.

During full UI smoke testing, two adjacent UX gaps were fixed: the icon-only
mobile Add Game action now has the accessible name “Add Game,” and the empty
Downloader state lists Deluge among supported clients. The Add Game drawer was
checked at 390×844 with no horizontal overflow. Those changes, the Deluge form,
the Send Logs preview, and the preferred-release-group settings view are
captured in [the batch UI evidence](evidence/). The user-facing changes are
listed in the [batch 58 release note](../../release-notes/2026-10-13-add-game-accessibility-and-igdb-matching.md).

The full Vitest run passed 4,174 tests across 262 files, with 7 tests skipped.
The full Playwright E2E run passed 50 tests on a disposable SQLite database.
Focused downloader and client regressions, type checking, lint, formatting,
secret scanning, production build, production dependency audit, license and
override checks, and Dependabot YAML validation passed. The build showed the
existing large-chunk advisory. The standard production audit wrapper was also
fixed to ignore scripts and remove the inherited npm `allow-scripts` setting
from its child environment, so it runs reliably under this npm 11 setup.
Commands, service details, limitations, screenshots, and task scratch cleanup
are recorded in [batch 58 validation evidence](evidence/validation-batch-58.txt).

After batch 58, the ledger records **506 verified**, **134 superseded**, **9
not-applicable**, **3 implemented-unverified**, **0 needs-implementation**, and
**511 unreviewed** items. Issue #568 is no longer awaiting live-service
verification. The four refreshed-source flags noted above remain open for
renewed triage as of that batch; the live Batch 59 refresh found four more, so
eight are now awaiting renewed triage. The full audit remains in progress.

## Follow-up: search, settings, Home Assistant, and review-thread fixes (Batch 59)

Batch 59 reviewed pull requests #662–681 and #696, plus issues #667, #668, and
#674. It added 12 verified dispositions, 8 superseded dependency or replacement
dispositions, and one not-applicable wiki-submodule request. The refreshed
snapshot remains 1,163 records; after this batch the ledger has 518 verified,
142 superseded, 10 not-applicable, 3 implemented-unverified, 0
needs-implementation, and 490 unreviewed items.

The batch fixed aggregated Newznab pagination and typed limit/offset parsing,
so clients can continue loading results accurately. Search now offers an
accessible **Load more results** action when a date filter hides the current
page. The shared priority field allows the current value to be cleared while
editing, then validates and normalizes the value on blur or Enter. Calendar
tests can inject the current date, Copy and Send Logs are disabled when the
active filter has no results, and Clear remains available while any lines are
buffered. All three actions disable when the log buffer is empty. Discovery
preserves valid provider ID `0`. The automatic-search notification path now
sends Apprise alerts independently of the in-app notification preference.

Review comments attached to PR #663 also raised an unauthenticated live-log
socket, missing Library search filtering, and nullable game notes access. The
socket rejects missing or invalid credentials; live logs are app-wide for
authenticated accounts, matching the `/api/logs` access check and the project's
documented flat-trust model. The Library filter and notes access checks are
present. The remaining notification and interface findings are covered by this
batch's regression tests. The wiki relocation itself is not applicable because
this fork has no wiki submodule.

For #205, the user-facing README and the new
[release-selection guide](../DOWNLOAD_RECOMMENDATIONS.md) now explain why
updates start selected, extras stay opt-in, unknown-size extras are excluded,
and the “a lot smaller” threshold is a transparent 25% of the main release.
The Home Assistant guide now documents its fixed `1000:1000` identity,
persistent `/data` mapping, scoped ownership correction, writable checks, and
the limits of that helper. Issue #674's author confirmed that correcting the
Docker volume binding resolved the TerraMaster TOS startup problem; the NAS
guide now explains how to verify host and container paths.

Browser evidence for the date-filtered search, empty-filtered logs, and priority editor
is retained under `evidence/`. The campaign validation evidence records the
focused and full Vitest runs, Playwright coverage, add-on smoke test, security
and format checks, and temporary-data cleanup.

## Batch 60: downloader, security, accessibility, dependencies, and deployment

Batch 60 reviewed the 21 unreviewed PRs from #682–704 (excluding previously
verified #696) and issue #695. It added 14 verified dispositions, six
superseded requests, one not-applicable release-branch synchronization, and one
implemented-but-unverified Synology integration. The source snapshot remains
1,163 items; the ledger now records 532 verified, 148 superseded, 11
not-applicable, four implemented-unverified, zero needs-implementation, and
468 unreviewed items.

The main new behavior restores backwards compatibility for Docker Compose users
who still set PORT: it now supplies both the host and container HTTP port
unless either explicit split variable overrides that side. docker compose config
was checked with defaults, PORT=5201, and separate host/internal values. SQLite
startup diagnostics and existing database-file checks were reviewed alongside
that port fix.

The source review confirmed the current search pagination and date handling,
g4u Newznab query format, Deluge status handling, IPv6 loopback normalization,
SSRF-safe Discord webhook, RSS accessible names, and current immutable CI action
pins. Older grouped dependency updates are superseded by the lockfile; the
release/1.4.0-only synchronization PR does not apply to this mainline campaign.
The full Synology DS2 and legacy contract remains implemented-unverified until
it can be exercised against a live Download Station service.

The focused RSS accessible-name regression test and Discord SSRF option
assertion, Compose interpolation smoke checks, and full validation outcomes are
recorded in [Batch 60 evidence](evidence/validation-batch-60.txt). Eight source
records remain flagged for renewed triage. This campaign is still in progress
and has not passed the merge gate.

## Batch 61 — October 13, 2026

Batch 61 reviewed issues [#705](https://github.com/Doezer/Questarr/issues/705)–
[#710](https://github.com/Doezer/Questarr/issues/710),
[#715](https://github.com/Doezer/Questarr/issues/715), and
[#717](https://github.com/Doezer/Questarr/issues/717), plus PRs
[#712](https://github.com/Doezer/Questarr/pull/712)–
[#714](https://github.com/Doezer/Questarr/pull/714),
[#716](https://github.com/Doezer/Questarr/pull/716), and
[#718](https://github.com/Doezer/Questarr/pull/718)–
[#725](https://github.com/Doezer/Questarr/pull/725). It added 17 verified
dispositions, two superseded dependency updates, and one not-applicable
planning issue.

The qBittorrent async-add response and `stoppedDL` status are covered by the
existing downloader implementation and regression tests. Import History,
retention cleanup, the import review file list, archive warnings, and
multi-volume archive handling are implemented and covered by route, component,
and archive tests. The unlinked-download picker has its scroll container, and
the README already exposes the Code Scanning badge requested by issue #717.
Secret scanning, slash-command argument validation, credential documentation,
test policy, SBOM publication, and collaborator-access policy are present in
the current CI, deployment, and documentation paths.

PR #724's accessible names are already supplied by QuestarrNG's shared tag
editor and the game-download history button. PR #725's library and wishlist
filters already use a single pass in the fork's current component structure;
the wishlist also compares ISO release dates without allocating a `Date` for
each game. PRs #712 and #713 are superseded because the locked dependency
versions now exceed their requested versions. Issue #708 has no body or
actionable acceptance details, so no product change can be tied to its generic
“Post Processing grooming” title.

The live QuestarrNG deployment run `38349306862` completed successfully with
both **Generate SBOM** and **Upload SBOM artifact** steps passing. Its retained
`sbom-questarr-1.10.0-dev` artifact parsed as SPDX 2.3 and contains 555 package
records and 2,955 file records.

Batch 61 also hardened the upstream inventory tooling. Source snapshots redact
credential-bearing query values, and source-row digests now use stable object
key ordering. The prior source-change flags on issue #237 and PRs #1192, #1195,
#1196, #1198, #1199, #1201, #1202, and #1203 were cleared after verifying that
their current sanitized rows and digests match the reviewed snapshot.

Validation results and the sanitized-source scan are recorded in
[Batch 61 evidence](evidence/validation-batch-61.txt). The ledger now records
549 verified, 150 superseded, 12 not-applicable, four implemented-unverified,
zero needs-implementation, and 448 unreviewed items. No source-change flags
remain, but the full audit is still in progress and has not passed the merge
gate.

## Batch 62 — October 13, 2026

Batch 62 reviewed PRs [#726](https://github.com/Doezer/Questarr/pull/726)–
[#745](https://github.com/Doezer/Questarr/pull/745). It recorded 13 verified
dispositions, six superseded dependency updates, and one
implemented-but-unverified DCO rollout.

The Sentinel Discord webhook validation requested in PR #726 is already
implemented at the settings and share endpoints. It accepts only HTTPS
Discord webhook hosts and endpoint paths, rejects userinfo-based hostname
confusion, and has regression coverage for valid domains, malicious hosts,
and plaintext HTTP. PRs #727–728 are now covered by a fork-specific
MAINTAINERS.md that records the sole GitHub administrator, maintainer
responsibilities, the check date, and the limits of GitHub's visibility into
external access. PR #735's consolidation and the existing dependency,
architecture, API, security, and threat-model documents also cover their
requests.

The action and dependency requests in PRs #736–745 are satisfied by current
workflow pins or package-lock versions. The grouped production update in #738
has all 28 requested packages at the requested or a newer version. PR #734's
esbuild, form-data, and ws security fixes are present in the locked tree and
were checked with the dependency audit. Closed dependency requests #737 and
#740–741, #743–745 are superseded by later versions.

PR #729 adds the DCO 1.1 text, contributor instructions, a pull-request
checklist, and an automated check that validates every non-merge commit after
the merge base. The checker and workflow are implemented and tested, with a
documented exception for GitHub-verified bot accounts that cannot provide a
human certification. The policy remains implemented-unverified because the
workflow is not yet active on the default branch, branch protection has not
made the check required, and existing campaign commits do not carry DCO
sign-offs. Campaign automation does not add legal attestations on contributors'
behalf. A maintainer must choose the safe rollout and history treatment before
the campaign can pass its merge gate.

Focused and full validation results, source dispositions, and cleanup are
recorded in [Batch 62 evidence](evidence/validation-batch-62.txt). The campaign
remains in progress and has not passed the merge gate.

## Batch 63 — October 13, 2026

Batch 63 reviewed PRs [#746](https://github.com/Doezer/Questarr/pull/746)–
[#748](https://github.com/Doezer/Questarr/pull/748) and [#750](https://github.com/Doezer/Questarr/pull/750)–
[#755](https://github.com/Doezer/Questarr/pull/755). There is no #749 record in
the refreshed issue/PR inventory. The batch added five verified and four
superseded dispositions.

The dependency-only targets in PRs #746, #747, and #755 have been replaced by
newer locked versions: jsdom 30.1.2, @tailwindcss/vite 4.3.3, Prettier 3.9.9,
tsx 4.23.15, typescript-eslint 8.71.1, Vite 8.3.2, and lucide-react 1.52.0.
The full test/build validation from the current integration checkpoint passes
with these versions.

PR #748's StepSecurity hardening and PR #754's six action updates are reflected
in current least-privilege workflow permissions and immutable SHA-pinned action
references. PR #750's vulnerability policy and CI/release gates are present in
the security documentation and workflows. PR #751's OpenVEX feed and scan
workflow are active; the feed carries a justified `not_affected` assessment for
GHSA-86w9-cpqp-85rv. PR #752's Semgrep ERROR gate and explicit AES-GCM
authentication-tag length are present and covered by the focused security
tests.

PR #753 was closed without merging after a maintainer said the Node 26 change
was completed in release v1.4.0. The current Dockerfile uses a digest-pinned
Node 26 Alpine base, so the standalone version bump is superseded by the
released implementation.

Focused security tests, workflow contract checks, the production dependency
audit, and a parse/pin scan of all 20 workflow files passed. The ledger now
records 567 verified, 160 superseded, 12 not-applicable, five
implemented-unverified, zero needs-implementation, and 419 unreviewed items.
The campaign remains in progress and has not passed the merge gate; see
[Batch 63 evidence](evidence/validation-batch-63.txt).

## Batch 64 — October 13, 2026

Batch 64 reviewed PRs [#756](https://github.com/Doezer/Questarr/pull/756)–
[#765](https://github.com/Doezer/Questarr/pull/765). Six requests are verified
and four are superseded by later locked dependency releases. Resolver 5.9.1
replaces #756's 5.4.0 target; js-yaml 5.4.3 replaces #759's 5.2.1 target;
React and its types are both at 19.3.0, above #761's 19.2.7; and
react-day-picker 10.0.2 replaces #763's 10.0.1 target. Archiver/types 8.0.0,
Express 5.2.1 with Express 5 typings, @eslint/js 10.0.1, and date-fns 4.4.0
match #757, #758, #760, and #762. Archive, route, calendar, and UI tests pass on
the current dependency set.

PR #764 is merged to upstream `release/1.4.0`; its status icons and colors,
card-title containment, and search-results badge behavior are present in the
fork. The final upstream patch already corrected the narrow-card overflow
reported in review. We also aligned each status option's accessible name with
its visible label, and verified the active state and all selectable options in
a running browser. The [status-picker screenshot](evidence/upstream-pr-764-status-picker-2026-10-13.png)
shows the live interaction.

PR #765 was closed without merging. Its requested action releases are met by
current or newer pinned versions. The fork retains StepSecurity's secure
drop-in [Buildx](https://github.com/step-security/setup-buildx-action),
[QEMU](https://github.com/step-security/setup-qemu-action),
[login](https://github.com/step-security/docker-login-action), and
[build/push](https://github.com/step-security/docker-build-push-action)
wrappers at newer releases, preserving the existing workflow hardening;
metadata-action and artifact uploads match the requested levels, while
Scorecard remains newer. CodeQL workflow and upload action invocations have
since been removed under the organization owner directive; remaining workflow
action references stay full-SHA pinned.

Batch 64 validation passed 599 tests across 13 focused files, TypeScript
checking, repository-wide lint and formatting, the production build, and the
production dependency audit. The isolated Playwright setup and status-picker
journey both passed. The screenshot was retained; the task-owned server, test
database, authentication state, copied dependencies, worktree, and other local
scratch were removed. No NFS scratch was needed. The ledger now records 573
verified, 164 superseded, 12 not-applicable, five implemented-unverified, zero
needs-implementation, and 409 unreviewed items; no source-change flags are set.
The campaign remains in progress and has not passed the merge gate; see
[Batch 64 evidence](evidence/validation-batch-64.txt).

## Batch 65 — October 13, 2026

Batch 65 reviewed upstream PRs [#766](https://github.com/Doezer/Questarr/pull/766)–
[#768](https://github.com/Doezer/Questarr/pull/768), issue
[#769](https://github.com/Doezer/Questarr/issues/769), and PRs
[#770](https://github.com/Doezer/Questarr/pull/770)–
[#775](https://github.com/Doezer/Questarr/pull/775). Six dependency updates
were superseded by newer locked versions or by first-party TypeScript
declarations. Apprise CLI mode, the optional PostgreSQL backend, the pinned
GitHub Script v9 action, and TypeScript 6.0.3 were verified in QuestarrNG.
The upstream PostgreSQL request does not ask for a particular additional
dialect after its discussion narrowed the practical scope to PostgreSQL; the
current opt-in backend addresses that request. Existing user guides already
cover [Apprise API and CLI modes](../NOTIFICATIONS.md) and
[SQLite/PostgreSQL setup and migration](../DATABASE.md).

The PostgreSQL check went beyond PGlite parity: a disposable PostgreSQL 18.6
cluster bound to loopback completed fresh and repeated migrations, answered the
real node-postgres driver's health check, created a setup user, and enforced the
API-key cap across concurrent pooled requests. No host PostgreSQL service was
used. The scratch cluster and test data were removed after the run.

Focused validation passed 468 tests in 8 Vitest files, including Apprise
routes/settings and database parity/transaction suites. The complete test
suite, type checking, lint, formatting, build, production audit and secret scan
also passed. See [Batch 65 evidence](evidence/validation-batch-65.txt).

The ledger now records 577 verified, 170 superseded, 12 not applicable, 5
implemented-unverified, 0 needs-implementation, and 399 unreviewed items, with
no source-change flags. The campaign remains incomplete and is not ready to
merge to `main`.

## Batch 66 — October 13, 2026

Batch 66 reviewed upstream PRs [#776](https://github.com/Doezer/Questarr/pull/776)–
[#785](https://github.com/Doezer/Questarr/pull/785). Six items were verified
and four dependency requests were superseded by newer releases or the combined
Zod/panel migration in PR #781. The merged Zod validation-error upgrade is at
the requested 5.0.0; the current Zod, panel, React DOM, and development-tool
versions are newer than their individual PR targets.

The batch verified auto-search availability notifications on false-to-true
transitions, reset behavior when a game leaves `wanted`, and the preferred
release-group filter; confirmed the combined Zod v4 and panel v4 migration; and
checked the Calendar's single-pass grouping. PR #783's game is QuestarrNG's
isometric, click-to-move stealth adaptation, with a deterministic seed, patrols,
line-of-sight detection, a keycard-gated terminal, distractions, pause/resume,
and Ghost Mode unlock on victory. A new PlayPage component test covers the
seeded start, win callback and Ghost Mode persistence, caught notice, and engine
cleanup. The real browser run rendered the briefing and active game, exercised
pause/resume, and produced no uncaught page errors. See
the [briefing screenshot](evidence/upstream-pr-783-ghost-the-terminal-briefing-2026-10-13.png)
and [running-game screenshot](evidence/upstream-pr-783-ghost-the-terminal-running-2026-10-13.png).

The full Vitest coverage run passed 4,230 tests with 7 skipped across 270
passing and 1 skipped test file. Coverage reached 83.51% statements, 76.14%
branches, 80.41% functions, and 84.95% lines, clearing both the configured
83/76/79/84 thresholds and PR #784's 75% target on every metric. Test review
also isolated `fetch` mocks with restorable spies and replaced a moving date
fixture with a fixed timestamp. Lint, TypeScript checking, formatting, focused
tests, and the browser run passed. Full details are in
[Batch 66 evidence](evidence/validation-batch-66.txt).

The ledger now records 583 verified, 174 superseded, 12 not applicable, 5
implemented-unverified, 0 needs-implementation, and 389 unreviewed items, with
no source-change flags. Live GitHub checks reconfirmed upstream main
`0b538fe4b0a2269edcc8fd3e71e2bbc240291868`, 232 issues, and 931 PRs; the
sanitized source rows remain from the October 13 17:28 UTC audit. The campaign
remains incomplete and is not ready to merge to `main`.

## Batch 67 — October 13, 2026

Batch 67 reviewed upstream PRs [#786](https://github.com/Doezer/Questarr/pull/786)–
[#795](https://github.com/Doezer/Questarr/pull/795). Four requests were verified,
five dependency/action updates were superseded by newer versions or a security
migration, and the TypeScript 7 request was marked not applicable while the
current TypeScript ESLint peer range still excludes TypeScript 7.

The StepSecurity request was completed by switching all release and release
recovery publication steps from softprops to the full-SHA-pinned StepSecurity
GitHub Release action. Those read-only checkouts now disable persisted
credentials; changelog jobs retain them because they push generated branches.
The existing DAST workflow and first-scan remediations were verified, including
the CSP restrictions, exact Permissions-Policy regression check, ZAP rules file,
and blocking behavior for unignored WARN/FAIL alerts. The production readiness
loop was also made clean under ShellCheck.

The production build and smoke test passed, and the focused security suite
passed 14 tests. The live audit rechecked issue #1169's new reporter comment and
kept its verified status. One later source edit remains flagged: open PR #1194
has not yet been reviewed. Full commands, response headers, workflow checks,
scratch cleanup, and scanner-run evidence are recorded in
[Batch 67 evidence](evidence/validation-batch-67.txt).

The ledger now records 587 verified, 179 superseded, 13 not applicable, 5
implemented-unverified, 0 needs-implementation, and 379 unreviewed items.
Upstream main remains `0b538fe4b0a2269edcc8fd3e71e2bbc240291868`, with 232
issues and 931 pull requests. The campaign remains incomplete and is not ready
to merge to `main`.

## Batch 68 — October 13, 2026

Batch 68 reviewed upstream PRs [#796](https://github.com/Doezer/Questarr/pull/796),
[#798](https://github.com/Doezer/Questarr/pull/798)–
[#800](https://github.com/Doezer/Questarr/pull/800), issue
[#802](https://github.com/Doezer/Questarr/issues/802), and PRs
[#804](https://github.com/Doezer/Questarr/pull/804)–
[#805](https://github.com/Doezer/Questarr/pull/805). PR
[#803](https://github.com/Doezer/Questarr/pull/803) was superseded by the
RARLAB-backed archive handling that addresses issue #802. Issue #797's
qBittorrent 5.2 response handling was verified in the current fork. A fresh
live refresh retained PR #1194 as the only changed-source record awaiting
review.

The batch closes a DAST false-positive gap from rule 10110 with an AST-based
check over the production bundles, validates Steam sync intervals server-side
to the supported 1–168 hour range, and strengthens Steam scheduling tests. It
also records the RARLAB archive digest and a real archive list/extract smoke
test. Focused validation passed 624 tests across 12 files; TypeScript, lint,
formatting, the production build, and the built-bundle guard passed. A ZAP
baseline scan of the running production build returned zero new WARN/FAIL
alerts. The GitHub-hosted follow-up remained queued when recorded; both results
and the cleanup record are in [Batch 68 evidence](evidence/validation-batch-68.txt).

The ledger now records 595 verified, 180 superseded, 13 not applicable, 5
implemented-unverified, 0 needs-implementation, and 370 unreviewed items.
Upstream main remains `0b538fe4b0a2269edcc8fd3e71e2bbc240291868`, with 232
issues and 931 pull requests. The campaign remains incomplete and must not be
merged to `main`.

## Batch 69 — October 13, 2026

Batch 69 reviewed upstream PRs [#806](https://github.com/Doezer/Questarr/pull/806)–
[#810](https://github.com/Doezer/Questarr/pull/810), issues
[#811](https://github.com/Doezer/Questarr/issues/811) and
[#812](https://github.com/Doezer/Questarr/issues/812), PRs
[#813](https://github.com/Doezer/Questarr/pull/813) and
[#814](https://github.com/Doezer/Questarr/pull/814), and issue
[#815](https://github.com/Doezer/Questarr/issues/815). Eight requests were
verified against current behavior; PRs #806 and #810 were superseded. The
current CI suite runs in one test job in about three minutes, so four shards
and a merge job would add five runners and five installs for similar wall time.
The requested action updates are already covered by the pinned setup-node and
the hardened release action that replaced softprops.

The batch adds regression coverage for separate Erotic and age-rating signals,
independent content-filter settings and age-restricted quick-add, Windows 2000
theme persistence, and the hardlink/symlink tradeoffs shown during import
review. It also verifies the existing search-priority ordering, Prowlarr
service-alias URL handling, single-pass library statistics, styled RSS view
tooltips, and SABnzbd's final storage-path resolution. No application source
files changed in this batch.

Focused validation passed 383 tests across 14 files, with one skipped. TypeScript,
full lint, formatting, and `git diff --check` passed. A disposable headless
browser check confirmed the Windows 2000 Settings class and saved preference,
and showed the styled “List View” tooltip on the RSS page. The dev server,
test database, temporary worktree, and downloaded browser artifacts were
removed after the check. See [Batch 69 validation evidence](evidence/validation-batch-69.txt).

The ledger now records 603 verified, 182 superseded, 13 not applicable, 5
implemented-unverified, 0 needs-implementation, and 360 unreviewed items.
Upstream main remains `0b538fe4b0a2269edcc8fd3e71e2bbc240291868`, with 232
issues and 931 pull requests. The campaign remains incomplete and must not be
merged to `main`.

## Batch 70 — October 13, 2026

Batch 70 reviewed PRs [#816](https://github.com/Doezer/Questarr/pull/816),
[#819](https://github.com/Doezer/Questarr/pull/819)–
[#825](https://github.com/Doezer/Questarr/pull/825), and issues
[#817](https://github.com/Doezer/Questarr/issues/817) and
[#818](https://github.com/Doezer/Questarr/issues/818). Six records were
verified; dependency requests #816, #819, #820, and #825 were superseded by
newer locked versions.

For issue #817, the current qBittorrent 5 path tracks accepted asynchronous
adds before an infohash is available, then resolves the hash for completion and
import. The original report did not include a qBittorrent version or logs, so
the evidence is the current regression coverage for async tracking and import
handling. Issue #818's follow-up supplied the concrete Prowlarr alias failure;
the validated-IP fetch preserves its configured Host while avoiding a nested
proxy URL. PR #822's per-request connection-pool review note was addressed with
a short-lived undici Agent cache keyed by validated address and family. PR #823
also has tag-scoped polling, transient-error handling, and guaranteed timer-mock
cleanup. PR #824's SABnzbd storage-path behavior remains covered by the
custom-incomplete-directory tests.

PR #821's workflow hardening is present: non-runtime jobs skip lifecycle
scripts, runtime jobs retain native setup, and scans use locked tools. The fork
hash-pins Apprise at 2.0.1 and Semgrep from requirement files. Dependency
requests in #816, #819, #820, and #825 now resolve to equal or later locked
versions.

Focused validation passed 308 tests across 12 files. TypeScript, full lint,
Prettier, the production build, override and license checks, and the production
audit passed; the production audit found zero vulnerabilities. The existing
build still reports its large-chunk advisory, and the deprecation check lists
three inherited packages pinned upstream. The build used a task-scoped backup
for the pre-existing `dist` directory, restored it after validation, and
removed its temporary directory. No UI source files changed. See [Batch 70
validation evidence](evidence/validation-batch-70.txt).

The ledger now records 609 verified, 186 superseded, 13 not applicable, 5
implemented-unverified, 0 needs-implementation, and 350 unreviewed items.
Upstream main remains `0b538fe4b0a2269edcc8fd3e71e2bbc240291868`, with 232
issues and 931 pull requests. The campaign remains incomplete and must not be
merged to `main`.

## Batch 71 — October 13, 2026

Batch 71 reviewed PRs [#826](https://github.com/Doezer/Questarr/pull/826)–
[#831](https://github.com/Doezer/Questarr/pull/831) and issues
[#832](https://github.com/Doezer/Questarr/issues/832)–
[#835](https://github.com/Doezer/Questarr/issues/835). Five requests were
verified; five dependency or workflow updates were superseded by current
versions or the later corrected request. PR #828's proposed Node digest was
the Debian image, which lacks `apk`; QuestarrNG's later pinned Alpine digest
was confirmed from registry manifests for both amd64 and arm64.

The verified behavior includes NZBGet's configured-category fallback, import
recovery for single-file torrents and failed unpacking, and retryable failed
imports with visible reasons. The mobile download-card fix replaces
`break-words` with `wrap-anywhere`: a real browser check found the old card
expanded to 778.8px at a 390px viewport despite its unit test, while the fixed
card is 358px wide and the document remains 390px with no horizontal overflow.
The captured [mobile screenshot](evidence/validation-batch-71-mobile-download-card.png)
shows the running result.

Focused validation passed 241 tests across nine files. TypeScript, full lint,
Prettier, `git diff --check`, and the production build passed; the build retains
its existing large-chunk advisory. Docker Registry metadata, rather than a
local Docker image build, was used to verify the pinned multi-platform Node
image. The dev server, generated test database, temporary Playwright browser
installation, and build scratch were removed; the pre-existing `dist` output
was restored. See [Batch 71 validation evidence](evidence/validation-batch-71.txt).

The ledger now records 614 verified, 191 superseded, 13 not applicable, 5
implemented-unverified, 0 needs-implementation, and 340 unreviewed items. The
source snapshot still contains 232 issues and 931 pull requests, with PR #1194
as the only changed-source flag. The campaign remains incomplete and must not
be merged to `main`.

## Batch 72 — October 13, 2026

Batch 72 reviewed issues [#836](https://github.com/Doezer/Questarr/issues/836)
and [#843](https://github.com/Doezer/Questarr/issues/843), plus PRs
[#837](https://github.com/Doezer/Questarr/pull/837)–
[#842](https://github.com/Doezer/Questarr/pull/842) and
[#844](https://github.com/Doezer/Questarr/pull/844)–
[#845](https://github.com/Doezer/Questarr/pull/845). All ten records were
unchanged from the refreshed source snapshot and are now verified.

The batch rechecked missing-download notifications and manual review,
React 19 and its focus/blur guard, retryable import failures, primitive-date
wishlist sorting, accessible download action names, and reverse-proxy
subdirectory behavior. Issue #836 is covered by the linked NZBGet success
status fix in PR #855; issue #843 is avoided in this fork because it contains
no Home Assistant SSH wiki submodule, removed upstream in PR #846. For PR #839,
the Batch 71 browser capture remains the running visual proof of the fix.

The qBittorrent v5+ follow-up in PR #845 had actionable review feedback about
the total hash-resolution wait. Accepted URL adds now use one 15-second budget
across polling and re-authentication. An unresolved add remains tracked and
warns the user to check qBittorrent before retrying, avoiding a duplicate
upload. Logger target tests also use an in-process writable sink so they do not
start real transport workers, and accessibility tests assert the actual names
exposed for Pause, Resume, and Start Download actions.

Focused validation passed 710 tests across 15 files; the full suite passed
4,255 tests across 271 files with 7 tests skipped. TypeScript, lint, Prettier,
the production build, secret scanning, dependency override checks, and license
checks passed. The production dependency audit could not reach npm's registry
advisory endpoint. The build retained its existing large-chunk advisory. No
`client/src/**` source changed in this batch; see
[validation evidence](evidence/validation-batch-72.txt).

The ledger now records 624 verified, 191 superseded, 13 not applicable, 5
implemented-unverified, 0 needs-implementation, and 330 unreviewed items. PR
#1194 remains the only source-changed record. The campaign remains incomplete
and must not be merged to `main`.

## Batch 73 — October 13, 2026

Batch 73 reviewed PRs [#846](https://github.com/Doezer/Questarr/pull/846)–[#848](https://github.com/Doezer/Questarr/pull/848), issue [#849](https://github.com/Doezer/Questarr/issues/849), and PRs [#850](https://github.com/Doezer/Questarr/pull/850)–[#853](https://github.com/Doezer/Questarr/pull/853), [#855](https://github.com/Doezer/Questarr/pull/855), and [#856](https://github.com/Doezer/Questarr/pull/856). All ten records were unchanged from the refreshed source snapshot.

The review verified the fork's HTTPS-safe clone configuration, recognized PR template filename, Usenet archive-password flow, NZBGet category fallback and success states, README legal disclaimer, safe GHCR pruning rules, and single-file torrent import handling. A new cron regression test confirms idle download-status ticks do not emit the info-level heartbeat. The Unraid template already had its category and `/data` library mapping, but its guide still implied use of the removed Template repositories field. The README now explains Unraid 6.10+ local user-template installation and maps `/data` as the Local Path to the exact downloader-reported Remote Path. XML parsing passed.

Focused validation passed 117 tests across five files, with 32 cron-status tests passing after formatting. The full suite passed 4,256 tests with 7 skipped. TypeScript, lint, format, release-note, XML, and diff checks passed. The GHCR pruning workflow was reviewed statically and not triggered because it deletes remote image versions. No production build was repeated because no production source changed; no `client/src/**` files changed. See [Batch 73 validation evidence](evidence/validation-batch-73.txt).

The ledger now records 634 verified, 191 superseded, 13 not applicable, 5 implemented-unverified, 0 needs-implementation, and 320 unreviewed items. PR #1194 remains the only source-changed record. The campaign remains incomplete and must not be merged to `main`.

## Batch 74 — October 14, 2026

Batch 74 reviewed PRs #857–866. The four security and account-operation requests are verified. The six dependency updates are superseded by current locked package and workflow versions that meet or exceed the requested targets. Their descriptions, review feedback, CI outcomes, and resulting fork behavior are recorded per item in the ledger and [Batch 74 evidence](evidence/validation-batch-74.txt).

The recovery CLI now enforces the same trimmed 8-character, letter-and-number password policy as account setup and password changes. Its testable runner covers invalid arguments, missing accounts, weak passwords, confirmation mismatches, successful hashing and storage, failed updates, and secret-safe error handling. The API and security documentation now describe login logging, game ownership responses, and local host/container recovery. Regression tests assert that another user's status, visibility, and deletion requests return 403 without database writes or file deletion.

Focused validation passed 396 tests across the recovery and API route suites. The full suite passed 4,269 tests with 7 skipped; type checking, lint, formatting, secret scanning, production TypeScript compilation, the Vite build, the compiled CLI usage smoke test, and release-note validation passed. Vite emitted a large-chunk advisory. No `client/src/**` files changed. Task-scoped local scratch was removed; the desktop NFS mount hung during metadata access, so no NFS scratch was created. See [Batch 74 validation evidence](evidence/validation-batch-74.txt).

The ledger now records 638 verified, 197 superseded, 13 not applicable, 5 implemented-unverified, 0 needs-implementation, and 310 unreviewed items. PR #1194 remains the only source-changed record. The campaign remains incomplete and must not be merged to `main`.

## Batch 75 — October 14, 2026

Batch 75 reviewed issue [#868](https://github.com/Doezer/Questarr/issues/868) and PRs [#867](https://github.com/Doezer/Questarr/pull/867) and [#869–876](https://github.com/Doezer/Questarr/pull/869). The jsdom target is superseded by the current 30.1.2 lock. The qBittorrent 5.2 issue and pending-add PR are verified; the adapter now stops after its first failed status lookup and keeps the accepted add tracked by correlation tag instead of repeating a slow failing request. Existing card actions, wishlist columns, indexer links, hardlink fallback, release-state normalization, visible scrollbars, and Packs/Addons support were checked against current source, tests, and running UI evidence. All ten records were unchanged from their source snapshots.

The remaining open review note on PR #876 asked to share the auto-search filtering and deduplication stages. The cron now uses one common helper for main, update, and packs candidates. Update-only installed-version filtering still happens before deduplication, and new regression coverage confirms that packs honor platform, operating-system, architecture, preferred-group, and duplicate filters. Batch 75 also added direct wishlist-column tests for persisted, malformed, and out-of-range values.

The headless `npm run dev:test` smoke captured card actions, mobile actions, the wishlist column control, linked download results, Packs/Addons results, and a game-details modal. The screenshot artifacts are retained in the [Batch 75 evidence folder](evidence/batch-75/):

![Desktop game-card actions](evidence/batch-75/b75-game-card-actions.png)

![Wishlist grid column control](evidence/batch-75/b75-wishlist-grid-columns.png)

![Download results with the indexer source link and Packs/Addons category](evidence/batch-75/b75-download-indexer-source.png)

Focused validation passed 253 tests with 1 skipped across nine files. The full suite passed 4,274 tests with 7 skipped across 274 test files. TypeScript, lint, formatting, secret scanning, dependency override review, release-note validation, and a production Vite and TypeScript build passed. Vite emitted its existing large-chunk advisory. See [Batch 75 validation evidence](evidence/validation-batch-75.md) for all artifacts and checks.

The ledger now records 647 verified, 198 superseded, 13 not applicable, 5 implemented-unverified, 0 needs-implementation, and 300 unreviewed items. PR #1194 remains the only source-changed record. Task-scoped local scratch and the isolated test worktree were removed; the NFS share was not used. The campaign remains incomplete and must not be merged to `main`.

## Batch 76 — October 14, 2026

Batch 76 reviewed PRs [#877](https://github.com/Doezer/Questarr/pull/877)–[#884](https://github.com/Doezer/Questarr/pull/884), [issue #885](https://github.com/Doezer/Questarr/issues/885), and [PR #886](https://github.com/Doezer/Questarr/pull/886). The category-sort PR was superseded by #891 and its unique batch-mode reporting fix was carried forward by #931. The Alpine build fix and workflow behavior are verified; dependency targets are exceeded by the current lock; the Unraid 99:100 and UMASK defaults are present. Issue #885's single-file torrent path mismatch is covered by the shared resolver and regression tests. All ten records are unchanged from the refreshed snapshot.

PR #884 was intentionally not implemented as a permanent retention change: its maintainer closed it as a one-time manual cleanup. PR #878 retains one outdated, non-blocking suggestion to pin Alpine build-tool versions; the clean Linux image build passed against the pinned Node 26 Alpine base and its versioned package repository.

Focused validation passed 291 tests across seven files; type checking, SQLite native smoke, deployment-workflow parsing, shell syntax, and Unraid XML checks passed. A clean isolated Buildx production image build completed through dependency installation, Vite and TypeScript compilation, dependency pruning, and OCI export. npm reported zero vulnerabilities; Vite emitted its existing large-chunk advisory. The build context and OCI artifact on kspls0's LVM share and the isolated Buildx builder were removed after validation. No `client/src/**` source changed. See [Batch 76 validation evidence](evidence/validation-batch-76.md).

The ledger now records 651 verified, 203 superseded, 14 not applicable, 5 implemented-unverified, 0 needs-implementation, and 290 unreviewed items. PR #1194 remains the only source-changed record. The campaign remains incomplete and must not be merged to `main`.

## Batch 77 — October 14, 2026

Batch 77 reviewed PRs [#887](https://github.com/Doezer/Questarr/pull/887)–[#895](https://github.com/Doezer/Questarr/pull/895) and [issue #896](https://github.com/Doezer/Questarr/issues/896). PRs #887–889 were superseded by combined PR #890; #892 and #893 by replacement PRs #938 and #945; and the requested dependency versions in #894 by newer locked versions. PRs #890, #891, #895, and issue #896 are verified against the current fork. All ten source records are unchanged from the refreshed snapshot.

The ARM issue uncovered a fork-specific runtime gap: QuestarrNG's workflows already built ARM64 images, but the image shipped an x64-only UnRAR executable. The Dockerfile now builds SHA-pinned RARLAB UnRAR source for the target architecture, retains its license, and the README, import guide, secrets guide, and release note document the behavior. Clean amd64 and arm64 production image builds passed. Both images reported UnRAR 7.23 and extracted RAR5 single-file and 12-volume fixtures with byte-for-byte checks; both also started successfully and returned `{"status":"ok"}` from `/api/health`.

Focused validation passed 281 tests with 1 skipped across eight files. TypeScript, lint, formatting, secretlint, dependency-override checks, license checks, and the running Files-tab browser check passed. The screenshot shows main-game and DLC groups: [PR #893 Files-tab evidence](evidence/upstream-pr-893-files-tab-2026-10-14.png). See [Batch 77 validation evidence](evidence/validation-batch-77.md) for commands and cleanup details.

The ledger now records 655 verified, 209 superseded, 14 not applicable, 5 implemented-unverified, 0 needs-implementation, and 280 unreviewed items. PR #1194 remains the only source-changed record. The campaign remains incomplete and must not be merged to `main`.

## Batch 78 — October 14, 2026

Batch 78 reviewed PRs [#897](https://github.com/Doezer/Questarr/pull/897)–[#905](https://github.com/Doezer/Questarr/pull/905), then [#907](https://github.com/Doezer/Questarr/pull/907) and [#908](https://github.com/Doezer/Questarr/pull/908). Five records are verified: #897's platform/year search filters, #899's development dependency updates, #904's release version, #905's multi-architecture build workflow, and #908's single-pass genre/platform collection. Six are superseded: #898 by #1048, #900 by newer locked dependencies, #901 by newer action pins, #902 by #905, #903 by the maintainer's patched-hotfix decision recorded with #904, and #907 by #908. All eleven source records were unchanged from the refreshed snapshot.

The existing search and target-platform behavior already met the upstream requests. Batch 78 added regression coverage for inclusive year boundaries and invalid filter rejection before IGDB calls, per-game target-platform persistence/change/clear, and unique sorted genre/platform filters. The Add Game filter flow was exercised in a running `npm run dev:test` session; its query and selected values are shown in [PR #897 visual evidence](evidence/upstream-pr-897-add-game-filters-2026-10-14.png). The strict release SCA gate remains in place; PR #903's maintainer closed the bypass proposal after choosing a patched v1.4.2 hotfix instead. Focused validation passed 869 tests across 13 files with no skips, and repository-wide type, lint, format, secret, dependency-override, license, and production-build checks passed. See [Batch 78 validation evidence](evidence/validation-batch-78.md) for source findings, checks, and cleanup.

The ledger now records 660 verified, 215 superseded, 14 not applicable, 5 implemented-unverified, 0 needs-implementation, and 269 unreviewed items. PR #1194 remains the only source-changed record. The campaign remains incomplete and must not be merged to `main`.

## Batch 79 — October 14, 2026

Batch 79 reviewed PRs [#909](https://github.com/Doezer/Questarr/pull/909)–[#912](https://github.com/Doezer/Questarr/pull/912), issues [#913](https://github.com/Doezer/Questarr/issues/913) and [#914](https://github.com/Doezer/Questarr/issues/914), and PRs [#915](https://github.com/Doezer/Questarr/pull/915) and [#916](https://github.com/Doezer/Questarr/pull/916). PRs #909 and #915 are superseded by the corrected Alpine image pin in #911 and the SABnzbd follow-ups #937/#940. The other six records are verified against the current fork. All eight matched their refreshed source digests.

Issue #913 exposed both a SABnzbd path-resolution failure and a risky manual-import choice: in Move mode, selecting a parent download folder could transfer unrelated files. Existing path resolution handles SABnzbd `storage` values that name either a folder or one file inside it, and failed confirmations remain retryable. QuestarrNG now also rejects a mapped source path that is a parent of the tracked download folder when that folder can be resolved. The review dialog warns that the selected source is transferred and Move removes it; the import guide explains the same behavior. The actual running interface is captured in [issue #913 visual evidence](evidence/upstream-issue-913-source-path-warning-2026-10-14.png), with details in [Batch 79 validation evidence](evidence/validation-batch-79.md).

Batch 79 also confirmed the retry-state assertion from #910, the current tag-and-digest Node Alpine pin from #911, the cross-repository support-log link and protected investigation guidance from #912, plain-HTTP clipboard fallback from issue #914, and actionable corrupt-archive errors with isolated extraction staging from #916. Focused regression validation passed 335 tests with 1 skipped across 12 files. TypeScript, lint, formatting, secretlint, dependency-override review, production-license checks, and production build passed. The new import behavior has a user-facing release-note fragment.

The ledger now records 666 verified, 217 superseded, 14 not applicable, 5 implemented-unverified, 0 needs-implementation, and 261 unreviewed items. PR #1194 remains the only source-changed record. The campaign remains incomplete and must not be merged to `main`.

## Batch 80 — October 14, 2026

Batch 80 reviewed PRs [#917](https://github.com/Doezer/Questarr/pull/917)–[#922](https://github.com/Doezer/Questarr/pull/922), PR [#924](https://github.com/Doezer/Questarr/pull/924), and issue [#925](https://github.com/Doezer/Questarr/issues/925). Four dependency and CI updates (#918–#921) are superseded by newer dependency versions or immutable action pins. The other four records are verified against the current fork. All eight matched their refreshed source digests.

The telemetry request in #924 is already implemented with opt-in automatic reporting, per-incident consent, scrubbed diagnostic content, owner-bound expiring reports, idempotent retries, and per-user notification delivery. New client regression tests cover the default-off setting, explicit consent, expired reports, and transient retry behavior. Issue #925 is covered by base-path-aware IGDB search, with client and server checks for the configured `/Questarr` prefix. Focused validation passed 495 tests across nine files with no skips; typecheck, lint, format, and secret scanning passed. The production build was not repeated because this batch changed only tests and audit records; the prior build passed in Batch 79. See [Batch 80 validation evidence](evidence/validation-batch-80.md).

The ledger now records 670 verified, 221 superseded, 14 not applicable, 5 implemented-unverified, 0 needs-implementation, and 253 unreviewed items. PR #1194 remains the only source-changed record. The campaign remains incomplete and must not be merged to `main`.

## Batch 81 — October 14, 2026

Batch 81 reviewed PRs [#926](https://github.com/Doezer/Questarr/pull/926)–[#933](https://github.com/Doezer/Questarr/pull/933). All eight source digests matched the refreshed snapshot. Seven items are verified; the opt-in Windows installer request in #933 is implemented but remains unverified because the Inno Setup compiler could not be run here and available hosted runs skipped the optional installer job.

The batch verified qBittorrent 5.2+ torrent-file upload responses, scrubbed opt-in downloader diagnostics, the expanded Logs history, review fixes for diagnostics, the error-report issue URL, import mode reporting, and the three import/download fixes. The #932 port retains owner-scoped relinking and conditional state updates for QuestarrNG's multi-user model. Focused validation passed 829 tests across 18 files with no skips; TypeScript, lint, formatting, and secret scanning passed. The Windows service compiled for win-x64 with zero warnings and errors, but that does not verify the Inno Setup installer or its Windows lifecycle. No application source changed in this batch, so the production build and running-UI evidence were not repeated. See [Batch 81 validation evidence](evidence/validation-batch-81.md).

The ledger now records 677 verified, 221 superseded, 14 not applicable, 6 implemented-unverified, 0 needs-implementation, and 245 unreviewed items. PR #1194 remains the only source-changed record. The campaign remains incomplete and must not be merged to `main`.

## Batch 82 — October 14, 2026

Batch 82 reviewed PRs [#934](https://github.com/Doezer/Questarr/pull/934)–[#941](https://github.com/Doezer/Questarr/pull/941). All eight source digests matched the refreshed snapshot. Six records are verified; #936 was superseded because its API-fetch changes were already included in #935, and #937 was superseded by the later path-safety PR #940.

Review of #935 found a real secret-redaction gap in the logger: Pino's structured-field formatter did not see the final interpolated message or child-logger bindings. The fix in [logger.ts](../../server/logger.ts) applies the existing recursive/text redaction policy to the completed serialized record, and regression tests cover both message formatting and child bindings. The security assessment now documents the protection and its limits. The batch also verified the existing ignore rule, default-deny API boundary, cookie/CSRF auth, xREL timeout and nuke reason, bounded indexer capability discovery, IGDB edition canonicalization, root-folder scanning, and crawler protections.

Focused validation passed 585 tests across 29 Vitest files with no skips. TypeScript checking, lint, formatting, secret scanning, and the production build passed; the build reported only the existing large-chunk advisory. No `client/src/**` files changed, so running-UI screenshot evidence was not applicable. The task-scoped build scratch directory was removed and the pre-existing `dist/` directory restored. See [Batch 82 validation evidence](evidence/validation-batch-82.md).

The ledger now records 683 verified, 223 superseded, 14 not applicable, 6 implemented-unverified, 0 needs-implementation, and 237 unreviewed items. PR #1194 remains the only source-changed record. The campaign remains incomplete and must not be merged to `main`.

## Batch 83 — October 14, 2026

Batch 83 reviewed PRs [#942](https://github.com/Doezer/Questarr/pull/942)–[#943](https://github.com/Doezer/Questarr/pull/943), issue [#944](https://github.com/Doezer/Questarr/issues/944), and PRs [#945](https://github.com/Doezer/Questarr/pull/945)–[#949](https://github.com/Doezer/Questarr/pull/949). All eight source digests matched the refreshed snapshot. Seven items are verified; PR #947 is superseded by the fork’s stricter policy that always validates SABnzbd TLS certificates.

Issue #944 already had the requested 5,000-file and five-second scan caps, `{ files, truncated }` response, per-user rate limiter, and tests from upstream PR #955. QuestarrNG now streams directory entries and also caps the encoded response at 8 MiB and nesting depth at 128. The Files tab explains when a bounded scan returns a partial list. [Running-UI evidence](evidence/scan-limits-partial-files-tab.png) shows the notice alongside a returned file. The API and threat model document the scan limits, and downloader compatibility docs explain private-CA setup for SABnzbd. The batch also corrected PR #935’s earlier ledger wording: certificate verification is never disabled, including when the legacy `allowSelfSignedCertificate` field is true.

Focused validation passed 628 tests across 15 files with no skips. TypeScript, lint, formatting, secret scanning, and the production build passed; the build reported the existing large-chunk advisory. The app used port 5101 because port 5100 belonged to another process. The disposable server, database, script, and scratch directory were removed, the existing Playwright auth state and `dist/` were preserved, and no NFS scratch was used. See [Batch 83 validation evidence](evidence/validation-batch-83.md).

The ledger now records 690 verified, 224 superseded, 14 not applicable, 6 implemented-unverified, 0 needs-implementation, and 229 unreviewed items. PR #1194 remains the only source-changed record. The campaign remains incomplete and must not be merged to `main`.

## Batch 84 — October 31, 2026

Batch 84 reviewed PRs #950–#957 against the refreshed upstream snapshot. Four
items are verified using prior focused validation evidence (#950, #952, #953,
and #955); two dependency/action updates are superseded by current QuestarrNG
versions and the CodeQL removal directive (#956–#957). The category-fallback
provenance notice (#951) and cookie-first legacy-token migration (#954) are
implemented but await tests and browser evidence on a compatible private
ephemeral JIT runner.

The batch adds an explicit discovered/fallback category-source response
header, a localized accessible warning for provider fallback categories, and
regression coverage. Browser authentication now prefers the httpOnly cookie and
uses a legacy localStorage bearer only after an unauthorized cookie response.
Express test middleware mocks use Request, Response, and NextFunction types.
QuestarrNG workflow files no longer invoke CodeQL; the organization-wide audit
is still in progress.

The GitHub REST API was rate-limited during the live-run check, and no online
Linux x64 runner with the QuestarrNG labels was available. The active JIT
broker was left running; no workflow was dispatched or retried. The records
that need fresh validation remain implemented-unverified. See
[Batch 84 evidence](evidence/validation-batch-84.md).

## Batch 85 — October 31, 2026

Batch 85 reviewed PRs #958–#963. Five are verified against current QuestarrNG
behavior and prior passing evidence: the better-sqlite3 type update, support-log
secret redaction, clipboard fallback on plain HTTP, archive-password handling,
and indexer-priority sorting. PR #959 is superseded: upstream closed it because
#947 already fixed the same TLS issue, while QuestarrNG has removed the
certificate-verification bypass entirely. The #962 review also records the
maintainer's explicit decision to treat browser-to-Questarr TLS as a deployment
boundary; use a TLS-protected app URL when entering archive passwords.

The upstream checks passed for #958, #960–#963; #959 was closed without merge
after the owner linked #947. The previously implemented behaviors are covered
by focused validation in Batches 47, 58, 73, 79, 82, and 83. No source code
changed in Batch 85, so no new test job was started. The full current-head
validation gate remains outstanding, as do 298 unreviewed records and 44
source-changed records. See [Batch 85 evidence](evidence/validation-batch-85.md).

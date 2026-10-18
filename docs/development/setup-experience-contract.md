# Setup experience contract

Use QuestarrNG's existing `/setup` route and the tasks in
[Quick start](../QUICKSTART.md). The current first-run route creates the first
administrator, sets the interface language, and conditionally asks for IGDB
credentials when they are not already configured. The quick-start then covers
metadata provider choice, indexers/Prowlarr, downloader, library imports, and
optional notifications and RSS feeds. Keep those settings and actions as the
source of truth.

## Product-specific flow

First create the administrator and preserve the current language and IGDB
credential validation. Then guide the operator through the desired QuestarrNG
path: browse and track games, request/acquire releases, or organize completed
downloads. Ask for metadata-provider credentials only when needed for the
selected catalog. Ask about Prowlarr/indexers and a downloader only when the
operator wants acquisition. Ask about import paths only when they want
QuestarrNG to organize completed downloads.

Keep PC game details here: supported storefront/catalog identity, platform and
library organization, release selection, optional Playnite/RomM imports, and
SeerrNG request integration. ROM system assignment, DAT verification, and
emulator-oriented paths belong to ROMarrNG; book format questions do not
belong in QuestarrNG setup.

## Contract

- Extend the current `/setup` and the existing settings pages; do not add a
  second wizard or duplicate the provider model.
- Use setup status and configured-value flags already exposed by the server.
  Never return or display existing secrets to decide whether to prompt.
- Branch on the operator's chosen workflow and skip irrelevant provider,
  downloader, import, and notification steps.
- Prefill only from confirmed environment or saved configuration. Keep library
  imports and external account linking behind explicit user action.
- Test a provider before saving when the existing form supports it; retain the
  current server-side validation and error recovery.
- End with the existing settings summary and direct links to unfinished
  required tasks. Every choice remains editable in Settings.

The flow should help a new operator reach one useful outcome quickly, then
offer deeper game-management options where the existing product supports them.

## Implementation tasks

Keep the existing account bootstrap and QuestarrNG routes as the flow.

- [x] **Q1 — P1: Add outcome-specific next actions to setup completion.**
      In `client/src/pages/auth/setup.tsx`, replace the immediate generic
      post-setup landing with a small completion panel that links to the existing
      Discover, Indexers, Downloaders, and Library Import routes. Offer distinct
      choices to browse/catalog games, acquire releases, or organize existing
      downloads; use current configuration status to point acquisition users to
      the first missing indexer/downloader. Do not persist a second setup profile.
      **Done when:** account creation, language selection, and conditional IGDB
      validation still behave as today; each completion choice opens its existing
      page; a user can browse without setting up acquisition or imports.

- [x] **Q2 — P1: Make the existing indexer and downloader empty states explain
      their specific effect.** Update `client/src/pages/indexers.tsx`,
      `client/src/pages/downloaders.tsx`, and `docs/QUICKSTART.md` so a missing
      indexer explains why release search cannot run, a missing downloader
      explains why grabs cannot start, and both link to the current settings forms
      and connection tests.
      **Done when:** neither setup is presented as required for browsing the
      game catalog or importing files, and configuration errors return the
      operator to the same provider form.

- [x] **Q3 — P2: Split Quickstart into browse, acquire, and import paths.**
      Reorder `docs/QUICKSTART.md` around those three outcomes: metadata provider
      for catalog discovery, Prowlarr/indexers plus downloader for acquisition,
      and library-import settings for organizing completed files. Keep wishlist,
      RSS, notifications, Playnite, RomM, and SeerrNG links in the relevant
      optional branch.
      **Done when:** a new operator can follow only the branch they want, sees
      which capability each configuration enables, and encounters no book,
      audiobook, or ROM-specific questions in QuestarrNG.

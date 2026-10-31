# Indexers and Prowlarr

Add Torznab or Newznab indexers on the **Indexers** page, or connect Prowlarr
to sync several indexers at once. QuestarrNG also supports G4U for accounts
with access to its API. Configure a downloader before sending a release to it;
see [downloader compatibility](DOWNLOADERS_COMPATIBILITY.md).

## Add an indexer

Choose the indexer type, enter its base URL and API key, and save it. Use
**Test** to check the saved connection. Set categories and priority when the
indexer supports them. For a Prowlarr-managed tracker, use the final URL that
Prowlarr serves; QuestarrNG does not follow redirects during sync.

When you edit a Torznab or Newznab indexer, QuestarrNG loads the categories
reported by its provider. If the provider is unavailable or returns no
categories, QuestarrNG offers common game categories as suggestions and shows
a notice. Confirm that the provider supports those category IDs before
selecting them; the response body remains the same category list for API
clients.

Lower indexer priority numbers are preferred when results are sorted by
priority and when duplicate releases are reconciled. The priority control lets
you clear the number while entering a replacement; a blank draft keeps the
saved value, and the new value is normalized to the supported 1–100 range on
blur or Enter.

## Sync from Prowlarr

1. Open **Indexers → Sync from Prowlarr** and enter the Prowlarr URL and API key.
2. Set any defaults to apply to every synced indexer. Leave a default blank to
   keep the value Prowlarr or an existing indexer provides.
3. Choose **Sync** and review the result.

QuestarrNG encrypts the saved key and displays a mask. Leave the mask in place
to reuse the saved key for the same connection, or enter a new key when changing
the server. A trailing slash or equivalent HTTP URL spelling keeps the saved
key; a different host, path, or scheme needs its own key.

Use HTTPS whenever possible. For a trusted LAN connection over HTTP, explicitly
enable **Allow insecure LAN connection**. The default is off, and QuestarrNG
does not infer permission from an HTTP URL. Without consent it does not send the
API key over HTTP. Clearing consent revokes the matching synced indexers'
permission as part of the opt-out. See [credential handling](SECRETS.md) for
details.

When Prowlarr is behind a TLS proxy, QuestarrNG normalizes recognized proxy
download links to the configured Prowlarr origin. External tracker links keep
using Prowlarr's proxy.

## Search and release blacklists

Discover and Search use enabled indexers to find releases. From a game's
details, **Download** or **Send to downloader** adds an untracked game to your
library as **Wanted** before sending the release. **Blacklist release** adds the
game if needed and hides that release from later searches.

Manage blocked release names and per-release blacklists under
**Settings → Discovery & Downloads → Release Blacklist**. Term edits take
effect after **Save Blacklist**; removing one specific release takes effect
immediately. A blacklist applies to manual and automatic searches.

For operator-selected Hydra-format JSON sources, see
[JSON catalogs](JSON_CATALOGS.md). They join search results but do not certify a
release as safe.

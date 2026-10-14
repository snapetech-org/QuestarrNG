# SeerrNG integration

QuestarrNG is a maintained fork of [Questarr](https://github.com/Doezer/Questarr)
for PC game acquisition requested through
[SeerrNG](https://github.com/snapetech/seerrng). SeerrNG owns its catalog
browsing and request workflow, approval, quotas, request ownership, and
requester notifications. QuestarrNG supplies IGDB catalog data and handles PC
acquisition. The provider contract adds durable external request correlation,
selected PC variant tracking, status readback, and authenticated delivery of
imported files while the two apps remain separate services.

For the SeerrNG-side setup, target selection, approval flow, and requester
download behavior, see [SeerrNG's software requests guide](https://github.com/snapetech-org/seerrng/blob/main/docs/using-seerr/software-acquisition.md).

The integration extends rather than replaces the legacy
[`/api/integration`](API.md#integration-api-external-clients) contract. Existing
Playnite clients keep their current routes and payloads.

## Authentication

Use a QuestarrNG integration API key or JWT from SeerrNG's server. Send the
key in `X-Api-Key` or as `Authorization: Bearer`. Never send QuestarrNG
credentials to the browser. All responses are `Cache-Control: no-store` and
all request, status, and asset operations are scoped to the authenticated
QuestarrNG user. Integration requests are limited to 300 per minute per key
(or per authenticated user for JWT callers), in addition to the app-wide
per-IP rate limit.

Create a dedicated key with **SeerrNG provider only** access. New keys expire
automatically (90 days by default, configurable up to one year); a SeerrNG-only
key is denied access to legacy integration routes. Existing keys keep their
current all-integration access until revoked. The canonical machine-readable
contract is [`contracts/seerrng-v2.openapi.yaml`](contracts/seerrng-v2.openapi.yaml).

## Handshake

`GET /api/integration/seerrng/v1/ping`

```json
{
  "service": "QuestarrNG",
  "version": "<installed-version>",
  "apiVersion": 1,
  "requestContractVersion": 2,
  "capabilities": {
    "catalog": true,
    "pcAcquisition": true,
    "emulationAcquisition": false,
    "requestActions": { "retry": true, "cancel": true },
    "assetStreaming": true
  }
}
```

SeerrNG should reject an unknown request contract version before dispatching
requests.

### Current capability status

QuestarrNG advertises `apiVersion: 1` and `requestContractVersion: 2`. It
reports catalog, PC acquisition, retry/cancel, and asset-streaming support in
its handshake, with emulation acquisition set to false. The request asset-list
response advertises `bundleSupported: true` and `bundleName` when at least two
deliverable files are registered; a single-file request continues to use the
individual asset stream route. Current provider behavior is defined by the
[v2 OpenAPI contract](contracts/seerrng-v2.openapi.yaml).

SeerrNG v3.51.0 adds PC play-time and multi-file download behavior using
request contract v2. QuestarrNG's v2 bundle route streams a gzip-compressed tar
archive through the authenticated provider connection. See the
[SeerrNG release note](https://github.com/snapetech-org/seerrng/blob/main/release-notes/questarr-catalog-estimates-and-bundles.md).

## Compatibility and release discipline

The `/v1` route prefix and `apiVersion` identify the provider API surface;
`requestContractVersion` tracks the persisted request lifecycle semantics.
SeerrNG should gate optional behavior on the advertised capabilities. Additive
fields and optional routes stay in v1; changing a required field, status
meaning, idempotency rule, or retry/cancel behavior requires an intentional
contract-version change and an updated OpenAPI document. Keep the legacy
`/api/integration` routes available for existing clients.

Changes that need a SeerrNG consumer update should be coordinated across both
repositories and include a consumer-side compatibility check. The provider
contract tests in this repository verify QuestarrNG's routes and handshake;
they do not replace testing the matching SeerrNG consumer build. The two apps
remain separate services: SeerrNG owns approval, quotas, and requester access,
while QuestarrNG owns PC acquisition and registered asset streaming.

## Catalog

These read-only routes let SeerrNG use the IGDB credentials already configured
in QuestarrNG without exposing them to the browser. Responses use the same
normalized game shape as QuestarrNG's discovery API, including the stable IGDB
ID, artwork, release date, genres, and platform IDs and names. The authenticated
QuestarrNG account's content filters apply to game search and detail results.

| Method | Path                                                 | Query                                                  | Result                      |
| ------ | ---------------------------------------------------- | ------------------------------------------------------ | --------------------------- |
| GET    | `/api/integration/seerrng/v1/catalog/search`         | `q` required, 1–200 characters; `limit` optional, 1–50 | Matching catalog games      |
| GET    | `/api/integration/seerrng/v1/catalog/popular`        | `limit` optional, 1–50                                 | Popular catalog games       |
| GET    | `/api/integration/seerrng/v1/catalog/platforms`      | —                                                      | IGDB platform IDs and names |
| GET    | `/api/integration/seerrng/v1/catalog/games/{igdbId}` | Positive IGDB game ID in path                          | One catalog game            |

The platform list is metadata only. SeerrNG owns its Retro and Modern group
classification and decides which platform IDs are requestable through each
configured acquisition provider.

Paged catalog routes are also available: `catalog/search-page` accepts a
query, cursor, platform IDs, genre, and release year; `catalog/popular-page`
accepts an offset and the same filters. `catalog/games/{igdbId}` includes
bounded screenshots, video IDs, rating, publishers, and developers.

## Submit and reconcile a request

`POST /api/integration/seerrng/v1/requests`

```json
{
  "externalRequestId": "seerrng:request:123",
  "title": "Example Game",
  "variant": {
    "operatingSystem": "windows",
    "architecture": "x64"
  }
}
```

Both variant fields are required. Supported operating systems are `windows`,
`linux`, and `macos`; supported architectures are `x64`, `arm64`, `x86`, and
`universal`. The requested variant is recorded in the durable request ledger
and on its linked game. Automatic search filters explicit release markers.
Linux and macOS requests require a matching marker. Unmarked PC releases may
be used for Windows when they do not explicitly identify Linux or macOS.
Explicit architecture markers must match; an unmarked release is not used for
an ARM64 request.

`externalRequestId` is an idempotency key scoped to the authenticated user and
persisted across restarts. A new request returns `201`; replaying the same ID,
title, and variant returns its current state (`200`). Reusing an ID with a
different title or variant returns `409`. No matching PC catalog title returns
`404`, and a game already linked to another request returns `409`. A matching
title already in the user's collection is bound only when Questarr can
reconcile it to an active acquisition or verified files.

The response contains the external ID, title, selected variant, linked game
summary, status, `deliverable`, and a safe error message where applicable. It
never contains a filesystem path, downloader credential, indexer URL, or
release download URL.

`GET /api/integration/seerrng/v1/requests/{externalRequestId}` returns the
current status. SeerrNG may poll this route to reconcile after either service
restarts. Status values are:

| Status        | Meaning                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| `accepted`    | The request record exists but has not been dispatched.                      |
| `searching`   | Questarr is waiting for its normal search pipeline.                         |
| `downloading` | A tracked download is active.                                               |
| `importing`   | A completed download is being imported.                                     |
| `available`   | At least one imported game file is present and deliverable.                 |
| `failed`      | The request or latest acquisition failed or could not be safely reconciled. |
| `cancelled`   | The request was cancelled; imported files are retained.                     |

`POST /api/integration/seerrng/v1/requests/{externalRequestId}/retry` starts a
new attempt when the request is neither cancelled nor already available and
has no active operation. If Questarr restarted during an untracked download
handoff, the API returns `409` and requires
`{"confirmNoExistingDownload":true}` after the queue and history are checked.
`POST /api/integration/seerrng/v1/requests/{externalRequestId}/cancel` stops
only downloads safely attributed to that request and retains imported files.
Both routes return `409` when an active download cannot be safely attributed.
Replays of the original POST never create another external request record.

## List and stream imported files

`GET /api/integration/seerrng/v1/requests/{externalRequestId}/assets` returns
files registered to the linked game and currently present inside that user's
configured library root:

```json
{
  "assets": [
    {
      "id": "opaque-game-file-id",
      "name": "Example Game.zip",
      "size": 734003200,
      "url": "/api/integration/seerrng/v1/requests/seerrng%3Arequest%3A123/assets/opaque-game-file-id"
    }
  ],
  "bundleSupported": true,
  "bundleName": "Example Game.tar.gz",
  "bundleUrl": "/api/integration/seerrng/v1/requests/seerrng%3Arequest%3A123/assets/bundle"
}
```

The asset route rechecks request ownership, file registration, and library-root
containment, then streams a single file with a safe attachment filename,
`Cache-Control: no-store`, and single-range byte support. Asset IDs are
request-scoped by lookup: an ID from another game or request is not accepted.
When at least two registered files remain inside the configured library root,
the bundle route streams a gzip-compressed TAR archive from those same files.
Archive entries use safe basenames, duplicate names receive numeric suffixes,
and the response does not buffer the files in memory.

SeerrNG must authorize its own request before using this API, then proxy the
stream through its requester-scoped download route. The browser receives only
SeerrNG's URL and never sees QuestarrNG credentials or internal paths.

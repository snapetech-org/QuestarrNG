# Dependency Management

This document describes how QuestarrNG selects, obtains, and tracks its dependencies.

## Selection

Dependencies are added deliberately as part of normal development, via `npm install`, and land in `package.json` alongside the feature or fix that needs them. Preference is given to actively maintained, widely used packages already common in the Node/React ecosystem. New dependencies go through the same pull request review process as any other code change (see [`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md)) before merging to `main`.

## Obtaining dependencies

- Packages are installed from the public [npm registry](https://www.npmjs.com/).
- `package-lock.json` is committed to the repository and used for reproducible installs — the exact resolved version of every direct and transitive dependency is pinned.
- The `packageManager` field in `package.json` pins the npm version used to install and build the project.
- CI installs that CLI using `node scripts/install-npm-runtime.mjs`. The registry
  artifact is pinned by its SHA-512 integrity in `.github/npm-runtime/package.json`;
  only its CLI source is extracted. Its bundled dependency copies are excluded.
  The CLI's dependencies are installed separately from
  `.github/npm-runtime/package-lock.json`, with patched overrides for
  `brace-expansion`, `http-cache-semantics`, `ip-address`,
  `postcss-selector-parser`, and `undici`. The installer verifies that every
  installed direct dependency satisfies the CLI's declared version range.
  This preserves npm 11.21.0 and Node 22.19.0 compatibility while replacing
  vulnerable bundled copies that normal npm overrides cannot change.
  Both CI and the validation engine audit this separate runtime at all severities.
- `global.json` pins the .NET SDK used to build the Windows service; Dependabot tracks SDK servicing releases with the `dotnet-sdk` ecosystem.
- Apprise runtime packages are hash-locked in `requirements/apprise.txt`, and the Semgrep scanner plus its transitive dependencies are hash-locked in `.github/requirements/semgrep.txt` from `.github/requirements/semgrep.in`. Dependabot tracks both pip lock files. The Semgrep lock keeps its bundled MCP integration on the v1 API until the pinned scanner supports v2.
- The `allowScripts` field in `package.json` explicitly allowlists which packages are permitted to run install-time (postinstall) scripts. It's npm's own native field (npm ≥ 11.16.0), managed via `npm approve-scripts` / `npm deny-scripts`, not a third-party tool — today it's advisory (npm flags unreviewed scripts but still runs them), with a future npm release expected to block unapproved scripts by default. Any package added here should have a concrete reason (e.g. a native module that needs to compile a binary during install).
- The `overrides` field forces a specific version of a transitive dependency when a direct dependency's own declared range still permits a vulnerable release:
  - `socket.io-parser: 4.2.7` patches [CVE-2026-33151](https://github.com/socketio/socket.io/security/advisories/GHSA-677m-j7p3-52f9) (resource exhaustion via unbounded binary attachments). Needed because `socket.io`/`socket.io-client` declare `socket.io-parser: ~4.2.4`, a range that still allows the unpatched 4.2.4/4.2.5.
  - `@esbuild-kit/core-utils`'s `esbuild` dependency is bumped to `^0.25.0` to patch the esbuild dev-server request-forwarding issue ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)). Needed because `drizzle-kit` pulls in `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils`, which pins `esbuild: ~0.18.20`.
  - `qs: ^6.16.0` patches [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) (DoS via attacker-controlled `isBuffer`, affecting `>=2.2.5 <6.16.0`) and [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) (array-limit bypass via bracket-key comma parsing, affecting `>=6.14.2 <=6.15.3`). Needed because `body-parser`, `openid`, `steam-web`, and `superagent` still permit vulnerable releases; Express 5's newer ranges do not remove the need for the override.
  - `brace-expansion: ^5.0.12` patches [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) (DoS via unbounded intermediate arrays), the [CVE-2026-14257](https://github.com/advisories/GHSA-mh99-v99m-4gvg) mitigation, and the newer recursion and quadratic-time DoS advisories [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), and [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p). The override keeps `archiver`'s `readdir-glob`/`minimatch` dependency chain on a patched release.
  - `fast-uri: ^3.1.8` patches [CVE-2026-16221](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx), four HIGH advisories fixed in 3.1.6, and the host-normalization issue [GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj). Needed because `ajv@8.20.0`'s own declared range (`^3.0.1`, then `^3.1.5`) kept allowing an unpatched release. `ajv` is a shared transitive dependency of both `secretlint` (dev-only) and the production `@hookform/resolvers` (as a `peerOptional` dependency), so `fast-uri` is reachable in production — confirmed by `npm audit --omit=dev`.
  - `fast-copy: ^4.1.0` patches [GHSA-jggr-w7fw-pc2j](https://github.com/advisories/GHSA-jggr-w7fw-pc2j), a stack-exhaustion denial of service. Needed because `pino-pretty` still permits the affected `4.0.x` range.
  - `source-map-js: ^1.2.2` patches [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), an event-loop denial of service through indexed source-map offsets. This override covers the Tailwind/Vite and test-tool dependency trees that still resolve `1.2.1`.
  - `proxy-addr: ^2.0.8` patches [CVE-2026-90711](https://vuldb.com/cve/CVE-2026-90711) ([AIKIDO-2026-101201](https://security.aikido.dev/cve/AIKIDO-2026-101201), critical: accepts undersized IPv4-mapped IPv6 trust subnets, letting unauthenticated clients spoof `X-Forwarded-For` and bypass IP-based access controls, rate limiting, and audit logging), affecting `>=1.1.0 <=2.0.7`. Needed because `express` pins `proxy-addr: ~2.0.7`, which had not yet bumped its declared range to include the patched `2.0.8`.
  - `ip-address: ^10.7.2` patches [CVE-2026-101913](https://github.com/advisories/GHSA-rpw4-54j3-4h4q) and [CVE-2026-101910](https://github.com/advisories/GHSA-2vr4-cq9g-pvrc) (affecting `<=10.5.0`). Needed because `express-rate-limit` (`^10.2.0`) and `socks` (`^10.1.1`) still allow a vulnerable release.
  - `eslint-plugin-react`'s `eslint` dependency is bumped to `^10.9.1` to allow ESLint v10 support. Needed because `eslint-plugin-react@7.37.2` officially supports only up to `eslint@^9.7`, but the linting rules in ESLint v10 are stricter and require updating the codebase to comply. This override is temporary — once `eslint-plugin-react` releases a new major version with official ESLint v10 support, it can be removed.
  - `http-cache-semantics` is absent from the application dependency graph. The separate CI npm runtime uses the patched upstream 4.3.0 release. Its reviewed source is retained at [`vendor/http-cache-semantics`](../vendor/http-cache-semantics), copied from proposed upstream commit [`11fb104`](https://github.com/Sergey360/http-cache-semantics/commit/11fb104275349bbd84bf21eafd40b18220c29c46) in still-open upstream PR [#60](https://github.com/kornelski/http-cache-semantics/pull/60), and exercised directly by `server/http-cache-semantics.security.test.mjs`. QuestarrNG's former consumer was the removed license-checking toolchain, so the cache library no longer needs to be in the application dependency graph. `check:overrides` fails if it returns to the lockfile until a patched upstream release or an explicit safe integration is in place.
  - `@tailwindcss/typography` was removed because no application styles use its `prose` plugin and its pinned `postcss-selector-parser` dependency remained vulnerable to GHSA-rj75-hqrm-r3gf.
  - The `@lizenz/checker` dev tool was removed because its install/registry dependency chain produced the 11 HIGH-severity package findings in full `npm audit`. `check:licenses` now uses npm's `.prod` dependency selector and the same explicit SPDX allow-list, without adding another dependency resolver. Unknown or missing licenses still fail the check; this does not suppress or accept npm audit findings.
  - All of the above should be revisited (and likely removed) once the upstream packages bump their own internal dependency ranges past the vulnerable versions.
  - The `check-overrides` CI job (`npm run check:overrides`, see [`scripts/check-overrides.mjs`](../scripts/check-overrides.mjs)) checks this automatically on every PR and fails once an override is no longer needed, so there's no need to track removal manually.

## Tracking and updates

[Dependabot](https://docs.github.com/en/code-security/dependabot) is configured in [`.github/dependabot.yml`](../.github/dependabot.yml) for npm, NuGet, the .NET SDK, Docker images, GitHub Actions, and the two hash-pinned Python dependency sets. npm, NuGet, .NET SDK, Actions, and Python updates run weekly; Docker image updates run daily:

- Version updates are opened as grouped pull requests (e.g. React-related packages, Radix UI components, dev vs. production dependencies, and all GitHub Actions bumps). Security updates are grouped by ecosystem as well.
- Semver-major bumps are proposed automatically like any other update rather than excluded, since silently skipping them meant a major-version-only security fix could go unnoticed; they aren't folded into the minor/patch groups, so they still land as their own PR and get individual review.
- TypeScript 7 updates are temporarily ignored because `typescript-eslint@8.70.1` and `@typescript-eslint/parser@8.70.1` currently declare TypeScript peer support below 6.1. Dependabot will resume proposing TypeScript majors after the parser peer range supports them.
- Every dependency-update PR runs through the same CI gate as any other change — lint, type check, the full test suite, and a Docker build (see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) — before it can be merged.

## Release-time visibility

Every published Docker image ships with a generated Software Bill of Materials listing the exact versions of every dependency included in that release. See [docs/SBOM.md](SBOM.md) for how to inspect it.

## Currently blocked updates

Tracked here so a blocked Dependabot PR doesn't get silently re-proposed and re-investigated from scratch. Remove an entry once its update is unblocked and merged.

_Reviewed 2026-10-06 against `main` at v1.9.2: the older React 19 and resolver blockers recorded against the v1.4.0 release branch are resolved._

- **TypeScript 7** — remains blocked by the current TypeScript ESLint parser peer range (`typescript <6.1.0`). QuestarrNG currently uses TypeScript 6.0.3; revisit when `typescript-eslint` and `@typescript-eslint/parser` support TypeScript 7.

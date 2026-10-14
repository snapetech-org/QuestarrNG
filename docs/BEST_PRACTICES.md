# OpenSSF Best Practices Evidence for QuestarrNG

This document records repository evidence for the [OpenSSF Best Practices Badge](https://www.bestpractices.dev/)
criteria relevant to QuestarrNG. It describes the `snapetech-org/QuestarrNG` fork as
it stood on **2026-10-12**. It is an evidence ledger, not a submitted OpenSSF
profile or a claim that every criterion is met.

QuestarrNG is derived from [Doezer/Questarr](https://github.com/Doezer/Questarr),
but the two repositories have separate maintainers, issue trackers, release
histories, and review records. Upstream activity is not counted as QuestarrNG
evidence here.

## [report_responses]

**Status: Not yet assessable from QuestarrNG history.**

The fork was created on 2026-09-25. At this assessment, its issue tracker has no
issues, and the repository has not existed for the full 2-to-12-month response
window. There are no QuestarrNG bug reports in that window from which to measure
acknowledgement. The response statistics previously recorded for Doezer/Questarr
are upstream-only and do not apply to this criterion for QuestarrNG.

Evidence: [QuestarrNG issue tracker](https://github.com/snapetech-org/QuestarrNG/issues)
and [repository](https://github.com/snapetech-org/QuestarrNG).

## [enhancement_responses]

**Status: Not yet assessable from QuestarrNG history.**

The fork has no issue history covering the criterion's 2-to-12-month window, so
there are no QuestarrNG enhancement requests on which to assess responses. The
enhancement statistics previously recorded for Doezer/Questarr are upstream-only
and are not attributed to this fork.

Evidence: [QuestarrNG issue tracker](https://github.com/snapetech-org/QuestarrNG/issues).

## [warnings_strict]

**Status: Met.**

- [`tsconfig.json`](../tsconfig.json) enables TypeScript `strict` mode and the
  additional checks `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch`, `noImplicitReturns`,
  `exactOptionalPropertyTypes`, and `noUncheckedIndexedAccess`.
- [`eslint.config.js`](../eslint.config.js) includes recommended JavaScript and
  TypeScript rules plus project-specific rules. Some rules are warnings, but
  `npm run lint` invokes ESLint with `--max-warnings 0`, so a warning fails the
  command.
- [`package.json`](../package.json) defines `check` as `tsc` and `lint` as the
  zero-warning ESLint command. The CI workflow runs both as blocking checks for
  pushes and pull requests.

Evidence: [`ci.yml`](../.github/workflows/ci.yml),
[`tsconfig.json`](../tsconfig.json),
[`eslint.config.js`](../eslint.config.js), and
[`package.json`](../package.json).

## [dynamic_analysis]

**Status: Routine analysis is active; release-specific timing is recorded below.**

[`dast.yml`](../.github/workflows/dast.yml) builds and starts the production
server, waits for its health endpoint, and runs the OWASP ZAP baseline scan
against that live instance. It runs on pushes to `main` and `release/*`, weekly,
and by manual dispatch. `fail_action: true` makes unignored scan alerts fail the
workflow; accepted rule IDs and their rationale are recorded in
[`.zap/rules.tsv`](../.zap/rules.tsv).

The successful DAST run on the `main` commit for v1.9.1 is
[run 37546640378](https://github.com/snapetech-org/QuestarrNG/actions/runs/37546640378).
The v1.9.1 release was published at 23:17 UTC on 2026-10-06, and this run
started at 23:27 UTC. It is evidence of routine scanning, not evidence that the
scan completed before that release was published. No major release occurred in
this evidence period.

## [dynamic_analysis_enable_assertions]

**Status: Met.**

The project uses Vitest for unit and integration tests. The CI workflow runs
`npm test -- --coverage`; failing assertions or configured coverage thresholds
fail the job. Vitest is a development dependency, and the production
[`Dockerfile`](../Dockerfile) runs `npm prune --omit=dev` before assembling the
runtime image, keeping the test framework out of the shipped application.

Evidence: [`ci.yml`](../.github/workflows/ci.yml),
[`package.json`](../package.json), [`vitest.config.ts`](../vitest.config.ts),
and [`Dockerfile`](../Dockerfile).

## [dynamic_analysis_fixed]

**Status: Enforcement is active; see the limits below.**

The DAST workflow uses `fail_action: true` and a checked-in ZAP rules file.
[`docs/VULNERABILITY_MANAGEMENT.md`](VULNERABILITY_MANAGEMENT.md) records the
triage process and ZAP rule dispositions. Its initial-scan narrative is dated
before the QuestarrNG repository was created, so it is inherited baseline
history rather than a QuestarrNG-originated finding report. The current fork
also retains the documented limitation that ZAP rule 10055 covers both the
accepted `style-src unsafe-inline` alert and the wildcard-directive check. The
latter has a compensating regression assertion in
[`server/__tests__/security.test.ts`](../server/__tests__/security.test.ts).
The latest successful fork-hosted DAST run is linked under
[`dynamic_analysis`](#dynamic_analysis).

This evidence describes the configured gate and recorded dispositions; it does
not claim that dynamic analysis can discover every exploitable vulnerability.
The rule-level suppression and its compensating test should be reviewed if ZAP
changes its alert IDs or behavior.

## Current OpenSSF Scorecard findings

These repository-level findings are separate from the Badge criteria above.
They were open in GitHub Code Scanning at the assessment date:

| Finding                                                                                     | Fork-specific evidence and status                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [BranchProtectionID #1](https://github.com/snapetech-org/QuestarrNG/security/code-scanning/1)   | Protection was absent at the start of the 2026-10-12 audit. It was restored through GitHub's API: one approval, approval of the latest push, stale-review dismissal, administrator enforcement, strict required checks, conversation resolution, and no force pushes or deletion. A fresh Scorecard run must confirm closure.                                                                                                            |
| [VulnerabilitiesID #93](https://github.com/snapetech-org/QuestarrNG/security/code-scanning/93)  | The locked CI npm artifact bundled vulnerable dependencies even though the application lockfile audited cleanly. `install-npm-runtime.mjs` now excludes bundled copies and installs a separately locked patched graph. Both lockfiles audit with zero vulnerabilities locally. The runtime changes require merge and a fresh Scorecard scan before this finding is fixed on main.                                                        |
| [CodeReviewID #10](https://github.com/snapetech-org/QuestarrNG/security/code-scanning/10)       | The scanner reports 0/16 approved changesets in the existing history. Future PRs require an independent approving review with no administrator bypass. As of 2026-10-12, GitHub lists only `snapetech` as a collaborator. Another human reviewer is needed; AI reviews and retrospective approvals do not satisfy this check.                                                                                                            |
| [MaintainedID #11](https://github.com/snapetech-org/QuestarrNG/security/code-scanning/11)       | GitHub records repository creation as 2026-09-25T23:50:31Z. Scorecard requires more than 90 days of repository history, so the earliest age-based reassessment is after 2026-12-24T23:50:31Z. Releases and CI demonstrate current activity, but cannot change repository age. This finding remains open rather than claiming the maturity check was fixed.                                                                               |
| [CIIBestPracticesID #12](https://github.com/snapetech-org/QuestarrNG/security/code-scanning/12) | The [OpenSSF profile](https://www.bestpractices.dev/en/projects/15269/passing) is 94% complete. The maintainer's secure-design and common-web-security-error knowledge attestations were submitted on 2026-10-12 and independently verified through the public profile JSON. The JWT minimum-key-length gap is addressed in the security PR, pending merge. Remaining time-window and cryptography criteria must be answered accurately. |

### Secure development knowledge

On 2026-10-12, the maintainer explicitly confirmed that at least one primary
developer understands secure software design and common web security flaws and
their mitigations. This supports `know_secure_design` and `know_common_errors`;
it is a maintainer attestation, not a conclusion inferred from generated code.
Supporting public technical evidence includes [THREAT_MODEL.md](THREAT_MODEL.md),
[SECURITY_ASSESSMENT.md](SECURITY_ASSESSMENT.md), and regression tests for SSRF,
path traversal, CSRF, authentication boundaries, and secret redaction.
Both knowledge criteria are now recorded as `Met` in the public OpenSSF profile.
The unknown response-history and forward-secrecy criteria remain unknown;
`crypto_keylength` remains unmet until the code enforcement reaches `main`.

### JWT key length

The security PR enforces a minimum of 32 UTF-8 bytes for `JWT_SECRET` and rejects
the known legacy default without logging supplied values. Weak database-stored
keys are replaced with 64 random bytes on first use; strong stored keys are
preserved. After merge this supplies code-level evidence for `crypto_keylength`.
See [SECRETS.md](SECRETS.md#2-authentication-secret-jwt_secret) and
`server/__tests__/config.test.ts` / `jwt-secret-rotation.test.ts`.

The live `main` branch requires the 11 current PR checks: release notes, SCA,
Windows service publishing, unit tests, the minimum-Node build, validation-receipt
reconciliation, three CodeQL language jobs, Semgrep, and Playwright. Review and
check requirements apply to administrators. See [branch protection
settings](https://github.com/snapetech-org/QuestarrNG/settings/branches).

The security PR also gates versioned image publication, GitHub release publication,
and release recovery on zero open security-relevant Code Scanning and Dependabot
alerts plus successful CI, CodeQL, SAST, DAST, image-scan, and Scorecard checks
for the release commit. Historical Scorecard maturity and review indicators stay
visible; independent approvals are enforced by branch protection.
See [VULNERABILITY_MANAGEMENT.md](VULNERABILITY_MANAGEMENT.md#13-pre-release-gate).

## Repository evidence index

- Project identity, fork changes, and user support: [README](../README.md)
- Security reporting and access policy: [SECURITY.md](SECURITY.md)
- Threat model and security risk assessment: [THREAT_MODEL.md](THREAT_MODEL.md),
  [SECURITY_ASSESSMENT.md](SECURITY_ASSESSMENT.md)
- Vulnerability triage and scan policy: [VULNERABILITY_MANAGEMENT.md](VULNERABILITY_MANAGEMENT.md)
- API and integration contract: [API.md](API.md) and
  [OpenAPI contract](contracts/seerrng-v1.openapi.yaml)
- License: [COPYING](../COPYING)
- Current release history: [CHANGELOG.md](CHANGELOG.md) and
  [GitHub releases](https://github.com/snapetech-org/QuestarrNG/releases)
- CI, CodeQL, SAST, DAST, and Scorecard workflows: [workflow directory](../.github/workflows)

**Update this record** when the repository's public history, CI/security gates,
or the cited criteria evidence changes. Recheck time-window criteria against
QuestarrNG's own issue tracker; do not substitute upstream statistics.

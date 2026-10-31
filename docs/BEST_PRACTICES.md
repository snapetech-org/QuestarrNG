# OpenSSF Best Practices Evidence for QuestarrNG

This document records repository evidence for the [OpenSSF Best Practices Badge](https://www.bestpractices.dev/)
criteria relevant to QuestarrNG. It describes the `snapetech-org/QuestarrNG` fork as
it stood on **2026-10-14**. It is an evidence ledger, not a submitted OpenSSF
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

**Status: Met.**

[`dast.yml`](../.github/workflows/dast.yml) builds and starts the production
server, waits for its health endpoint, and runs the OWASP ZAP baseline scan
against that live instance. It runs on pushes to `main` and `release/*`, weekly,
and by manual dispatch. `fail_action: true` makes unignored scan alerts fail the
workflow; accepted rule IDs and their rationale are recorded in
[`.zap/rules.tsv`](../.zap/rules.tsv).

The v1.9.1 DAST run started after publication, so it is not cited as
pre-release evidence. Since then, the version-tag workflow has required a
successful OWASP ZAP check on the exact tagged commit before it builds and
publishes a versioned image or GitHub release. The latest successful main scan
is [run 38654596755](https://github.com/snapetech-org/QuestarrNG/actions/runs/38654596755)
on commit `858e81c64d49fcf75bfa0ee17b93f5f705a2174e`.

## [dynamic_analysis_unsafe]

**Status: Met.**

The Home Assistant ownership helper is compiled and exercised with AddressSanitizer
and UndefinedBehaviorSanitizer in a disposable fixture. The test checks argument
rejection, nested-file traversal, physical symlink handling, error handling, and
the ownership callback without changing any real data. The CI workflow
compiles the production helper and runs this contract with the required
sanitizer toolchain on a private Linux JIT runner.

Evidence: [`fix-data-owner.c`](../questarr/fix-data-owner.c), the
[test-only `lchown` wrapper](../questarr/fix-data-owner-test-wrap.c),
[sanitizer contract](../tests/contracts/home-assistant-data-owner-sanitizers.contract.mjs),
[`ci.yml`](../.github/workflows/ci.yml).

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

For Batch 68, a local ZAP 2.17.0 baseline scan of the production build on
campaign commit `8e393aa3` used the checked-in rules and returned zero new
WARN/FAIL alerts (62 PASS, 5 IGNORE). The production-bundle syntax check also
passed. The matching GitHub-hosted follow-up run
[38472863000](https://github.com/snapetech-org/QuestarrNG/actions/runs/38472863000)
was queued at the time of recording; the prior linked workflow remains the
latest successful hosted scan. Full details are in the
[Batch 68 validation record](upstream-resolution/evidence/validation-batch-68.txt).

This evidence describes the configured gate and recorded dispositions; it does
not claim that dynamic analysis can discover every exploitable vulnerability.
The rule-level suppression and its compensating test should be reviewed if ZAP
changes its alert IDs or behavior.

## [crypto_tls12]

**Status: Met.**

Questarr's built-in HTTPS listener explicitly sets `minVersion` to `TLSv1.2`.
Node.js documents TLS 1.2 as its default minimum and the application now pins
that floor in its server options so a runtime-wide setting cannot lower it.

Evidence: [`createHttpsServerOptions`](../server/ssl.ts), its
[regression test](../server/__tests__/ssl.test.ts), and the
[Node.js TLS documentation](https://nodejs.org/api/tls.html).

## [crypto_pfs]

**Status: Met.**

The built-in HTTPS listener does not replace Node.js's default cipher
configuration. Node.js documents that its default suite prefers ECDHE and DHE
for forward secrecy and that TLS 1.3 uses ephemeral key agreement by default.
The listener now explicitly requires TLS 1.2 or newer.

Evidence: [`server/index.ts`](../server/index.ts),
[`createHttpsServerOptions`](../server/ssl.ts), and the
[Node.js TLS documentation](https://nodejs.org/api/tls.html#perfect-forward-secrecy).

## Current OpenSSF Scorecard findings and disposition

These repository-level findings are separate from the Badge criteria above.
The recorded main-branch scan completed on 2026-10-14. At that time, CodeQL,
Dependabot, and secret-scanning alert lists were clear; the remaining Code Scanning alerts are
Scorecard process and maturity metrics, not identified vulnerable source code.

| Finding                                                                                         | Fork-specific evidence and status                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CI-Tests #149](https://github.com/snapetech-org/QuestarrNG/security/code-scanning/149)         | [Scorecard run 38660675071](https://github.com/snapetech-org/QuestarrNG/actions/runs/38660675071) on main commit `abaf9a0ab4a69997a48b58c7696122f8c6e87b67` reports CI tests for 21 of 22 sampled merged pull requests (score 9/10). Branch protection requires current test and build checks for protected merges; the remaining miss is historical and does not identify a current failing test. |
| [SAST #148](https://github.com/snapetech-org/QuestarrNG/security/code-scanning/148)             | The same Scorecard run reports SAST for 28 of the 30 sampled commits (score 9/10). The SAST workflow is active and passed on that main commit; the remaining score reflects its sampled history.                                                                                                                                                                                                   |
| [CodeReviewID #10](https://github.com/snapetech-org/QuestarrNG/security/code-scanning/10)       | Scorecard reports 0/13 approved changesets. The maintainer accepted the single-maintainer process and dismissed this historical process alert as `won't fix`; PRs still require all configured status checks and conversation resolution. AI review is advisory and is not represented as independent human approval.                                                                              |
| [MaintainedID #11](https://github.com/snapetech-org/QuestarrNG/security/code-scanning/11)       | GitHub records repository creation as 2026-09-25T23:50:31Z. Scorecard requires more than 90 days of repository history, so the earliest age-based reassessment is after 2026-12-24T23:50:31Z. Releases and CI demonstrate current activity, but cannot change repository age.                                                                                                                      |
| [CIIBestPracticesID #12](https://github.com/snapetech-org/QuestarrNG/security/code-scanning/12) | The [OpenSSF profile](https://www.bestpractices.dev/en/projects/15269/passing) is 97% complete and still `in_progress`. The project has corrected the repository URLs and 61 stale evidence links. The remaining profile answers require an authorized owner to record current evidence and the new repository history.                                                                            |

### Secure development knowledge

On 2026-10-12, the maintainer explicitly confirmed that at least one primary
developer understands secure software design and common web security flaws and
their mitigations. This supports `know_secure_design` and `know_common_errors`;
it is a maintainer attestation, not a conclusion inferred from generated code.
Supporting public technical evidence includes [THREAT_MODEL.md](THREAT_MODEL.md),
[SECURITY_ASSESSMENT.md](SECURITY_ASSESSMENT.md), and regression tests for SSRF,
path traversal, CSRF, authentication boundaries, and secret redaction.
Both knowledge criteria are recorded as `Met` in the public OpenSSF profile.
The enhancement-response criterion has no eligible QuestarrNG issue history
yet: the fork was created on 2026-09-25, after the start of the current
2-to-12-month evaluation window. The profile must describe that limitation
without attributing upstream issue activity to this fork. The cryptographic
criteria for key length, TLS 1.2, and forward secrecy now have repository
evidence above.

### JWT key length

The main branch enforces a minimum of 32 UTF-8 bytes for `JWT_SECRET` and rejects
the known legacy default without logging supplied values. Weak database-stored
keys are replaced with 64 random bytes on first use; strong stored keys are
preserved. This supplies code-level evidence for `crypto_keylength`, pending the
profile owner's external review.
See [SECRETS.md](SECRETS.md#2-authentication-secret-jwt_secret) and
`server/__tests__/config.test.ts` / `jwt-secret-rotation.test.ts`.

The previously documented `main` check set included release notes, SCA,
Windows service publishing, unit tests, the minimum-Node build, four CodeQL
language jobs, Semgrep, and Playwright. This branch removes CodeQL under the
2026-10-30 organization owner directive; branch protection must not retain
CodeQL status checks after integration. The Home Assistant C helper sanitizer
contract now runs in CI. All
status-check and conversation-resolution requirements apply to administrators.
Pull requests require no separate approval. See [branch protection
settings](https://github.com/snapetech-org/QuestarrNG/settings/branches).

The security PR also gates versioned image publication, GitHub release publication,
and release recovery on zero open security-relevant Code Scanning and Dependabot
alerts plus successful CI, SAST, DAST, image-scan, and Scorecard checks
for the release commit. Historical Scorecard maturity and review indicators stay
visible; the maintainer has accepted the CodeReview metric under a
single-maintainer merge policy. All required status checks remain in force.
See [VULNERABILITY_MANAGEMENT.md](VULNERABILITY_MANAGEMENT.md#13-pre-release-gate).

Release workflows use the full-SHA-pinned StepSecurity GitHub Release action, a
secure drop-in replacement for `softprops/action-gh-release`. Checkouts in the
release and release-recovery jobs disable credential persistence; changelog
pull-request jobs retain checkout credentials because they push the generated
branch.

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
- CI, SAST, DAST, and Scorecard workflows: [workflow directory](../.github/workflows)

**Update this record** when the repository's public history, CI/security gates,
or the cited criteria evidence changes. Recheck time-window criteria against
QuestarrNG's own issue tracker; do not substitute upstream statistics.

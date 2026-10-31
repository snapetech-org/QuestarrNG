# Batch 86 source review — October 31, 2026

## Snapshot and method

Reviewed PR #964, issue #965, PR #966, PR #967, issue #968, and PR #969
against the refreshed sanitized snapshot. The snapshot contains 235 issues
and 1,011 pull requests and was generated at 2026-10-31T04:04:24.266Z from
upstream main 6b14c6943938fd22d9943368baca3c72b1fa957c. The fork head recorded
in the snapshot is e188cd0c74c73071c94b04915e1babac2d2bf386. All six digests
match and none is flagged source-changed.

For each pull request, the review included the body, changed files and diff,
discussion, formal reviews, inline review threads, and available workflow runs.
Issue bodies and comments were checked. The current QuestarrNG implementation
was inspected against the reported behavior and review outcomes.

## Review outcomes

- PR #964 — implemented-unverified. The isometric infiltration game and
  pathfinding are present. Its upstream CI, SAST, and Dependency Review runs
  passed, and all 14 review threads are resolved. The current code includes
  the fixes for final-waypoint movement, guard catch cooldowns, blocked starts,
  pausing, and canvas accessibility. Maintainers declined convention-only
  suggestions about relative imports, letterbox color, and placing client-only
  types in the client-server shared directory. The QuestarrNG game unit tests
  and running-browser screenshot have not been executed on the current head.
- Issue #965 — verified. It asks for a 1–4 IGDB rate limit in both UI and
  server validation. PR #949 implements that range, and Batch 83 reports
  passing client and server coverage for the setting.
- PR #966 — verified. The requested component-level SettingsPage docstring
  is present. This is documentation-only. Its only available upstream run,
  Dependency Review, failed at startup; this does not indicate a source defect.
- PR #967 — implemented-unverified. Connected rooms, keycards, locked doors,
  and graduated stealth awareness are present. Upstream CI, SAST, and
  Dependency Review passed; all 14 review threads are resolved. The code
  hides the keycard halo, keeps locked doors impassable without the keycard,
  ignores repeated stance keydowns, avoids rapid live-region announcements,
  and validates waypoint room membership. Focused game tests and a running
  browser screenshot still need private-JIT evidence.
- Issue #968 — implemented-unverified. The report's Cataclismo example has a
  torrent display name with version/DLC details and a shared content root
  without those details. resolveDownloadRelativePath now selects the common
  top-level folder from multi-file torrent paths, and its regression fixture
  uses the reported names. The focused downloader-manager test is not yet run
  on the current head. The issue has no maintainer discussion beyond automated
  triage, so the implementation is assessed from the stated repro and code.
- PR #969 — implemented-unverified. Settings tabs expose edge fades while
  content overflows and observe the intrinsic-width tab wrapper so resize
  changes are detected. Upstream CI, SAST, and Dependency Review passed; all
  three review threads were resolved. The narrow-screen UI still needs a
  current browser replay and retained screenshot.

## Validation status

No Batch 86 source code changed, so no test job was started. The local code
contains the relevant test files, but their presence is not treated as a
passing run. Validation must use compatible private ephemeral JIT capacity.
See the Batch 84 evidence for the current runner blocker. Final exact-head
validation remains required for the campaign.

## Scratch and cleanup

No test process or Batch 86 scratch was created. The campaign worktree remains
on the LVM-backed NFS path documented in Batch 84 evidence.

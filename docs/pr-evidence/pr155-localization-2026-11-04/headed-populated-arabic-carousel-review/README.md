# QuestarrNG PR #155: populated Arabic discovery carousel review

**Application code pin:** f28d414b149e62442ba5d611ad93c3c7297db5f9
**Tree:** ceb43afea7337e985e9de935ab50c9d5ac592104
**PR state at review:** open and ready for review
**Browser:** isolated headed Chrome session on the Agent GUI VM
**Viewport:** 1440 × 1000
**Locale:** Arabic

## Review setup

The preview used a task-local SQLite database and 18 synthetic game records returned by an in-process fixture layer on the IGDB routes. No live IGDB or RAWG provider request was sent. Game covers used the application's placeholder artwork, so provider artwork was not reviewed.

The browser session was isolated from the existing VM Chrome window and the user's desktop. The temporary database was removed after the server stopped. The temporary Vite filesystem allowance used for the shared font cache was restored; the application worktree is clean.

## Results

- Arabic setup, navigation, discovery headings, tabs, and controls rendered right to left. The sidebar stayed on the right, and the discovery content showed no visible clipping or overlap at this desktop viewport.
- The initial carousel position showed fixtures 01–06, with 01 at the right edge and later items extending left. The Arabic Next control advanced to 02–07, bringing fixture 07 in from the left. Previous returned to 01–06.
- From 02–07, ArrowLeft advanced to 03–08 and ArrowRight returned to 02–07. This confirms the RTL keyboard mapping in the headed browser.
- A mixed Arabic and Latin synthetic game title remained readable as provider-owned content.

The development server forwarded a React console error twice: “Encountered a script tag while rendering React component.” The reviewed page still rendered, and the discovery endpoints returned successful responses after account setup.

## Limits

This review covers Arabic desktop discovery with synthetic provider data. It does not establish mobile behavior, real provider artwork, the other locales, or qualified native-speaker approval. Native-speaker review remains outstanding.

## Screenshots

- [Initial carousel state](initial-state.png): fixtures 01–06.
- [Advanced carousel state](next-state.png): fixtures 02–07 after activating Next.
- [SHA-256 checksums](SHA256SUMS.txt).

# QuestarrNG PR #155 exact-head public setup browser review

- PR head: `be131f2d42988bb8f4a271e4df428985da15b53b`
- Tree: `afd827714b9ada51ef269e41184ac219e064059b`
- Browser: headed Chrome on the dedicated Agentic VM, 1920 × 1024.
- Route: `/setup`, served from this exact PR worktree.
- Database: task-only SQLite at `/mnt/disks/scratch/task-scratch/questarrng-pr155-browser-review-20261102/questarr.sqlite`.

## Observations

- The setup language selector rendered Indonesian and Arabic. The Indonesian labels, placeholders, migration warning, and IGDB help copy appeared coherent without visible clipping.
- Arabic switched in place and used right-to-left text alignment and form layout. The visible setup fields, warning, and helper copy fit the desktop viewport without overlap.
- English technical names such as `PostgreSQL` and `IGDB` remained unchanged. The selector was returned to Indonesian after the Arabic check.
- No account was created, no form was submitted, and no user or provider credentials were entered. The preview database was isolated from application data.

## Limits

This review covers the public setup page in Indonesian and Arabic at desktop width. It does not cover account creation, authenticated screens, discovery results, other locales in this fresh run, or narrow/mobile layout. Existing browser evidence covers additional locales and screens. Qualified native-speaker approval remains outstanding.

The preview used the repository development server and a task-only SQLite database. No tests, production build, scans, CI, release, or tag were run.

## Screenshots

- `questarr-setup-id.png` — Indonesian setup page.
- `questarr-setup-ar.png` — Arabic right-to-left setup page.

# Pull Request _Template_

## Description

Please include a summary of the change and which issue is fixed. Please also include relevant motivation and context. List any dependencies that are required for this change.

## Merge

Use `main` as the target. Open a pull request only when current GitHub rules require one; push directly
when they allow it. Keep a pull request current with `main` only when those rules require it. Merge
after the checks and approvals required by current rules are satisfied. An explicit maintainer's
direction to merge is sufficient; no additional review or approval is required beyond those rules.
Use any merge method enabled in GitHub.

## Verification

List the automated checks you ran and their results. Describe any manual checks and attach screenshots or recordings for UI changes. If a relevant check was not run, say why.

## Risk Analysis

Describe the main user, data, or compatibility risks and how to roll the change back if needed.

## Screenshots

For any UI change (`client/src/**`), include a screenshot or short recording of it running. Not required for backend-only changes.

## Type of change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Release notes

For any user-facing change, add one structured fragment under `release-notes/` describing it. A
single fragment may cover related user-facing changes in the same pull request.

- [ ] I added a validated release-note fragment under `release-notes/` for this user-facing change.
- [ ] This change is internal-only and needs no release-note fragment.

For internal-only work, select the second option or put `release-note: none` on its own line in
the PR description. For direct pushes or merge checks that read commit messages, put the same
marker on its own line in the commit message.

Preview the rendered release text with `npm run release-notes:preview` if useful.

## Checklist:

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] If this PR adds a new actor/integration, external interface, or security-relevant change, I have updated docs/ARCHITECTURE.md, docs/API.md, and/or docs/SECURITY_ASSESSMENT.md accordingly
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] If the database schema changed, SQLite and Postgres are both updated: `shared/schema.ts` and `shared/schema.pg.ts` (+ `shared/schema-parity.ts`), migrations generated with `npm run db:generate` and `npm run db:generate:pg` (`migrations-pg/`), and any new table added to `TABLE_ORDER` in `scripts/sqlite-to-pg.ts`
- [ ] For UI changes, I have included a screenshot or recording of it running
- [ ] If AI is used to write the code (partially or entirely), provide the full model name (including version) and thinking level.
- [ ] Every non-merge commit includes my DCO sign-off trailer, or this is a GitHub-verified automation pull request. See [DCO.md](../DCO.md).

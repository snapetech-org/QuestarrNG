# Maintainers

QuestarrNG is maintained in the `snapetech/QuestarrNG` repository. The
repository's current collaborator and organization-team membership is the
source of truth for individual access; this file does not duplicate a roster
that can become stale.

The fork's release workflows publish images to GitHub Container Registry with
the repository-scoped `GITHUB_TOKEN`. Docker Hub publishing has been removed.
Tag releases include validated `release-notes/` fragments in the GitHub release
and Discord announcement. Configure the `DISCORD_WEBHOOK` secret in the
`discord-release` GitHub Actions environment with the release-announcement
channel webhook. The announcement job skips with a warning while that secret is
unset.
Repository administrators manage Actions permissions and release access in
GitHub settings, following the [Collaborator Access & Escalation Policy](SECURITY.md#collaborator-access--escalation-policy).

QuestarrNG is derived from Doezer's Questarr project. Copyright and contributor
attribution for that upstream work remains in the source and license files.

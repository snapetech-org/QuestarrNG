## Runner policy — owner directive, 2026-11-03

Use compatible public GitHub-hosted runners by default, preserving each job's
required OS and architecture. Use private ephemeral JIT runners only when a
task requires private hardware, network, files, or other task-specific private
resources. Public pull-request code must run without secrets and with minimal
permissions; use disposable isolated execution when the task requires tighter
egress or environment controls. Preserve active builds and other agents' work.
Do not restart the broker while it owns running guests. Validate each workflow
revision on the runner class it selects; rerunning an old run uses its old
revision.
The shared JIT inventory lives in
`snapetech-org/packer/scripts/shared-jit-runner-pool/`. Check source routing,
runner-group access, deployed broker policy, and live capacity when a task
needs a private JIT route.

## Upstream source attribution

When QuestarrNG gathers or adapts an idea, report, discussion, patch, rejected
request, issue, or pull request from upstream Questarr, update
`UPSTREAM_ATTRIBUTION.md` and the user-facing changelog in the same change.
Record the originating upstream URL, the upstream author’s GitHub handle, the
kind of source, and the behavior brought into QuestarrNG. Say that the person
contributed or suggested it to the upstream project and that QuestarrNG
independently adapted, integrated, or verified it. Never imply that the person
contributed directly to, endorsed, or participated in this fork.

Credit closed, unmerged, superseded, and rejected upstream records when their
code or ideas materially informed the fork. Before a release, audit every new
upstream reference in commits, release-note fragments, and changelog entries
for an author link and originating issue, PR, or commit link. Missing source
credit is a release-note defect and must be fixed before publication.

Also record upstream ideas that are planned, referenced, incomplete, rejected,
withdrawn, superseded, not applicable, or not yet reviewed. Put them in a
clearly labelled non-shipped section with an explicit disposition; never imply
that attribution means the behavior is implemented.

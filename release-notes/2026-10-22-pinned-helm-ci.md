---
category: changed
audience: operators
area: ci
action: none
breaking: false
---

The Helm chart check now installs and verifies its pinned Helm binary, so it no longer depends on tools preinstalled in a GitHub-hosted runner image.

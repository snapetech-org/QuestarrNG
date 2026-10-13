---
category: security
audience: operators
area: validation
action: none
breaking: false
---

Pull request tests and builds run inside an isolated sandbox with offline dependencies and source-bound receipts. The sandbox supports loopback-only tests while keeping host services, resolver settings, and external networking unavailable. Base-sourced checks validate the exact candidate snapshot, while Codecov uploads and Discord tag announcements run from trusted default-branch workflows.

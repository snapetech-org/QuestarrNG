---
category: security
audience: operators
area: validation
action: none
breaking: false
---

Pull request tests and builds run inside an isolated sandbox with offline dependencies and source-bound receipts. A base-sourced check validates the exact candidate snapshot, while Codecov uploads read reports only from trusted pushes to `main`.

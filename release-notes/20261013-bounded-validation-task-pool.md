---
category: changed
audience: operators
area: validation
action: none
breaking: false
---

Independent validation tasks now run together in a bounded pool, reducing idle time while preserving dependencies, isolated results, and source checks. Superseded pull-request runs also release their concurrency slot after cancellation while current-run failures still reconcile.

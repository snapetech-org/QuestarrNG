---
category: security
audience: operators
area: ci
action: none
breaking: false
---

Local validation keeps extensionless credentials and files in credential folders out of the test snapshot while retaining token-named source code. The sandbox pins its inputs before masking host paths, and receipt artifacts are separated by workflow attempt so reruns cannot reuse stale evidence.

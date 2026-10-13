---
category: security
audience: operators
area: ci-security
action: none
breaking: false
---

Validation snapshots hide dotted and extensionless credentials, private/API keys, access/refresh tokens, client secrets, and non-source files beneath credential folders while retaining source modules. The local launcher isolates the host root, skips deleted indexed files, and requires an explicit command; CI receipt downloads are limited to the current workflow attempt.

---
category: security
audience: operators
area: ci-security
action: none
breaking: false
---

Validation snapshots exclude dotted and extensionless credential names, private/API/access-token material, and non-source files beneath credential folders while retaining source modules such as TokenStore.ts.

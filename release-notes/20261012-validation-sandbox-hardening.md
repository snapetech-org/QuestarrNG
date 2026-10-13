---
category: security
audience: operators
area: ci
action: none
breaking: false
---

Validation now keeps local credentials out of test snapshots while preserving legitimate source and deployment files. It also masks the original checkout under runtime mount aliases and requires sandbox verification in CI, so candidate tests cannot read private host files or silently skip isolation checks.

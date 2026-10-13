---
category: security
audience: operators
area: ci
action: none
breaking: false
---

Local test snapshots now omit dotted and extensionless credentials, private/API keys, access/refresh tokens, client secrets, and suffixed dotenv files such as tokens.env.local. Safe example templates and token-named source code remain available, including the API-key route, Helm Secret template, and security documentation. Candidate ignore rules cannot drop copied tracked files; checkouts beneath system runtime mounts are remasked at their mapped destination, checkouts that contain those mounts fail closed, and symlinked runtime sources under hidden roots are rejected. CI installs Bubblewrap and requires the isolated launcher contract to pass, keeping useful fixtures without copying private values into the test workspace or silently skipping the security check.

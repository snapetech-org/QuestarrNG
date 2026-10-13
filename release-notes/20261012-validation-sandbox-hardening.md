---
category: security
audience: operators
area: ci
action: none
breaking: false
---

Local test snapshots now omit dotted and extensionless credentials, private/API keys, access/refresh tokens, client secrets, and suffixed dotenv files such as tokens.env.local. Safe example templates and token-named source code remain available, keeping useful fixtures without copying private values into the test workspace.

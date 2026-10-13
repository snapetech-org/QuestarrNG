---
category: security
audience: operators
area: ci
action: none
breaking: false
---

Local validation excludes dotted and extensionless credentials, private/API keys, access/refresh-token names, client-secret material, suffixed dotenv files such as tokens.env.local and secrets.env.production, and non-source files under credential folders. Safe templates such as tokens.env.example and token-named source modules remain available. The sandbox pins inputs before masking host paths, and receipt artifacts are isolated by workflow attempt.

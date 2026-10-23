---
category: security
audience: users, operators
area: security
action: none
breaking: false
---

QuestarrNG pins Express's transitive body-parser dependency to patched version 2.4.0, preventing unauthenticated compressed-request payloads from crashing the server.

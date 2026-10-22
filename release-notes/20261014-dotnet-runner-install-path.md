---
category: fixed
audience: operators
area: ci
action: none
breaking: false
---

Self-hosted Linux runners now install the pinned .NET SDK in a writable temporary directory, avoiding failures when the system-wide SDK directory is root-owned.

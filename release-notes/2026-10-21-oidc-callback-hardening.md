---
category: fixed
audience: users, operators
area: authentication
action: none
breaking: false
---

Apple's OIDC form-post callback now passes the default API access boundary. Concurrent sign-ins use separate short-lived state cookies and are capped at 16 pending attempts.

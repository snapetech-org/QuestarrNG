---
category: security
audience: operators
area: validation
action: none
breaking: false
---

Validation task and runtime-probe processes now use restricted environment variables and private temporary settings, reducing exposure of unrelated credentials and configuration during validation. Playwright browser installation and tests share a package-local browser cache so isolated tasks can find the installed browser.

---
category: security
audience: operators
area: security
action: Use a random JWT_SECRET containing at least 32 bytes, or unset it to generate one. Release maintainers must complete all security scans and resolve open alerts before publishing.
breaking: true
---

Weak JWT secrets are now rejected or rotated, invalidating affected sessions. CI installs patched, locked npm dependencies and separately tracks and audits the npm CLI source without installing its bundled dependencies. Versioned images and GitHub releases now require zero open security alerts and successful CodeQL and Semgrep scans of the exact release tag and commit.

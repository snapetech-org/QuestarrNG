---
category: security
audience: operators
area: security
action: Use a random JWT_SECRET containing at least 32 bytes, or unset it to generate one. Release maintainers must complete all security scans and resolve open alerts before publishing.
breaking: true
---

JWT secrets are validated and rotated, invalidating affected sessions; CI audits locked dependencies and npm tooling, and version tags wait for clean Trivy scans of both Linux architectures plus zero open alerts and successful CodeQL and Semgrep scans.

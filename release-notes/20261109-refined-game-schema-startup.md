---
category: fixed
audience: users, operators
area: server
action: none
breaking: false
---

The server now preserves cross-field game validation while rejecting internal lifecycle fields without invoking an unsupported Zod operation, allowing clean startup for E2E and production scans.

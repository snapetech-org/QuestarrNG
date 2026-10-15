---
category: changed
audience: operators
area: deployment
action: Push a validated version tag to publish production images.
breaking: true
---

Production image releases now start only from a validated version-tag push; main merges and development/test image builds no longer publish `latest` or version tags.

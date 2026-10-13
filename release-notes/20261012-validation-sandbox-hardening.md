---
category: security
audience: operators
area: ci
action: none
breaking: false
---

The trusted local launcher pins workspace, runtime, dependency, cache, and marker mounts through inherited file descriptors before masking host paths. Validation receipt artifacts include the workflow attempt so reruns remain separate.

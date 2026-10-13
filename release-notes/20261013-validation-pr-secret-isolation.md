---
category: security
audience: operators
area: ci
action: none
breaking: false
---

Pull-request test jobs no longer receive the Codecov upload token, preventing candidate test processes from reaching it through later upload steps.

The trusted local launcher now pins sandbox mount sources through inherited file descriptors before masking host paths. CI validation receipt artifacts include the workflow attempt so reruns stay distinct.

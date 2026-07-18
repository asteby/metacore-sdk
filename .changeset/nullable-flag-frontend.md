---
'@asteby/metacore-runtime-react': patch
---

normalize-submit: prefer the explicit `nullable` field flag served by the kernel (v0.77.1+) when deciding to null an empty reference, falling back to the type-based heuristic for older hosts that don't serve the flag.

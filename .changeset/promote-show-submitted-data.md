---
'@asteby/metacore-lib': minor
---

Add `showSubmittedData` helper (re-exported from the package root and from the `./show-submitted-data` subpath). Renders a sonner toast that pretty-prints any payload as JSON — convenience for showcase / demo forms that want to confirm the submitted shape without wiring a real success path.

`react` and `sonner` are declared as optional peer dependencies (the rest of `@asteby/metacore-lib` remains React-free).

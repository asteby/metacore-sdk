---
'@asteby/metacore-app-providers': patch
---

`MetacoreAppShell`'s addon-install listener now surfaces a loading / success / failure toast in the host's toaster while the install runs, matching the feedback users get on every other long action (export, import, delete). Previously the iframe button flipped state silently in the host's perspective.

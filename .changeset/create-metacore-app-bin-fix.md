---
'@asteby/create-metacore-app': patch
---

Restore the `bin/index.js` shim in the published tarball.

The repo-level `.gitignore` excludes `bin/` (Go build artifacts), which silently dropped the CLI entry-point from the npm package — `npm create @asteby/metacore-app` failed with `create-metacore-app: not found` after install. An explicit allow-rule for `packages/create-metacore-app/bin/` puts the shim back into the tarball.

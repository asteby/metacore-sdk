---
"@asteby/metacore-starter-core": minor
---

Make `@asteby/metacore-starter-core` publishable. Removed `"private": true` and dropped the package from the changeset `ignore` list. The first published version (1.0.x) is the same source the workspace consumers have been using via `workspace:*` until now.

Consumers that previously used `file:../../metacore-sdk/packages/starter-core` can switch to `^1.0.0` from npm.

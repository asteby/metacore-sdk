---
"create-metacore-app": minor
---

Make `create-metacore-app` publishable. Removed `"private": true`, dropped the package from the changeset `ignore` list, and removed the corresponding `--filter=!create-metacore-app` flags from the build and release workflows.

Once published, scaffolding a metacore app is one command:

```bash
npx create-metacore-app my-platform
```

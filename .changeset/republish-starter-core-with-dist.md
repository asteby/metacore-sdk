---
"@asteby/metacore-starter-core": patch
---

Republish starter-core with the compiled `dist/` bundle. The 1.1.0 tarball was uploaded without `dist/` because that release race-condition'd with the CI fix (PR #23) — the publish step ran with the previous workflow that excluded starter-core from the build. Consumers hit `Failed to resolve module specifier "@asteby/metacore-starter-core"` in the browser. No source changes; this is a packaging fix only.

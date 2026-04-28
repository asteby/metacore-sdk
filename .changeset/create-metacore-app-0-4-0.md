---
'@asteby/create-metacore-app': minor
---

Add `--example <name>` flag that clones a folder from `asteby/metacore-sdk/examples/<name>` via tiged and freezes every `workspace:*` dependency to the latest published npm version.

Same fast-path that powers `create-next-app --example`, with no template duplication. The fullstack starter is the first consumer:

```
npm create @asteby/metacore-app my-app -- --example fullstack-starter
```

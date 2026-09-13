---
"@asteby/metacore-runtime-react": minor
---

Add `useResource`/`useMutation` — a tanstack-free polling GET/mutation hook for federated addons, with a `stuck` field on `useResource` that flips true once `isLoading` stays on past a configurable threshold (default 8s) without landing. Lets addon UIs offer a retry instead of an indefinite skeleton when a fetch run gets lost to a remount/abort race. Extracted from the pattern independently reimplemented in the `pos` addon (PRs #1455, #1460).

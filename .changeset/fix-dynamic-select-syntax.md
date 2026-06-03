---
"@asteby/metacore-runtime-react": patch
---

fix(dynamic-select): repair JSX syntax broken in #332 — the wrapper-row comment was a sibling of the root element inside `return (`, which is invalid and failed the release build (TS1005). Moved it to a `//` comment above `return`. The `w-full min-w-0` grid-cell constraint (the actual `+`-overlap fix) is unchanged.

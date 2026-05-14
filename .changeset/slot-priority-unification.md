---
"@asteby/metacore-sdk": patch
"@asteby/metacore-runtime-react": patch
---

fix: unify slot priority ordering across SDK and runtime-react (was
inconsistent — DESC is now canonical, see `docs/slot-priority.md`).

`Registry.registerSlot` in `@asteby/metacore-sdk` sorted ascending
("lower renders first") while `slotRegistry` in
`@asteby/metacore-runtime-react` sorted descending ("higher renders
first"). The runtime-react behaviour matches `docs/dynamic-ui.md`,
`mergeNavigation` and every other priority sort in the codebase, so the
SDK has been flipped to match. Addons that register a single
contribution per slot — i.e. every in-tree consumer we audited — are
unaffected. Addons relying on the inverted SDK order will need to swap
their priority values.

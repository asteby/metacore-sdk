---
"@asteby/metacore-runtime-react": minor
---

DynamicSelectField gains generic `createDefaults` / `createLockedFields`
props: the inline "+" forwards them on the `metacore:create-record`
event so the host's create modal seeds those values and locks those
fields. Any model, any fields — e.g. a mechanic picker creating a team
user with `{ role: 'mecanico' }` pre-set and locked, no HR dependency.

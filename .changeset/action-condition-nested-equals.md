---
"@asteby/metacore-runtime-react": patch
---

Fix row-action `condition` evaluation for nested fields and `equals`/`notEquals` operators. Hosts declaring `{ field: "user.verified", operator: "equals", value: false }` no longer show every action at once.

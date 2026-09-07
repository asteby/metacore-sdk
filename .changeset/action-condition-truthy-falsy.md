---
"@asteby/metacore-runtime-react": patch
---

Fix `isActionConditionMet` (row/table action `condition` gate): `truthy`/`falsy` (and the `present`/`set`/`blank`/`empty` aliases, matching the host's document print gate) were unrecognized operators falling through to the permissive `default: return true` — a `condition: {field, operator: "truthy"}` silently gated nothing, rendering the action on every row regardless of the field's value. Confirmed live: an addon's `condition: {field: "amount_due", operator: "truthy"}` row action rendered on every row, including ones with a zero balance.

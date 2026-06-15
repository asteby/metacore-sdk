---
"@asteby/metacore-runtime-react": minor
---

Dependent (cascading) options for declarative pickers. A field/item_field may
declare `dependsOn` (camelCase) / `depends_on` (snake_case) naming another field
in the same action form — a header field (e.g. `source_warehouse_id`) or a
sibling row cell — whose current value scopes this picker's options. The value
is forwarded to the options endpoint as `filter_value` (`useOptionsResolver`
gains a `filterValue` arg) and the picker re-fetches when it changes, clearing
the stale selection. While the depended-on field is empty the picker is disabled
with an overridable hint. Header form context flows down through
`DynamicLineItems` → `CellRenderer`/`RefCell` so a line-items cell can depend on
a header field, not just same-row values. Option `description` (e.g. available
qty) is now shown in the line-items `RefCell` select as well as
`DynamicSelectField`. Fully generic — no domain knowledge in the SDK.

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
`DynamicSelectField`.

A field/item_field may also carry an `optionsConfig` (camelCase) /
`options_config` (snake_case) object — the kernel's enriched options routing,
shaped `{ type, source, filter_by, value, label_ref, description }`. When it
declares a `source`, the picker queries that SOURCE model instead of the field's
`ref`: URL `/options/<source>` with query field `<value ?? field.key>` and the
cascade `filter_value`. Without `optionsConfig.source` the picker keeps its
`ref`-based behaviour (retrocompat). New `getOptionsConfig` / `resolveOptionsSource`
helpers (and `FieldOptionsConfig` type) are exported. Fully generic — no domain
knowledge in the SDK.

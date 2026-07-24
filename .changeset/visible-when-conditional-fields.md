---
"@asteby/metacore-runtime-react": minor
---

feat: `visible_when` conditional field visibility in both form renderers

Add support for the kernel's new `visible_when` primitive: a create/edit form
field is rendered — and validated — only while a sibling field's current value
matches the declared predicate (`{ field, equals | in }`). A hidden field never
gates submit (its required-check is dropped along with it).

Wired into BOTH form renderers off a shared helper `evaluateVisibleWhen`
(exported alongside `getVisibleWhen`):

- `DynamicForm` (`dynamic-form.tsx`) — drives the zod schema, the balance gate
  and the render off a `visibleFields` list filtered on the live values.
- `DynamicRecordDialog` (`dialogs/dynamic-record.tsx`) — `filterVisibleFields`
  gains an optional `formValues` arg applying the predicate; the render and the
  required-gate loop both use it.

`ActionFieldDef` and `ColumnDefinition` gain `visible_when` / `visibleWhen`
(snake + camel aliases). Fields without `visible_when` are always visible
(retro-compatible). Requires a kernel/ops bump that serves the field.

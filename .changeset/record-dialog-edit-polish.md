---
"@asteby/metacore-runtime-react": minor
---

Polish the generic record EDIT dialog (`DynamicRecordDialog` mode='edit'),
fixing two prod issues that affected every module using it (transfers, orders,
customers):

- **jsonb line-items render read-only instead of "[object Object]".** A field
  that is a jsonb line-items column (declares `item_fields`, or its value is an
  array/plain object) is no longer rendered as a broken text input. The edit
  form now renders it read-only with the same inline `CollectionCell` table the
  detail view uses — localized headers + resolved ref labels — plus a
  translatable "Solo lectura" hint (`datatable.readOnly`). These are
  action-built documents; field-by-field array editing stays out of scope.

- **FK selects show the related record's name, not the raw uuid.** A
  `dynamic_select` / `ref` field in edit mode now seeds its trigger from the
  backend-injected relation sibling (`source_warehouse_id` →
  `source_warehouse: { value, label }`, the key without `_id`) via the existing
  `DynamicSelectField` `seedOption` prop, so an existing selection displays the
  label immediately without waiting for a lookup. Falls back to the raw value
  (today's behaviour) when no sibling is present; creating/changing the
  selection is unchanged.

`EditField`, `isLineItemsField`, and `fkSeedOption` are exported from the
dialogs module.

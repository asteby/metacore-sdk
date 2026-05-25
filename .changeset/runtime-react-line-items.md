---
'@asteby/metacore-runtime-react': minor
---

Add declarative line-items (repeatable group) support to the action
form renderer, pairing with the kernel v3 `ActionField.item_fields`
addition. Multi-line action modals (e.g. a "Recibir mercancía" modal
with N item rows, or a journal entry with N debit/credit lines) can now
be declared in the manifest instead of needing a custom federated modal.

- `ActionFieldDef` gains `itemFields?: ActionFieldDef[]` (mirrors the v3
  `item_fields`). A field carrying item columns is a repeatable group;
  its value is an array of row objects keyed by the item field keys.
- `buildZodSchema` now builds `z.array(z.object(...))` for line-items
  fields, applying each column's per-cell rules per row; a required
  group requires at least one row. New `isLineItemsField` / `getItemFields`
  helpers tolerate both camelCase `itemFields` and raw snake_case
  `item_fields` served by the kernel.
- New `DynamicLineItems` component renders a row grid (header from the
  item field labels, add/remove row controls, each cell a widget via
  `resolveWidget`, including `ref`-driven selects). It is wired into both
  `DynamicForm` and `ActionModalDispatcher`'s declarative-fields path.

Additive only: existing flat-field rendering is unchanged.

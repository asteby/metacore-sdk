---
"@asteby/metacore-runtime-react": minor
---

`EntitySelect` now accepts `createDefaults` and `lockedCreateFields` to seed
and lock fields in its inline "+" create dialog. Motivating case: the POS
vehicle picker creating a vehicle for an already-selected customer — the
customer field should come pre-filled and not be changeable from that
context, instead of the user having to search/select it again (and risking
attaching the vehicle to the wrong customer).

- `createDefaults?: Record<string, unknown>` — seeds the create dialog's
  form (passed through as `CreateRecordDialog.defaults`).
- `lockedCreateFields?: string[]` — keys from `createDefaults` that render
  visible-but-disabled on create instead of editable (passed through as the
  new `CreateRecordDialog.lockedFields` / `DynamicRecordDialog.lockedFields`).

New `lockedFields` support in `DynamicRecordDialog`/`CreateRecordDialog`:
unlike a `readonly` field (excluded entirely on create), a locked field stays
visible so the user sees what value is being submitted, rendered through the
same `ReadonlyEditField` used for edit-mode readonly fields. Also fixes
`ReadonlyEditField` for relation/`Ref` fields (readonly-on-edit and now
locked-on-create): it previously rendered the raw foreign id, and now
resolves and shows the related record's label like `RelationViewValue`
already does in view mode.

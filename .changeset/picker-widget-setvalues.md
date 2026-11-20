---
'@asteby/metacore-runtime-react': minor
---

`FieldWidgetProps.setValues(patch)`: un widget de campo registrado puede llenar varios campos hermanos del formulario a la vez (modal `DynamicRecordDialog` y `DynamicForm`). `CreateRecordDialog`, `useRecordPickerDialog` y `CustomerPicker` aceptan `ensureFields` (campos extra fusionados al esquema del modal, p. ej. un campo `widget` que precarga desde un documento). `RecordPicker` (trigger input) y `CustomerPicker` aceptan `openOnFocus`. Sin cambios por defecto.

---
"@asteby/metacore-starter-core": patch
---

`Command*`, `Popover*` y `MultiSelect` dejan de ser copias: se re-exportan desde `@asteby/metacore-ui/primitives` (mismos nombres; `MultiSelect` gana `searchPlaceholder`/`emptyMessage`). Se elimina `components/dynamic/dynamic-record-dialog.tsx`, un diálogo genérico duplicado que no formaba parte de la API pública (no se exportaba desde el entry del paquete) y que nadie importaba; el modal genérico es el `DynamicRecordDialog` de runtime-react.

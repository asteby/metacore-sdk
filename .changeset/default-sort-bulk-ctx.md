---
'@asteby/metacore-runtime-react': minor
---

`DynamicTable`: nueva prop `defaultSort` (`{ id, desc? }`) que siembra el orden inicial sin pisar el `?sortBy=` de la URL ni impedir que el usuario lo cambie o limpie. `DynamicTableBulkContext` suma `actions` (acciones de metadata visibles según permisos) y `can(actionKey)` para filtrar los botones masivos del host por rol/capability. Aditivo: sin ellas el comportamiento no cambia.

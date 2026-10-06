---
"@asteby/metacore-runtime-react": patch
---

El formulario de alta/edición (`DynamicRecordDialog`) ya no muestra claves de catálogo crudas como etiqueta de campo (p. ej. `FISCAL_MEXICO.EXT.CUSTOMER.RFC_RECEPTOR` en los campos que un addon agrega por extensión a Clientes o Productos). Si la etiqueta llega del servidor sin resolver, se traduce con el catálogo del cliente y, si tampoco está ahí, se muestra legible (`Codigo Postal`). Las etiquetas que ya llegan en texto humano no se tocan. Nuevo helper exportado `localizeFieldLabel`.

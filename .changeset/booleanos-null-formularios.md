---
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-ui": patch
"@asteby/metacore-i18n": patch
"@asteby/metacore-starter-core": patch
---

Booleanos opcionales con NULL: el panel ya no convierte NULL en `false` ni lo pinta como «No».

El kernel v0.248.4 (metacore-kernel #573, ops #2252) conserva NULL en los booleanos opcionales del CRUD dinámico y Get/List devuelven `null`. Ejemplo real: `mp_payments.sandbox` usa NULL para «modo desconocido»; si un operador editaba esa fila y el formulario mandaba `false`, un pago de prueba pasaba a parecer real.

- **Formularios y modales de acción** (`DynamicRecordDialog`, `DynamicForm`, `GenericActionModal`/wizard, renglones de `DynamicLineItems`): un booleano opcional que llega en NULL se siembra `null` (no cae al default ni a `false`). Si el usuario no lo toca, la llave **no viaja** en el payload. Sí / No viajan como `true` / `false`; elegir «Sin definir» manda `null` JSON (nunca `""` ni el texto `"null"`). Con `editPayload: 'declared'` el null del booleano opcional se conserva (antes pasaba a `''`).
- **Control de tres estados** `TriStateBooleanField` (Sí / No / Sin definir) sobre `SegmentedControl` de metacore-ui: `radiogroup` accesible con flechas, i18n es/en (`common.yes`, `common.no`, `common.unset`). Se carga diferido (`React.lazy`) para no sumar al shell. Se usa cuando el booleano no es `required` y el servidor lo declara `nullable: true` (el kernel lo sirve en los campos que deriva) o el registro lo trae en NULL; así un flag opcional de una acción sin `nullable` sigue con su switch. **En ops hoy el modal que arma desde las columnas (`backend/services/metadata.go`) no sirve `nullable` ni `defaultValue`, así que ahí el control de tres estados sólo aparece cuando el registro ya trae NULL**; los demás booleanos opcionales siguen con su switch. El radiogroup toma la etiqueta visible y traducida por `aria-labelledby` (`FieldLabel` acepta `id`). Los booleanos `required` siguen con switch/checkbox de dos estados y su comportamiento no cambia. Los defaults al crear no cambian; si al crear se elige «Sin definir», la fila toma el DEFAULT de la columna (ops `applyColumnDefaults`), no necesariamente NULL.
- **Modales de acción**: un booleano NULL del registro que no se tocó ya no viaja al endpoint de la acción (antes iba `false` o el default).
- **Celdas y vistas**: NULL se pinta «—» (nombre accesible «Sin definir»), igual que `formatDisplayValue`, en la celda de `DynamicTable`, la vista y el campo de solo lectura del registro, y la celda legacy de starter-core. `false` sigue siendo «No».
- **Filtro booleano**: se agrega la opción «Sin definir», que viaja como `f_<col>=NULL` (`OpNull` del dialecto de filtros de ops del kernel, `IS NULL`). «No» sigue siendo `= false` y excluye NULL a propósito: el kernel no tiene OR entre operadores, así que en el filtro booleano (`ColumnFilterControl` de metacore-ui) Sí / No / Sin definir son excluyentes. El filtro por carril del kanban (`cardMatchesLaneFunnel`) también hace casar `NULL` con tarjetas null/undefined.

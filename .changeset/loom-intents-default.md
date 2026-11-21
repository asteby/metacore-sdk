---
"@asteby/metacore-runtime-react": minor
---

Loom: `DynamicRecordDialog` atiende por defecto las intenciones que nadie atiende (p. ej. el «Crear» de `DynamicCRUDPage`): `record.select` abre el registro existente (edición, o su ficha si el usuario no puede editar) y `record.edit` abre su edición con el parche como propuesta revisable (diff con el valor anterior). El diálogo se remonta: no arrastra valores ni propuestas del alta. Quien ya atiende las intenciones (`onIntent` que devuelve true, `CustomerPicker`) no cambia.

Fix: la barra «Se aplicaron N campos» se retira cuando esos valores ya no están en el formulario (recarga del registro, cambio de modo), en lugar de quedar sobre campos vacíos.

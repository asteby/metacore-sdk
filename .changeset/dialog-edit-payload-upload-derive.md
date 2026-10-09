---
'@asteby/metacore-runtime-react': minor
---

DynamicRecordDialog: tres mejoras opcionales y retrocompatibles (sin las opciones nuevas el comportamiento es idéntico).

- `ModalMetadata.editPayload?: 'all' | 'declared'` (alias `edit_payload`). En `mode='edit'`, `'declared'` envía en el PUT solo las claves de los campos declarados en la metadata del modal (un campo declarado vacío va como `''`, para poder borrar valores; los ocultos por `visible_when` siguen fuera). El id solo viaja en la URL / como primer argumento de `onUpdate`. Default `'all'` = hoy. Nota: el formulario ya se siembra solo con los campos declarados, así que `'declared'` además excluye claves añadidas por `onApply` y garantiza el `''`; para NO enviar un campo de estado (p. ej. `approved`) el host debe no declararlo en el modal.
- `FieldDef.maxSize` (bytes) y `FieldDef.accept` (MIME/extensiones) en campos `file` e `image`: un archivo que no cumple NO se sube a `/upload`; se muestra un error en el campo (`role="alert"`) y, en `image`, también toast. Ambos campos aceptan arrastrar y soltar sobre su zona (el botón/selector sigue operable por teclado). `UploadField` ahora también valida el tipo contra `accept` (antes solo el tamaño). Nuevas claves i18n `common.upload.invalid_type`. Exporta `fileMatchesAccept` y `validateUploadFile`.
- `FieldDef.deriveFrom?: { field, transform: 'slug' }` (alias `derive_from`): mientras el usuario no edite el campo destino, se pre-rellena con el slug del origen (minúsculas, sin acentos, guiones); al editarlo a mano deja de derivarse (vaciarlo reactiva la derivación). Exporta `slugify`.

Nota: `maxSize` y `accept` son validación de comodidad en el cliente (se saltan fácilmente); el backend debe seguir validando tipo y tamaño. En `mode='edit'`, `deriveFrom` no pisa un destino ya guardado (solo deriva si estaba vacío).

NO cubierto: subir el archivo multipart directo al endpoint del modelo (como hace hoy el modal de categorías de TV de doctores.lat) — el contrato HTTP sigue siendo `POST /upload` + URL en el JSON; cambiarlo es una decisión de contrato del host.

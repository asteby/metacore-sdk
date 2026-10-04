---
"@asteby/metacore-runtime-react": minor
---

`TableMetadata.audit` (columnas de auditoría que sirve el kernel >= v0.188) y nuevo `<AuditInfo>`: «Creado por X · fecha», «Modificado por Y · fecha» y «Eliminado por Z · fecha», colapsado al pie del detalle/edición de `DynamicRecordDialog`. El nombre sale del host (`resolveActor`), del hermano expandido del registro (`created_by`) o, si no, un id corto; el actor de sistema se muestra como «Sistema».

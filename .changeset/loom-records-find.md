---
"@asteby/metacore-runtime-react": minor
---

Loom: capacidad mediada `caps.records.find` (RFC 0005). Una Part sin red (p. ej. el lector de constancia) declara `recordsFind: ['customers.Customer']` (`PartDef`/`GraftDef`; servido desde `ui.exposes[].needs.records.find`) y pregunta por igualdad exacta de un campo; el anfitrión consulta con su cliente de datos y los permisos del usuario. Contrato: solo modelos declarados, permiso `<modelo>.index`, campo simple y valor de 1 a 128 caracteres, como mucho `RECORDS_FIND_MAX` (5) resultados copiados y congelados, errores del host sin el valor, y evento de auditoría `records_find` (modelo, campo, resultado, conteo; nunca el valor). `DynamicRecordDialog` lo implementa con el filtro estándar del listado (`f_<campo>=eq:<valor>`). `SeamProps.records`, `makeRecordsCap` y `RecordsFindError` en el subpath `/loom`.

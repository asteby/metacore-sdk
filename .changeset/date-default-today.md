---
"@asteby/metacore-runtime-react": minor
---

Los campos fecha de un formulario declarativo (document_forms, acciones y asistentes) pueden declarar `default: "$today"` (o `"today"`) y nacen con el día de hoy en la zona horaria de la organización (`OrgRuntimeProvider`), no en la del navegador ni en UTC.

- `buildFieldDefaults` lee el `default` del manifest además del `defaultValue` del host. Antes los defaults escalares de los campos de document_forms se ignoraban.
- Un `$token` desconocido nunca se siembra en un campo fecha: el campo queda vacío y no se manda un literal que el backend rechaza.
- Nuevos exports: `todayInZone`, `isTodayToken`, `resolveFieldDefault`.

Retest r4 de Pitsline: FAC-00014 se guardó con fecha 26/27 sep. `invoice_date` era obligatoria y no tenía default, y el calendario abre en el mes actual con los últimos días del mes anterior en la primera fila.

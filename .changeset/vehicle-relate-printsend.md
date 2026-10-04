---
"@asteby/metacore-runtime-react": minor
---

Tres componentes de negocio compartidos:

- `VehiclePicker` (#1025): selector controlado de vehículo con búsqueda por placa o VIN y alta rápida (`CreateRecordDialog`), mismo estilo que `CustomerPicker`; sin `PermissionsProvider` no bloquea la UI.
- `RelateDocuments` (#1026): relaciona uno o más documentos origen con un tipo de relación (`related_document_id`, `relation_type`), muestra UUID/folio; los tipos llegan por prop (sin catálogos fiscales embebidos).
- `PrintSendDialog` (#1027): imprimir (URL de PDF del host) o enviar por `onSend(canal, destino, documento)`; sin integración de mensajería.

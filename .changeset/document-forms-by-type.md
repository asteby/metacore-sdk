---
"@asteby/metacore-runtime-react": minor
---

FAC-12 (#1022): alta guiada por tipo de documento. Nuevo `DocumentFormDialog` y `resolveDocumentForms`: cuando el metadata de la tabla (o la prop `documentForms` de `DynamicCRUDPage`) trae `document_forms`, «Crear» muestra tarjetas de tipo (Factura / Nota de crédito / REP / Global / Traslado…) y, al elegir, los campos de ese tipo y un paso de renglones con `DocumentLinesGrid`; un solo tipo se salta el selector. Escribe el valor del tipo en `type_field`, serializa los renglones con `serializeLineItems`, muestra los 422 (banner + campos) dentro del diálogo y emite el evento de mutación para refrescar la lista. Sin manifest, el alta genérica no cambia. El SDK no embebe catálogos SAT: campos y valores los sirve el kernel o el addon. Nuevos tipos: `DocumentFormsManifest`, `DocumentFormType`, `DocumentFormLines`, `TableMetadata.document_forms`.

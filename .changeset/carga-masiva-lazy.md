---
"@asteby/metacore-runtime-react": patch
---

Carga masiva de imágenes: el asistente (vista previa, progreso, deshacer) se carga bajo demanda al pulsar «Cargar imágenes», fuera del JS inicial. En ops, subir a 53.12.0 llevó el shell a 1164 KB gzip y rompió el techo de no-regresión de 1160 KB. `BulkImageDialog` deja de exportarse del paquete (era nuevo en 53.12.0; el punto de entrada es `BulkImageImportButton`).

Además, `bulk-image-import` (lógica del lote) ya no entra en el grafo inicial: solo el descubrimiento de la galería (`deriveBulkImageTarget`, ahora en `bulk-image-target`) lo usa el botón. Se retiran de `index.ts` los exports `buildBulkImagePreview`, `parseBulkImageName` y `deriveBulkImageTarget` (el valor; el tipo `BulkImageTarget` se conserva), también nuevos en 53.12.0 y sin consumidores.

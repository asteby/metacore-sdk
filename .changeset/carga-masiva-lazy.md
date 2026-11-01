---
"@asteby/metacore-runtime-react": patch
---

Carga masiva de imágenes: el asistente (vista previa, progreso, deshacer) se carga bajo demanda al pulsar «Cargar imágenes», fuera del JS inicial. En ops, subir a 53.12.0 llevó el shell a 1164 KB gzip y rompió el techo de no-regresión de 1160 KB. `BulkImageDialog` deja de exportarse del paquete (era nuevo en 53.12.0; el punto de entrada es `BulkImageImportButton`).

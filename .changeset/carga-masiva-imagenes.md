---
"@asteby/metacore-runtime-react": minor
---

Carga masiva de imágenes a nivel catálogo. Nuevo `BulkImageImportButton` (y `BulkImageDialog`), montado en `DynamicCRUDPage` para cualquier modelo con galería (relación 1:N cuya columna de imagen declara `display_config.gallery: true`) y una columna `sku`. Asistente en cuatro pasos:

- Elegir un ZIP, una carpeta o imágenes sueltas con nombres `SKU.ext`, `SKU_2.ext`… (el ZIP se descomprime en el navegador).
- Vista previa: qué foto va a qué producto y en qué posición, SKU no encontrados, duplicados, baja resolución (lado largo < 600 px, configurable), archivos que no son imagen; cada fila importable se puede excluir.
- Importar con progreso por archivo (3 en paralelo); un error no detiene el resto. Una fila hija por foto, con posición a continuación de las existentes y ancho/alto medidos en el navegador.
- «Deshacer lote»: borra solo las filas creadas por ese lote. Los ids se guardan en un registro (localStorage, últimos 10 lotes) que también se puede descargar como JSON.

Solo usa contratos existentes (`GET /metadata/table`, `GET /data/<modelo>?f_<col>=in:`, `POST /upload`, `POST`/`DELETE /data/<hijo>`); no requiere cambios en el kernel. Nueva dependencia: `fflate`, cargada solo al elegir un ZIP.

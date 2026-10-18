---
"@asteby/metacore-dataload": minor
---

Pulido de `@asteby/metacore-dataload`:

- **Cola de revisión** (`ReviewQueue`, `useDataloadReviews`, `useReviewActions`): filas `review` con motivo, resultado y diff (del plan guardado de la corrida), aprobar o rechazar una o en lote con comentario, estado por decisión (pendiente, aprobada, rechazada, aplicada, resuelta por otra carga) y "aplicar aprobadas" (`apply_reviewed`). Una decisión viaja con la huella de la fila; si la fila cambió (409) la cola se recarga.
- **Subida por partes** más allá del límite en línea de 25 MB: `uploadSourceFile` / `useSourceFile` con progreso, reintento con espera exponencial por parte, reanudación sin reenviar lo que el servidor ya tiene, cancelación (descarta la subida) y sha256 por parte. Las fuentes ahora pueden ser `{ uploadId }` además de `{ content }`.
- **UI sensible a permisos**: `capabilities` (`launch`, `cancel`, `approve`, `retryMedia`, `verifyMedia`, `editOverrides`) oculta o deshabilita controles. Sin `capabilities` se ofrece todo; con un objeto, lo que falta se niega.
- **i18n**: todas las cadenas por clave, catálogos `es-MX` y `en-US` (`locale`), `messages` y `t` inyectables y `DataloadProvider` para fijarlo una vez. `DATALOAD_MESSAGES_ES` queda como alias obsoleto de `DATALOAD_MESSAGES_ES_MX`.
- **Editor de ajustes por organización** (`OverridesEditor`): ignorar columnas, encabezados adicionales, quitar campos, valores por omisión y limpieza global o por campo, validado con las reglas del kernel (`validateOverrides`, `resolveProfile`) y con vista previa del plan por dry-run.
- **Tipos al día con el kernel**: acción `review` con `review`/`outcome` por fila, `progress.review`, `run.review`, `checkpoint`, nuevas reglas de limpieza (`sanitize_html`, `collapse_blank_lines`, `auto_paragraphs`, `drop_lines:<regex>`), `cleanAdd`/`valuesAdd`, `finish`, `split`, `applyOrder`.
- **Accesibilidad**: tablas con `caption` y encabezados, regiones desplazables enfocables, foco visible en campos nativos, `aria-live` para subida, avance y decisiones.

Cambio de tipos: `RowPlan.review` y `DataloadRun.review` son obligatorios (el cliente los normaliza a `[]`); `DataloadSourceInput` es una unión (`InlineSourceInput | UploadedSourceInput`).

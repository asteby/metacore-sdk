---
'@asteby/metacore-genui': minor
---

Bloque `table` con mejor UX: `column.format` ahora se aplica (incluido `relative_date`, con la configuración regional del host y unidad hora/minuto), columnas `variant` (`text` | `badge` | `icon_text`) con `tones`, `labels` (`$t` resuelto con el `t` del host; sin etiqueta se humaniza el valor, nunca la clave cruda) e `icons` (resueltos con `resolveIcon`; los desconocidos se omiten), `max_height` (`sm` | `md` | `lg`, tokens en `TABLE_MAX_HEIGHT`) con scroll interno por teclado y cabecera fija, y `density: "compact"` que en contenedor estrecho usa filas compactas en lugar de tarjetas apiladas. Nuevos exports: `TableView`, `TABLE_MAX_HEIGHT`, `humanize`, `toTone`, `lookupGenUIIcon`. Retrocompatible: sin las propiedades nuevas el render no cambia. Esquema sincronizado con el kernel (PR #639) y regla `tones`/`labels`/`icons` solo con `variant` badge o icon_text en el validador; 16 vectores `table-*` de conformidad.

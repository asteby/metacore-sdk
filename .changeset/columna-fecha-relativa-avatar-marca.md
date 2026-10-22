---
'@asteby/metacore-runtime-react': minor
---

Columnas declarativas: `display: "relative_date"` pinta «hace X» (date-fns, locale del usuario) con tooltip de la fecha absoluta en la zona de la organización y, si se declaran `display_config.fresh_within` / `stale_after` (`30s|15m|6h|7d`), un punto de tono verde / ámbar / rojo según la frescura; se refresca cada 60 s sin refetch. El avatar (`display: "avatar"`) acepta `image_field` (logo por fila), `color_field` (color de marca de la fila para el respaldo de iniciales, con tinta de contraste AA), `subtitle_field` y `shape` (`rounded` por omisión | `circle`). Sin esa configuración el comportamiento previo no cambia.

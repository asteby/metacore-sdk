---
"@asteby/metacore-runtime-react": minor
---

Celdas de tabla ricas, declarativas y aditivas: `display: "chips"` (una lista JSON/CSV como badges de color, con `display_config.labels|colors|icons|max` y «+N»), `display: "meter"` (número con barra cuando `display_config.max` o `max_field` da el techo) y `display_config.also` en `color` (pinta también los colores de columnas hermanas, p. ej. principal + acento de una marca en una sola celda). Un host sin esta versión sigue mostrando la lista o el color de siempre. Se exportan `ChipsCell`, `MeterCell`, `SwatchCell` y `chipItems`.

---
"@asteby/metacore-runtime-react": patch
---

Tarjetas del tablero en móvil: el título y el subtítulo se parten hasta 2 líneas en vez de cortarse con «…», el valor del KPI escala con el ancho de la tarjeta (container query) para que cifras como `16.497,82` no se recorten, el chip de variación baja a su propia fila en tarjetas angostas y el relleno se compacta bajo 15rem. En tarjetas anchas el aspecto no cambia.

---
"@asteby/metacore-runtime-react": patch
---

Dashboard: el skeleton/empty del tablero (`DashboardEmptyMockup`) se veía
apretado y raro en móvil (3 columnas absolutas angostas en un teléfono). En
`<sm` ahora renderiza un stack vertical de cards a ancho completo; el reflow
animado de 3 columnas se conserva de `sm` hacia arriba. Toggle por CSS, sin JS.

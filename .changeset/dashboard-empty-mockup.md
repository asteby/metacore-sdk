---
'@asteby/metacore-runtime-react': minor
---

El empty state del Tablero ahora muestra un mockup animado en vez de un ícono
estático. Cuando no hay widgets (o ninguno visible tras el gating de permisos),
`DashboardGrid` pinta una silueta del propio dashboard —tiles skeleton (un
gráfico grande, un par de stat cards, una barra de progreso y una lista)— que
se desplazan y reacomodan suavemente entre sí, como piezas encajando en su
lugar. El mensaje pasa de "no hay nada" a "acá va a vivir tu tablero".

Detalles: animación CSS pura (un loop lento de ~11s, translate+scale sutil, sin
dependencias nuevas), tokens de tema (`bg-muted`) para light/dark automáticos,
`prefers-reduced-motion: reduce` congela todo, y el mock es decorativo
(`aria-hidden`). Se exporta el componente `DashboardEmptyMockup` por si un host
quiere reutilizarlo. Copy por defecto del empty ajustado al nuevo framing
(override vía `strings`).

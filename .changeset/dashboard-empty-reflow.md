---
'@asteby/metacore-runtime-react': patch
---

Empty state del Tablero: el mockup animado ahora reorganiza toda la grilla en
loop, pasando por cuatro composiciones de dashboard (A→B→C→D→A) — las skeleton
cards crecen, se achican y se redistribuyen como widgets reales probando
acomodos mientras carga. ~2s de reposo por layout y ~1.2s de transición fluida
sincronizada (todas las cards transicionan a la vez, mismo easing).

Cero solapes garantizado por construcción: la grilla son 3 columnas en orden
fijo × top/bottom, y cada layout solo cambia anchos de columna y el split
top/bottom, así que todo par de tiles conserva un eje de separación consistente
con un `gap` constante — bajo interpolación lineal eso jamás se cruza. Se agrega
un test que interpola los rects (t=0..1, paso 0.05) en cada transición y asserta
0 solapes (estático + en tránsito). Se mantiene tokens de tema, skeleton interno
tipo widget card, `prefers-reduced-motion: reduce` → grilla estática (layout A) y
`aria-hidden`.

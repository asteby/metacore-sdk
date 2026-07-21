---
'@asteby/metacore-runtime-react': patch
---

Empty state del Tablero: el mockup animado ahora es full-bleed, se mueve más y
va sin texto. Antes se percibía como una ilustración centrada casi estática con
un caption en inglés. Ahora los tiles skeleton llenan todo el área del
dashboard en una grilla 4×4 y se reacomodan de forma visible —pares que se
intercambian de lugar (horizontal, vertical y diagonal) con translate suave,
escalonados para que siempre haya 2-3 piezas en movimiento— como si el tablero
se estuviera armando solo. Se eliminó el caption ("Your dashboard is taking
shape"): la animación habla sola y así no se envía copy sin localizar. Se
mantiene el loop lento (~13s), tokens de tema y `prefers-reduced-motion: reduce`
(congela todo). El mock sigue decorativo (`aria-hidden`).

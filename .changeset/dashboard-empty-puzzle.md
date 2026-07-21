---
'@asteby/metacore-runtime-react': patch
---

Empty state del Tablero: el mockup animado pasa a ser un rompecabezas
deslizante (15-puzzle) de skeleton cards. Grilla fija 4×3 full-bleed con un
hueco; el único movimiento es una card adyacente al hueco que se desliza
exactamente un slot (~0.6s ease-in-out), una a la vez, con reposos de ~1.4s.
Por construcción las cards nunca se atraviesan ni se solapan — se verificó en
navegador muestreando todo el ciclo (0 solapes en 201 frames). La secuencia son
10 movimientos (5 de ida + 5 de vuelta reflejados) que devuelven todo al origen,
así el loop es perfecto y sin salto. Se mantiene tokens de tema,
`prefers-reduced-motion: reduce` (grilla estática completa, sin hueco) y
`aria-hidden`. Las cards ahora son skeletons de las widget cards reales
(chrome con borde/rounded-xl/bg-card + chip de icono, título/subtítulo, y cuerpo
por tipo: stat con número grande + delta, chart con barras, list con filas
dot+barra, progress con tracks) para que se lea como el dashboard armándose.

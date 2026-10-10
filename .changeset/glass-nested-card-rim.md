---
'@asteby/metacore-theme': patch
---

El pack Glass (`glass.css`) solo daba el tratamiento de "panel flotante" (rim, sombra, clip) a `sidebar-inset` y a diálogos/popovers. Cualquier `.bg-card` suelto (una tarjeta de settings, un estado vacío) solo recibía translucidez + blur, sin rim ni elevación — contra el fondo degradado ya visible se veía como un rectángulo opaco plano en vez de un panel de vidrio flotante.

Se agrega el mismo tratamiento a `.bg-card`, pero con `--border` (el hairline oscuro, ya documentado como "a dark hairline reads on white glass, a white one doesn't") en vez de `--glass-rim` (blanco): `.bg-card` vive anidado un nivel más adentro, ya dentro del fondo casi-blanco diluido por el blur del panel padre — ahí un rim blanco es blanco sobre blanco, invisible.

---
'@asteby/metacore-runtime-react': patch
---

El popover del selector de íconos ya no se corta dentro de modales altos: su
alto se limita al espacio disponible que mide Radix (min 24rem / available
height) con layout flex (buscador fijo + lista que scrollea), abriendo hacia
abajo.

---
"@asteby/metacore-runtime-react": patch
---

fix(dashboard): skeleton vacío = 3 cards estáticas a ancho completo

Sin animación de reflow. El stack ya no usa `mc-demock-tile` (absolute), así
que no se colapsa en una franja chica en móvil / con sidebar.

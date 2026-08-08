---
"@asteby/metacore-runtime-react": patch
---

fix(dashboard): skeleton vacío a ancho completo en viewports angostos

Las cards del stack móvil heredaban `mc-demock-tile` (position:absolute) y se
colapsaban en una franja chica arriba a la izquierda. Ahora el stack usa flow
normal, cards más altas (min 200px), y el breakpoint pasa a `lg` porque el main
de ops con sidebar suele quedar bajo 640px.

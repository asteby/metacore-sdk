---
"@asteby/metacore-runtime-react": patch
---

fix(kanban): el drag-to-move ya no duplica `/me` en el PUT (causaba 404 "No se pudo mover la tarjeta"); el board respeta el ancho del padre (`min-w-0`) y deja de desbordarse horizontalmente.

---
"@asteby/metacore-maps": patch
---

Fix: el mapa caia a la lista de reserva («El mapa interactivo no esta disponible en este navegador») con los limites por defecto de 0.5/0.6. MapLibre 6 lanza un `TypeError` (resize -> constrainInternal -> setZoom -> _calcMatrices) cuando `maxBounds` toca exactamente +-180 de longitud. Los limites (por defecto, de `configureMaps` o de la prop) se normalizan ahora a +-179.99 / +-84.99 en un solo sitio (`normalizeBounds`), y un fallo al crear el mapa ya no se traga en silencio (`console.warn`).

---
"@asteby/metacore-maps": patch
---

Fix: la capa `mcm-points-halo` (halo de contraste del tema oscuro) usaba un radio `['+', ['interpolate', ..., ['zoom'], ...], 6]` que MapLibre rechaza («"zoom" expression may only be used as input to a top-level "step" or "interpolate" expression»), de modo que el halo no se dibujaba. El radio se construye ahora con un `interpolate` de nivel superior (`zoomRadius`) para los puntos y el halo.

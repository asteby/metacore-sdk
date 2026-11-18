---
"@asteby/metacore-maps": minor
---

Mapa: los clusters con puntos en las mismas coordenadas (p. ej. centroides de país) ya no hacen zoom a un mapa vacío; muestran una lista de miembros clicable (max. 10 + "+N más") que dispara `onSelect`, y el zoom de un cluster se limita a 14. Nueva prop `selectZoom` (13 por defecto) y seleccionar un punto con vecinos en las mismas coordenadas solo centra, sin acercar. Tooltip al pasar el cursor sobre puntos y clusters (texto plano, nuevos labels `clusterCount` y `moreItems`). Colores de cluster y puntos dependientes del tema (anillo y azul más claro en oscuro, radio mínimo mayor).

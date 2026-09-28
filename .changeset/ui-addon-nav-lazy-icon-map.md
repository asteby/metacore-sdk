---
"@asteby/metacore-ui": patch
---

perf(ui): el mapa de íconos de `resolveIconName` (addon-nav) se carga con el primer ícono y ya no con la raíz del paquete. Cada remote federado que comparte `@asteby/metacore-ui` dejaba ~28 KB gzip de mapa en su chunk estático. Con este cambio, el grafo estático de collections baja de 257,8 a 227,2 KB gzip. La API no cambia. Un nombre desconocido pinta el ícono de reserva cuando termina de cargar el mapa.

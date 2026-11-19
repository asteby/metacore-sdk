---
'@asteby/metacore-maps': minor
'@asteby/metacore-genui': minor
---

Logo por punto en los mapas (multiindustria: tiendas, sucursales, dependencias, vehiculos, instancias).

- `MapPointItem.image` / `accent` / `subtitle`. Los pines del abanico (spiderfy), los marcadores individuales, el popup (encabezado logo + nombre + subtitulo + chip de estado), la lista bajo el mapa y las filas de la lista de cluster muestran un avatar circular con anillo del color de estado y borde que contrasta en claro y oscuro. Sin imagen o si falla la carga: iniciales con el color de marca (`accent`) o gris neutro; `aria-label`/`alt` con el nombre. El numero solo queda cuando ningun punto del mapa tiene logo ni color (mapas sin marca: igual que antes).
- Capas WebGL: un overlay perezoso (chunk aparte, solo si hay puntos con logo) pone avatares DOM sobre los puntos visibles (maximo 50 por vista; por encima quedan los circulos) y mosaicos de hasta 3 logos + conteo sobre clusters y burbujas de precision pais/ciudad. Se eligieron marcadores DOM y no capas `symbol` + `map.addImage` (ver `logo-overlay.ts`): `<img>` real con `loading=lazy`, `referrerPolicy=no-referrer`, sin `crossOrigin` (no se dibuja en canvas), fallback de iniciales y foco/nombre accesibles.
- Seguridad: solo se cargan imagenes `https:` o rutas del mismo origen; `http:`, `data:`, `javascript:` y `//host` se descartan; los colores pasan por `safeColor`.
- genui `map`: `image_field`, `color_field` y `subtitle_field` (esquema sincronizado con el kernel); no se repiten como filas de detalle. Vista de nav `map`: los mismos tres campos. `GenUIMapPoint` gana `image`, `accent`, `subtitle`.
- Atribucion de OpenFreeMap legible en tema oscuro (fondo y texto theme-aware con mas especificidad que el CSS compacto de MapLibre).
- `size-budget`: el chunk inicial sube de 17 a 20 KB gzip por las primitivas de avatar.

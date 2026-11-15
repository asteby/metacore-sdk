---
'@asteby/storefront': patch
'@asteby/storefront-react': patch
---

Mock sin red: `MOCK_IMAGE_URL` genera un SVG `data:` a partir de la semilla (mismo color para la misma semilla, tamaño intrínseco pedido) en vez de usar picsum.photos; una caída de ese servicio dejaba todas las páginas del mock sin evento `load` y rompía los e2e de las tiendas. `defaultImageLoader` deja intactas las URL `data:` y `blob:` (un `?width=` corrompía los bytes en línea).

---
"@asteby/storefront-react": minor
---

Mini-carrito: el «+» ya no pide más de lo que OPS dice que hay (`quantity_available` de la línea). No manda nada, deja la cantidad como está y avisa («Solo hay N disponibles de X», `labels.limit`; «se agotó» con 0) en vez de mostrar una cantidad que OPS rechazaría; bajar siempre se permite. `onQuantityLimit({ line, max })` sustituye el aviso por el de la tienda. Antes cada tienda tenía que validarlo a mano en su fetcher (lo hacía solo `store-protekauto`): ahora es una sola implementación del SDK. Nuevos `stockCap(line)` y `cartOptimistic.warn(text, title)`. Solo aplica con `useLineForm().submit`.

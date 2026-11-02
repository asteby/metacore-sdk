---
"@asteby/storefront": patch
---

`productListQuery` corta `q` a 200 puntos de código (lo que acepta la API) y exporta `clampProductQuery` y `PRODUCT_QUERY_MAX_LENGTH`. Antes, una búsqueda de más de 200 caracteres (texto pegado o URL armada) hacía que OPS respondiera 400 y la página `/buscar` de la tienda cayera en 500.

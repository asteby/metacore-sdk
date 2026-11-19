---
"@asteby/storefront-react": minor
---

Nuevo `@asteby/storefront-react/revalidate` (`createStoreRevalidation`): una sola política de `shouldRevalidate` para todas las tiendas. `skipOnCartAction` (rutas de catálogo y contenido) no vuelve a pedir a OPS lo que una acción del carrito o del boletín no pudo cambiar: antes cada «+/−» del mini-carrito repetía el loader de la ficha del producto (recomendaciones, reseñas, ~1 s). `skipOnSearchOnlyChange` (root) no revalida tienda, tema, menús ni carrito al filtrar, ordenar o paginar. Sustituye la copia que tenía `store-protekauto` y la que faltaba en las demás; cada tienda solo declara cuáles de sus acciones son del carrito.

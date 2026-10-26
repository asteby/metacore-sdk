---
'@asteby/metacore-ui': minor
---

`ProductThumb` y `ProductPreview` (subpath `/shared`): la foto del producto de las apps de administración. Relación de aspecto fija, `object-contain` sobre superficie suave, carga diferida, shimmer, fallback con inicial/ícono cuando no hay imagen o falla (respeta que un host reintente otra derivada antes de caer al fallback), `zoomable` con visor en diálogo y badge de cantidad. `ProductPreview` jerarquiza nombre, variante, SKU, cantidad y precios y degrada a «Producto no disponible» si el producto ya no existe. Tema claro/oscuro por tokens.

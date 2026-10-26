---
'@asteby/storefront-react': minor
---

`ProductThumb`, `ProductPreview` y `ProductThumbStack` (subpath `/ui`, también re-exportados desde `/account`): la foto del producto con relación de aspecto fija, `object-fit: contain`, `srcset` y carga diferida, shimmer mientras carga y un fallback diseñado (inicial del nombre o ícono de paquete) si no hay imagen, falla la carga o el producto ya no existe; la línea de producto jerarquiza nombre, variante, SKU, cantidad y precios. Estilos en `product-preview.css`, incluidos en `ui.css`, `cart.css`, `checkout.css` y `account.css` (tokens de la tienda, tema oscuro). Adoptado en el cajón del carrito, en `OrderSummary` (foto por línea por omisión; `media={false}` conserva la lista de texto), en `OrderCard` (fotos apiladas con "+N") y en el nuevo `OrderLines` (líneas del pedido para el detalle, tolerante a líneas sin imagen o malformadas). Presupuesto de las pantallas de pedidos: 14 a 16 KB gzip.

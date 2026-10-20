---
'@asteby/storefront-react': minor
---

Componentes de disponibilidad (headless, accesibles, es/en por clave, SSR y sin JavaScript): `AvailabilityBadge` (tarjeta y ficha: «Agotado», «Quedan N», «Bajo pedido», «Preventa»), `VariantOptionState` (opción tachada con «agotado» para lector de pantalla), `RestockNotifyForm` («Avísame», `<form method="post">` que funciona sin JS), `CartLineProblem` y `StockConflictAlert` (409 `insufficient_stock` recuperable: conserva carrito y datos, foco al alert, «Ajustar a N» / «Quitar»), hook `useAvailability`. `AddToCartButton` acepta `availability` / `availabilitySource` (etiqueta del servidor, deshabilitado si no se puede comprar, tope `max_per_order`); `useProductOptions` expone `availability` por valor. `productJsonLd` / `productMeta` publican `schema.org availability` desde el estado del servidor (`LimitedAvailability`, `BackOrder`, `PreOrder` + `availabilityStarts`) con polyfill y sin publicar cantidades.

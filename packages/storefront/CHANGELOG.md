# @asteby/storefront

## 0.4.0

### Minor Changes

- 270b5d8: Nuevo subpath `@asteby/storefront/geo` (haversine, ranking por distancia, estado de apertura con zona horaria, formato de horarios y `openingHours` de schema.org) y campos opcionales `opening_hours`, `timezone` y `opening_hours_text` en `ShopBranch`.
- 21994a8: `client.locations.list({ postal_code })`, `.get(id)` y `.nearest({ lat, lng })` (Storefront API `locations.v1`), tipos `Location`, `NearestLocation`, `LocationKind`, `LocationContacts` y `LocationPickup` (y campos opcionales equivalentes en `ShopBranch`), y las tres rutas en `createMockStorefront` con tres sucursales de ejemplo ordenadas por haversine. En el mock, la recolección solo se ofrece donde `pickup.enabled` y se cobra `pickup.fee`.

## 0.3.0

### Minor Changes

- 0c43cc2: Agrega `checkouts.get(id)` (`GET /storefront/checkouts/:id`, token de servidor) para leer un checkout ya colocado: devuelve la misma forma que `carts.checkout` y `null` si no existe. `order.number` sigue pudiendo ser `null` unos cientos de milisegundos tras el pago; la tienda consulta una o dos veces más y, si sigue `null`, mantiene el aviso de que el folio llegará por correo. La ruta la agrega el addon `storefront_cart` (asteby-hq/addons, folio del pedido) y el mock la implementa.

## 0.2.0

### Minor Changes

- 63e03d2: Alinea los tipos y el cliente con la API implementada en los addons `storefront_api` y `storefront_cart`: `CheckoutResult.order.number` puede ser `null`, `payment.instructions`/`action_type`/`embed_url`/`instructions_data`, `checkout` (`id`, `status`, `total`, `stock_hold_expires_at`), `StockLevel.quantity_available` admite `null`, los artículos aceptan `first` hasta 50, opciones de entrega con `carrier`, `delivery_type`, `eta_days_*`, `expires_at`, `partial` y `unavailable`, y los campos reales de `invoice`, `Address` y `Cart`. Agrega `carts.paymentMethods(id)` (`GET /storefront/carts/:id/payment-methods`) y su ruta en el mock. La consulta de pedido para invitados no existe en la API y no se incluye.

## 0.1.0

### Minor Changes

- b0a30c2: Nuevo paquete `@asteby/storefront`: cliente tipado de la Storefront API v1 (catálogo con filtros `filter.<atributo>`, facetas y paginación por cursor; colecciones; stock; carrito y checkout con `Idempotency-Key`; comprador por OTP; contenido: tema, páginas, menús y artículos) que solo usa `fetch` global, para Node 20+, edge y navegador, en ESM y CJS. Incluye `StorefrontError`, `formatMoney`, `parseMoney`, `isTokenPublishable`, ganchos `onRequest`/`onResponse` para capas de caché SSR y `@asteby/storefront/mock`, un mock en memoria de todo el contrato con datos de ejemplo de «Mi tienda».

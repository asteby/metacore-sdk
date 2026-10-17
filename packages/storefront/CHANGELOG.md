# @asteby/storefront

## 0.2.0

### Minor Changes

- 63e03d2: Alinea los tipos y el cliente con la API implementada en los addons `storefront_api` y `storefront_cart`: `CheckoutResult.order.number` puede ser `null`, `payment.instructions`/`action_type`/`embed_url`/`instructions_data`, `checkout` (`id`, `status`, `total`, `stock_hold_expires_at`), `StockLevel.quantity_available` admite `null`, los artículos aceptan `first` hasta 50, opciones de entrega con `carrier`, `delivery_type`, `eta_days_*`, `expires_at`, `partial` y `unavailable`, y los campos reales de `invoice`, `Address` y `Cart`. Agrega `carts.paymentMethods(id)` (`GET /storefront/carts/:id/payment-methods`) y su ruta en el mock. La consulta de pedido para invitados no existe en la API y no se incluye.

## 0.1.0

### Minor Changes

- b0a30c2: Nuevo paquete `@asteby/storefront`: cliente tipado de la Storefront API v1 (catálogo con filtros `filter.<atributo>`, facetas y paginación por cursor; colecciones; stock; carrito y checkout con `Idempotency-Key`; comprador por OTP; contenido: tema, páginas, menús y artículos) que solo usa `fetch` global, para Node 20+, edge y navegador, en ESM y CJS. Incluye `StorefrontError`, `formatMoney`, `parseMoney`, `isTokenPublishable`, ganchos `onRequest`/`onResponse` para capas de caché SSR y `@asteby/storefront/mock`, un mock en memoria de todo el contrato con datos de ejemplo de «Mi tienda».

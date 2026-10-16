---
"@asteby/storefront": minor
---

Nuevo paquete `@asteby/storefront`: cliente tipado de la Storefront API v1 (catálogo con filtros `filter.<atributo>`, facetas y paginación por cursor; colecciones; stock; carrito y checkout con `Idempotency-Key`; comprador por OTP; contenido: tema, páginas, menús y artículos) que solo usa `fetch` global, para Node 20+, edge y navegador, en ESM y CJS. Incluye `StorefrontError`, `formatMoney`, `parseMoney`, `isTokenPublishable`, ganchos `onRequest`/`onResponse` para capas de caché SSR y `@asteby/storefront/mock`, un mock en memoria de todo el contrato con datos de ejemplo de «Mi tienda».

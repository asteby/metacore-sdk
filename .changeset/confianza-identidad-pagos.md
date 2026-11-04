---
"@asteby/storefront": minor
"@asteby/storefront-react": minor
---

Confianza y transparencia con datos de OPS (contrato 1.30.0, aditivo). La regla para todas las tiendas: si no hay dato, no hay afirmación.

- `@asteby/storefront`: tipos `ShopLegal` (`Shop.legal`), `ShopPolicies.warranty_months` y `AcceptedPaymentMethods`. `sf.shop.paymentMethods()` (`GET /storefront/payment-methods`; `null` en servidores anteriores) devuelve las formas de pago que ofrece el checkout, sin carrito. Módulo de confianza:
  - `mergeShopSections` / `mergeShopText` / `resolveShopText` sustituyen los campos `{{shop.*}}` (los nuevos son `legal_name`, `tax_id`, `fiscal_address`, `service_address`, `privacy_officer`, `privacy_email` y `warranty_months`). A diferencia del «[por completar]» de las tiendas, quitan la entrada de lista o la sección que cita un dato no configurado, o que conserva un `{{completar: …}}` o el aviso `[BORRADOR: REVISAR CON ABOGADO]` (o el antiguo `[REVISAR CON ASESOR LEGAL]`).
  - `pagePublishable` decide si una página de contenido puede servirse; si no, la tienda responde 404.
  - `shopLegal`, `businessIdentity`, `identityComplete`, `shopWarrantyMonths` y `shopReturnsDays` leen solo `Shop`.
  - `isInternalProduct` marca los productos de QA (etiqueta `qa`/`interno`, o todos sus SKU con `TEST-`) para sacarlos de listados, sitemaps, feeds y datos estructurados.
  - El mock sirve `GET /storefront/payment-methods` y una identidad legal vacía (no inventa ninguna).
- `@asteby/storefront-react/checkout`: `acceptedPaymentMarks(methods)` convierte esa lista en marcas para `BrandMark` o en textos. La tarjeta sale como «Tarjeta de crédito o débito», sin suponer redes; los puntos de efectivo como OXXO, 7-Eleven o SPEI, y el monedero de Mercado Pago con su marca. `manual` se incluye solo si se pide y `mock` nunca.

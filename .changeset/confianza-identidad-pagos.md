---
"@asteby/storefront": minor
"@asteby/storefront-react": minor
---

Confianza y transparencia con datos de OPS (contrato 1.30.0, aditivo). La regla para todas las tiendas: si no hay dato, no hay afirmación.

- `@asteby/storefront`: tipos `ShopLegal` (`Shop.legal`), `ShopPolicies.warranty_months` y `AcceptedPaymentMethods`. `sf.shop.paymentMethods()` (`GET /storefront/payment-methods`; `null` en servidores anteriores) devuelve las formas de pago que ofrece el checkout, sin carrito. Módulo de confianza:
  - `mergeShopSections` / `mergeShopText` / `resolveShopText` sustituyen los campos `{{shop.*}}` (los nuevos son `legal_name`, `tax_id`, `fiscal_address`, `service_address`, `privacy_officer`, `privacy_email` y `warranty_months`). A diferencia del «[por completar]» de las tiendas, quitan la entrada de lista o la sección que cita un dato no configurado, o que conserva un `{{completar: …}}` o el aviso `[BORRADOR: REVISAR CON ABOGADO]` (o el antiguo `[REVISAR CON ASESOR LEGAL]`).
  - Cualquier `{{…}}` que quede después de sustituir (un campo desconocido o mal escrito, `{{completar…}}` en cualquier forma) bloquea el texto. El aviso de borrador se detecta aunque venga partido por etiquetas, con entidades, en minúsculas o sin acentos. También se revisan los valores ya sustituidos.
  - `pagePublishable` decide si una página se sirve; si no, la tienda responde 404. Con `{ strict: true }` (páginas legales, ver `isLegalHandle`) cualquier hueco la deja sin publicar. Un aviso de borrador dentro de una lista también la bloquea, y una lista que se queda vacía quita su sección.
  - `mergeShopPage(page, shop)` resuelve secciones, título y SEO de una vez y devuelve `publishable`. En páginas legales también bloquea los huecos de plantillas antiguas, como «[RAZÓN SOCIAL]» o «[FECHA]» (`hasTemplateBlank`).
  - Un valor que convierta un enlace en algo que no sea http(s), mailto, tel o una ruta (`javascript:`) bloquea el texto. Una prop `__proto__` no cambia el prototipo, y las props anidadas absurdamente profundas descartan su sección en vez de lanzar un error.
  - Campo nuevo `{{shop.warranty_term}}` («1 mes» / «6 meses»).
  - `shopLegal`, `businessIdentity`, `identityComplete` (exige razón social, RFC, domicilio fiscal y un medio de contacto), `shopWarrantyMonths` y `shopReturnsDays` leen solo `Shop`.
  - `isInternalProduct` marca los productos de QA (etiqueta `qa`/`interno`, o todos sus SKU con `TEST-`) para sacarlos de listados, sitemaps, feeds y datos estructurados.
  - El mock sirve `GET /storefront/payment-methods` y una identidad legal vacía (no inventa ninguna).
- `@asteby/storefront-react/checkout`: `acceptedPaymentMarks(methods)` convierte esa lista en marcas para `BrandMark` o en textos. La tarjeta usa la etiqueta del proveedor o «Pago con tarjeta», sin suponer redes; `bank_transfer` es «Transferencia bancaria»; los puntos de efectivo como OXXO, 7-Eleven o SPEI, y el monedero de Mercado Pago con su marca. `manual` se incluye solo si se pide y `mock` nunca.

# @asteby/storefront

## 0.11.1

### Patch Changes

- 9ae4581: storefront: `connect`, `connectStore` y `token.introspect()` se ajustan al contrato real de OPS. Respuestas en el sobre `{success,data}` (también acepta la forma plana); errores `{success:false,error,message}`. Petición con `client:{name,version,runtime,hostname}`; la respuesta de redeem trae `token`, `connection`, `scopes`, `rotation_days` y `api_base` (que se usa como base del cliente). El latido rota con `rotate_now` o `next_rotation_at`, respeta `Retry-After` en 429 y el estado `<archivo>.json` guarda conexión, `api_base`, `rotation_days` y `rotate_after`. Se elimina `--site` de la CLI.
- a12788c: storefront-react: subruta `@asteby/storefront-react/fiscal` (+ `/fiscal/server`, `fiscal.css`): `FiscalIdentityFields`, `IdentityDocumentReader`, `InvoiceToggle`, `InvoiceStatusCard`, `loadFiscalContext` y `createInvoiceAction` (incluida la lectura del documento sin JS). storefront: el mock acepta `invoice_use` en `fiscal`.

## 0.11.0

### Minor Changes

- 83e476b: storefront: conexión de la tienda con OPS. `StorefrontError.requiredScopes` y el código `insufficient_scope` (403), `client.token.introspect()` (GET /api/gw/_token), `diagnose(client)` (un aviso con la ruta de reparación si faltan alcances; nunca lanza ni imprime el token completo), `token` del cliente acepta `() => string`, y la subruta `@asteby/storefront/node` con `storefrontTokenFromEnv()` / `createFileTokenSource()` (`STOREFRONT_TOKEN_FILE`, `$CREDENTIALS_DIRECTORY/storefront_token`, relectura cada 30 s por mtime) y `connectStore().keepFresh()` (latido y rotación). Nuevo binario `npx @asteby/storefront connect --ops <url>` que canjea el código de conexión por TTY y escribe la clave de forma atómica con modo 0600. `CustomerCapabilities.unavailable_reason` / `missing_scopes`; el mock acepta `missingScopes`.

  storefront-react: `AccountAuth` y `createAuthAction` distinguen `store_misconfigured` (la credencial de la tienda no tiene permisos: mensaje es-MX al comprador y log en el servidor con la ruta de reparación) de `unsupported`; `loadAuthCapabilities` respeta `password:false` por falta de alcance.

- 4f10283: storefront: identidad fiscal del comprador, independiente del país. `sf.region()` (GET /storefront/region, con `fiscal_id.documents[]`), `carts.setInvoice()` (PUT /carts/{id}/invoice; 422 `invoice.<campo>`), `customer.update()` (PATCH /customer; `fiscal: null` borra) y los tipos `Region`, `FiscalIdentity`, `FiscalDocumentEvidence`, `IdentityDocumentSpec`, `InvoiceSummary` (stage, reason_code, action, can_request, blocked_reason, xml_url), `CartInvoice` y `CustomerCapabilities.invoicing`. Nueva subruta `@asteby/storefront/fiscal-document`: motor genérico `rules@1` (`extractIdentityDocument`, estrategias regex / labeled_lines / concat_labeled / catalog_phrases / date / qr_param; `discard_fields` jamás sale), `readPdfText` (navegador y Node, pdf.js legacy cargado bajo demanda con `isEvalSupported:false`, límites y errores tipados too_large / not_pdf / unreadable / no_text / password), `decodePdfQr` opcional, `buildDocumentEvidence` y `registerIdentityExtractor` para plugins por país. `pdfjs-dist >=4.2.67` y `jsqr` son peers opcionales; el worker lo aloja el consumidor (sin CDN). El mock sirve region, setInvoice, capabilities.invoicing, estados de factura por pedido y los 422/409 del contrato.

## 0.10.0

### Minor Changes

- 638eed6: `customer`: registro y login con contraseña. `capabilities()` (qué admite la tienda: contraseña, verificación por correo, canales OTP), `register()` (devuelve `{ status: 'verification_required' }` o `{ status: 'created', session }`), `verifyRegistration()`, `loginWithPassword()`, `setPassword()` (con `customerToken`) y `resetPassword()`. Tipos nuevos exportados (`CustomerCapabilities`, `CustomerRegisterInput`, `CustomerRegisterResult`, ...). El mock (`@asteby/storefront/mock`) los implementa: capabilities configurable con `customerCapabilities`, código de verificación `000000`, cuentas en memoria y errores 401/403/409/429 representativos (`maxLoginAttempts`).

## 0.9.0

### Minor Changes

- a890e3c: Add `parseDelivery`, `deliveryInput` and `deliveryNotices` (pure checkout helpers). `parseDelivery` splits the delivery radio value on the first colon only, so ids such as `rate:skydropx:<id>` are no longer truncated; `deliveryNotices` separates `missing_weight` from other unavailable providers. Storefronts should import these instead of keeping their own copy.

## 0.8.0

### Minor Changes

- 14274d0: Mock: opciones `shippingRates` (tarifas tipo paquetería con `carrier`, días hábiles y vigencia de 24 h por omisión) y `paymentMethods` para diseñar y probar el checkout como se ve con OPS real.

## 0.7.0

### Minor Changes

- 361ad9b: Detección de mercado por visita, pura y sin DOM: `visitorCountry` (cabeceras de país del CDN), `preferredLanguages` / `negotiateLocale` (Accept-Language), `suggestMarket` (sugiere, no redirige: respeta rastreadores y la elección guardada; el país manda sobre el idioma) y `hreflangLinks` para SEO por mercado. El mercado canónico sigue siendo el del dominio verificado en OPS.

  El cliente acepta `domain` y `market`: envía `X-Storefront-Domain: <host>#<market>` para que UN dominio público sirva varios mercados (la tienda enruta por prefijo `/mx`, `/us`); OPS lo honra si la organización tiene ese mercado activo. Nuevo `storefrontDomainHeader`.

## 0.6.0

### Minor Changes

- 7201b08: Disponibilidad de inventario (contrato Storefront API 1.1): tipos `Availability`, `AvailabilityStatus`, `CartLineProblem`, `InsufficientStockLine`, `RestockSubscriptionInput`; `availability` opcional en `ProductVariant`, `Product` y `StockLevel`; `CartLine.problem`; `StorefrontError.details` y `.stockLines` para el `409 insufficient_stock`; `client.restock.subscribe()` («Avísame cuando vuelva»). Nuevo `availabilityView(availability, locale)` (textos es/en por clave, sobrescribibles), `resolveAvailability` (polyfill desde `available_for_sale` / `quantity_available` para servidores que aún no mandan `availability`), `cartLineProblemView`, `schemaAvailability` y `productAvailability`. El mock publica `availability`, `CartLine.problem`, el detalle del 409 (con mensaje sin cantidades) y `POST /storefront/restock-subscriptions`; su mensaje del 409 cambió de «Only N available for SKU» a un texto sin cantidades.
- f69aa91: Pago integrado y promociones (contrato Storefront API 1.2, aditivo). Tipos: `PaymentOption`, `PaymentClient` (con `csp`), `PaymentAction`/`PaymentVoucher`, `PaymentAttemptResult`, `DeclineCode`, `CartPromotions`, `CartDiscountLine`, `CartRecommendation`, `PromotionAnnouncement`; campos opcionales en `PaymentMethod` (`options`, `client`), `CheckoutInput` (`payment_flow`, `payment_option`, `expected_total`), `CheckoutPayment` (`flow`, `client`, `action`), `Cart.promotions` y `CartCost.discounts`. Cliente: `checkouts.paymentConfig(id)` (`GET /storefront/checkouts/:id/payment-config`) y `checkouts.pay(id, input, { idempotencyKey })` (`POST .../payment`; la llave es obligatoria y lanza antes de llamar), `carts.setNote`, `carts.recommendations`, `promotions.list`. Helpers puros es/en y sin DOM: `paymentOutcome` (approved / in_review / voucher / challenge / redirect / rejected / expired / cancelled; solo https en fichas y redirecciones), `paymentErrorView` (red → reintento con el mismo intento; 409/422/429), `declineMessage` (motivo accionable por `decline_code`), `formatVoucherExpiry`, `paymentIdempotencyKey`, `promoProgressView`, `rewardLabel`, `normalizeNote`. Nada calcula montos: `remaining`, `percent` y `reached` son del servidor. El mock sirve `POST /checkouts/:id/payment` (resultados por token `tok_APRO`, `tok_FUND`, `tok_3DS`..., efectivo con ficha, idempotencia, 409/422/429), `PUT /carts/:id/note`, `GET /carts/:id/recommendations`, `GET /promotions` y `GET /checkouts/:id/payment-config`. Alineado con `docs/PAGO-INTEGRADO.md` del addon `mercadopago` y con `pay.go` de `storefront_cart` (`outcome`, `next_step`, voucher con `amount` + `currency`).

## 0.5.0

### Minor Changes

- 01d87e3: Reenvía la IP del comprador en las llamadas del servidor: opción `clientIp` del cliente, `client.withClientIp(ip)` y `{ clientIp }` por llamada. Se manda como `X-Storefront-Client-IP`, solo con tokens `sk_`/`pt_` (nunca con `pk_`) y descarta valores que no sean una sola IP. OPS la usa únicamente en tokens emitidos con `opts:trust_client_ip`: el cupo de tasa y el límite de códigos OTP pasan a contarse por comprador y no por el servidor SSR. Se exportan `normalizeClientIp` y `CLIENT_IP_HEADER`.
- f9eea88: Mockups de respaldo para productos sin imagen. `@asteby/storefront/mockup` (puro, sin DOM): `resolveMockupKind` (atributo `mockup_kind` → atributos de llanta/refacción → palabras en tipo, categoría y etiquetas → `generic`, con reglas configurables) y extractores tipados (`tireMockupData`, `partMockupData`, `supplementMockupData`, `genericMockupData`, `mockupDataFromProduct`) que solo leen lo que trae el producto, nunca precios, con textos limpios y recortados. `@asteby/storefront-react/mockups`: `<ProductImage>` usa la imagen de OPS (`Image` con `alt`, tamaño y `priority`) y si no hay dibuja un SVG SSR sin JS ni red (`role="img"` + `<title>` que dice "Ilustración de referencia"; `alt=""` lo vuelve decorativo): llanta con medida en cifras e índices, ficha de refacción con número de parte y compatibilidad, bote/frasco/bolsa de suplemento con sabor y presentación, y caja genérica con monograma. Registro extensible (`createMockupRegistry`, `registerMockup`, `MockupProvider` con `resolveKind` y textos), `MockupFrame`/`MockupText` para mockups propios y tema por variables CSS (`--mockup-bg`, `--mockup-ink`, `--mockup-accent`…) que heredan del tema de la tienda y soportan modo oscuro.

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

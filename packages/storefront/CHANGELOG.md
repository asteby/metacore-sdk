# @asteby/storefront

## 0.16.1

### Patch Changes

- 518c55c: Pedidos de la cuenta: método de pago legible y motivos reales de la factura.

  - `PaymentSummary` y `RefundList` ya no muestran la clave cruda del proveedor (`Card`, `credit_card`, `oxxo`): `paymentLabel` arma «Tarjeta Visa •••• 1234», «Tarjeta de débito», «Efectivo en OXXO», «Transferencia SPEI», «Billetera digital»… en es/en (`payment.method.*`, ajustables con `messages`), usa `family`, `brand` y `last4` si el servidor los manda, respeta una frase que el servidor ya escribió con su detalle y cae a «Medio de pago», nunca a la clave. Extensible por tienda/organización con `methodLabel`. `PaymentInfo` gana `brand` y `last4` (opcionales).
  - `loadFiscalContext` devuelve `reason` (`available`, `off`, `no_region`, `unknown`, `unreachable`) en vez de un solo «no disponible». Un servidor que no publica `capabilities.invoicing` es `unknown`: ya no se afirma que la tienda no factura.
  - `InvoiceStatusCard`: nuevo `availability={ctx.reason}`. Solo `off`/`no_region` (el servidor dice que no hay facturación) muestra «Facturación aún no activa»; con `unknown`/`unreachable` decide el resumen del propio pedido (`can_request`, etapa, folio) y, sin nada que mostrar, un texto neutro (con «Actualizar» si no se pudo consultar). Nuevos `windowDays` («Puedes pedirla hasta N días después de la compra») y `testMode` (aviso de facturación en pruebas, `InvoicingCapabilities.test_mode`). El texto de `unavailable` ya no dice que la tienda no emite facturas.

## 0.16.0

### Minor Changes

- 234ed7d: Panel de cuenta (contrato Storefront API 1.9, aditivo). Tipos `FiscalProfile` y `FiscalProfileInput`; `RegionFiscalId.person_patterns`, `checksum` y `default_invoice_use`; `RegionFiscalEntry.suggested_for_regimes` (uso de CFDI sugerido, dato del paquete de región); `IdentityDocumentSpec.image_mode` (`none | qr_only | full`); `InvoiceRequest.profile_id`; `CustomerCapabilities.fiscal_profiles`. Cliente: `customer.fiscalProfiles.{list,create,update,delete}` (privado, sin caché). `@asteby/storefront/fiscal-document` suma `decodeImageQr(source)`: lee el QR de una foto, de un fotograma de cámara, de un `ImageBitmap`/canvas o de píxeles, en el dispositivo y en memoria (la imagen no sale, no se guarda y no se lee su EXIF), con límites (`maxBytes` de la región, lado mayor reescalado a 1600 px), `BarcodeDetector` primero y `jsqr` opcional de respaldo, ambos perezosos; error nuevo `not_image`. Con `extractIdentityDocument('', spec, { qr })` el QR llena RFC e id del documento. El mock sirve los perfiles (máx. 10, uno predeterminado, borrado físico, `Customer.fiscal` espejo) y los datos nuevos de región de México.

## 0.15.0

### Minor Changes

- f556c63: El estado de la dirección es el de su código postal. `AddressFields` ahora bloquea el estado por omisión cuando `lookupPostalCode` lo resuelve (`lockProvinceOnFill` pasa a `true`; `false` conserva lo anterior): candado visual, tooltip y nota «Definido por tu código postal» (`messages.provinceLocked`) y una acción discreta «Cambiar código postal» (`messages.changePostalCode`). El bloqueo ya no es una trampa: al editar el código postal se libera y se limpia lo que el lookup había llenado (estado, ciudad, colonia), también cuando el código nuevo no resuelve nada; un `<select>` recupera su `name` y pierde el campo oculto espejo. Nunca borra lo que el comprador escribió. Además `@asteby/storefront` agrega `client.postalCode(zip)` (`GET /storefront/region/postal-code`, `RegionPostalCode`), la fuente natural del `lookupPostalCode` (misma tabla y nombres con que el servidor re-valida estado y CP en `storefront_cart`; `null` si el CP no está en el catálogo).

## 0.14.0

### Minor Changes

- 358a1f4: Cuenta del comprador (contrato Storefront API 1.8): tipos de `Order` con `progress`, `next_action`, `shipments[]`, `shipments_summary`, `invoices[]` (facturas y notas de crédito), `payments[]`, `refunds[]` y `degraded[]`; `Shipment`, `GeoHint`, `InvoiceDoc`, `PendingPayment`, `InvoiceFile` (enums abiertos: un valor desconocido no rompe). Cliente: `customer.pendingPayments()` y `customer.invoiceFile()` (ruta autenticada `order_invoice_file`: devuelve el archivo en base64, nunca una URL del PAC). Helpers puros `orderProgress`, `nextAction`, `sortTrackingEvents`, `isTestShipment`, `isTestInvoice`, `safeTrackingUrl`, `groupInvoiceDocs`, `invoiceFileBytes`. El mock sirve pedidos de demostración en todos los estados y fichas de pago pendientes.

  Endurecido: `invoiceFile` nunca sigue redirecciones (`redirect: 'error'` y rechaza una respuesta redirigida) y ningún id de ruta acepta segmentos `.`/`..`; `pendingPayments` contra un OPS sin la ruta (404) devuelve una lista vacía. `orderProgress` entiende el estado `ready` del servidor real (recogida lista / preparando), avanza al ritmo del envío MENOS avanzado (una entrega parcial no es «entregado»), no presenta como enviado un `shipped` respaldado solo por envíos de prueba, toma la fecha de pago de `payments[]` y depura un `progress` mal formado. `nextAction` respeta `next_action: null` y la `action` de la factura del servidor, y nunca ofrece primero una factura de sandbox.

## 0.13.0

### Minor Changes

- 361af35: 3DS en modal real: `PaymentChallenge` ahora trae estilos por defecto en `payments.css` (`dialog[data-sf-challenge]`: casi pantalla completa, ancho completo en móvil, colores fijos porque la página del banco es blanca), no se cierra con Esc ni clic en el fondo mientras el pago está en curso, y muestra «Cancelar y volver al pago» solo tras `escapeAfterMs` (120 s, WCAG 2.2.1). `PaymentBrick` lo conecta a la nueva `cancelChallenge()` del hook: el resultado queda DESCONOCIDO (el banco pudo aprobar), así que conserva la llave de idempotencia, bloquea un pago nuevo (`blocked` / `payment_in_progress`) y verifica con `refresh` hasta la respuesta del banco; solo un rechazo, vencimiento o cancelación definitivos dan un intento nuevo. Si el navegador cierra el diálogo de todos modos (segundo Esc, gesto atrás de Android), la página ofrece volver a la verificación. El sondeo del reto sube de 60 s a 5 min. Mensajes nuevos `challenge.escape`, `challenge.escape_hint` y `challenge.left`.

## 0.12.0

### Minor Changes

- 67ccba1: Cobro con tarjeta resiliente, generalizado desde store-protekauto para que ninguna tienda lo copie.

  `@asteby/storefront`: `StorefrontError` conserva lo que OPS manda en `error.*` (`retryable`, `retryAfter`, `checkoutId`, `cost`, `messageEn`) y se agrega `classifyPaymentError(err)` -> `{ kind, retryable }` sin textos, igual en servidor y navegador (honra `retryable:false` y los códigos `payment_provider_rejected`, `payment_provider_misconfigured`, `unavailable`, `invalid_state`). `PaymentAttemptStatus` suma `none` (solo de la ruta de estado de la tienda).

  `@asteby/storefront-react`: `createResilientTransport` (misma clave, consulta de estado, una sola petición ante `retryable:false`), `PaymentHttpError.retryable/kind`, `usePaymentRecovery` y `<PaymentRecovery>` (textos en es-MX sobrescribibles, alternativas desde las `choices`); `jsonPayRoute` y handlers que responden siempre JSON con `retryable` y `kind` y 500 en vez de 502-504; `/estado` sin sesión responde 200 `none`. Formulario de tarjeta estable: se monta una vez, `MountedPaymentForm.update({ amount })` (Mercado Pago: `controller.update`), cola de montajes con `create` acotado en el tiempo, sin remontar al teclear el correo ni durante el cobro; el hook sigue verificando ~2 min tras un resultado desconocido; `checkoutShouldRevalidate`. `AddressFields`: un solo escritor, respeta foco y edición del comprador, colonia solo si es única y marca sus eventos (`isAddressFillEvent`).

  Cambios que se notan (no es solo aditivo): los handlers responden 500 en vez de 502-504; los mensajes salen del catálogo (los textos propios de la tienda, como `messages.tooManyRequests`, se conservan); `/estado` sin sesión responde 200 `none` en vez de 404; el correo ya no remonta el Brick y un cambio de total actualiza el formulario en su sitio dentro de un `div` interno; con resultado indeterminado (también un 5xx sin cuerpo) PAGAR reusa la misma clave y los mismos datos, y un cambio de total espera; `PayErrorBody` exige `retryable` y `kind`; `AddressFields` rellena la colonia única y un campo enfocado vacío. Detalle en la sección «Cambios que se notan» del README de storefront-react.

## 0.11.2

### Patch Changes

- 005c658: mock: `validateInvoiceRequest` (CSF/CFDI) acepta `zip` y `cfdi_use`, ya en uso por
  storefronts en producción, como alias de `postal_code` y `use`. Antes el mock los
  rechazaba con "Not a valid postal code" aunque el dato fuera válido, porque solo
  reconocía `postal_code`/`cp` y `use`/`uso_cfdi`/`invoice_use`.

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

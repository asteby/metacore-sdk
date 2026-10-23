# @asteby/storefront-react

## 0.12.0

### Minor Changes

- 4c5b2e6: `/checkout`: piezas nuevas para el formulario de pago, sin cambiar nada de lo existente. `ContactFields` y `AddressFields` (orden y `autocomplete` correctos, colonia y referencias como campos propios `neighborhood`/`reference` de la API, código postal primero con formato, estados y consulta por código postal puestos por la tienda; nada de país escrito en el SDK). `useFieldErrors` + `CheckoutField` + `ErrorSummary`: validación en línea con las reglas del HTML, texto del error bajo el campo, resumen enfocable al enviar y errores del servidor; sin JavaScript valida el navegador. `OrderSummary` (totales de `cart.cost` tal cual, envío pendiente/actualizando/gratis, impuestos incluidos como nota) y `OrderSummaryDisclosure` (resumen plegable para teléfono con el total, `<details>` nativo sin salto al hidratar). Estilos base en `checkout.css`.
- 44e15d8: Checkout más claro (auditoría UX de /pagar):

  - `/checkout`: `DeliveryOptions` acepta `layout="recommended"`: hasta tres tarifas con etiqueta (más económica, más rápida y «Recomendado», la de mejor equilibrio precio-tiempo) y el resto en «Ver más opciones (N)» agrupado por paquetería sin repetir el nombre; descarta servicios repetidos; se abre solo si la tarifa elegida está dentro (también sin JavaScript). Nuevos `recommendRates()` y `dedupeRates()`. `error` + `onRetry` para una cotización fallida. Por omisión (`layout="list"`) todo sigue igual. Texto de `partial` más amable.
  - `/payments`: el formulario de tarjeta se abre debajo de su propia fila (antes, después de todas las filas); la elección de pago y el punto de efectivo se recuerdan por carrito en `sessionStorage` (`rememberChoice`, por omisión sí con `scope`); `cashPointsVisible` limita los puntos a la vista; el correo del formulario de la página se pasa al Brick (`payerEmailField`, por omisión `email`) y Mercado Pago ya no muestra «Completa tu información / E-mail»; en página oscura el Brick monta su tema `dark` (`readPaymentScheme`, `colorScheme` en el adaptador) y lee más tokens `--sf-pay-*`. Botón: «Generar ficha de pago» con efectivo (`placeOrderCash`) y «Elige la entrega para continuar» sin entrega (`chooseDelivery`).

## 0.11.1

### Patch Changes

- 0178422: Checkout: el logo de Mercado Pago (y de cualquier proveedor) en las filas «Cuenta» y «Sin tarjeta» ya no se encima sobre el radio ni el texto: va en su propio espacio en línea (`data-sf-pay-icon="mark"`) en vez de la caja fija `icon` de la tienda. Se incluye el logo real de iMile (sitio oficial, ver `LOGOS.md`) y la insignia de SPEI, que sigue sin logo con condiciones claras, se dibuja más grande y legible.
- Updated dependencies [a890e3c]
  - @asteby/storefront@0.9.0

## 0.11.0

### Minor Changes

- a4eaa87: `/checkout`: `BrandMark` dibuja LOGOS REALES de marcas (FedEx, DHL, Estafeta, UPS, 99 Minutos, J&T, USPS, OXXO, 7-Eleven, Circle K, Soriana, Walmart, Chedraui, BBVA, Santander, Banorte, Citibanamex, HSBC, Scotiabank, Visa, Mastercard, American Express, Mercado Pago, PayPal, Apple Pay, Clip, Farmacias Yza) en lugar de insignias tipográficas. Van incrustados (sin peticiones de red), sin recolorear, sobre una placa blanca con filo sutil válida en tema claro y oscuro. Precedencia: `logo_url` del proveedor > logo incluido > insignia de respaldo (Paquetexpress, Redpack, SPEI y otras sin fuente con condiciones claras; ver `LOGOS.md`). Nuevas claves: `hsbc`, `scotiabank`, `bodegaaurrera`, `farmaciasguadalajara`, `farmaciadelahorro`; nuevo `brandLogo()` y atributo `data-sf-brand-source`. El ancho del logo sigue su forma (alto fijo): la insignia ya no es siempre 3:2. Aumenta el bundle de `/checkout` y `/payments` en ~112 KB (~38 KB gzip) por los logos.

### Patch Changes

- 16c636e: fix(pago): el formulario incrustado de Mercado Pago oculta su propio encabezado (`visual.hideFormTitle`). Mostraba "Tarjeta de crédito o débito" y las banderas de tarjetas aceptadas, que repiten lo que la tienda ya enseña en su fila de método de pago, y las banderas se veían cortadas (AMEX partido en dos líneas) al estrecharse el contenedor.

## 0.10.0

### Minor Changes

- 14274d0: Nuevo subpath `/checkout`: `DeliveryOptions` (tarifas de envío con marca y nombre comercial de la paquetería, llegada en días hábiles, insignias «Más económico» / «Más rápido», una sola nota de vigencia en la hora del comprador y esqueleto al recotizar) y un catálogo compartido de marcas (`BrandMark`, `brandName`, `brandKey`) para paqueterías, tarjetas, billeteras y puntos de efectivo. `PaymentMethodSection` dibuja las marcas (redes de tarjeta con `cardBrands`, puntos de efectivo, Mercado Pago en sus filas; `brandMarks={false}` para apagarlas) y ahora guarda la entrega antes de mostrar el total con cualquier forma de pago, no solo con tarjeta: el botón ya no muestra un total sin envío. Tarifa vencida o cambiada: `isQuoteChange` y `matchRate` para recotizar sin perder la dirección ni el servicio elegido, `DeliveryOptions requoted` y `syncDelivery` puede resolver `'requote'` (aviso, no error).

### Patch Changes

- Updated dependencies [14274d0]
  - @asteby/storefront@0.8.0

## 0.9.0

### Minor Changes

- f6c4953: `@asteby/storefront-react/payments` ahora cubre el «Método de pago» híbrido completo: `PaymentMethodSection` (filas por opción de OPS, tarjeta con formulario seguro dentro de la página, efectivo con puntos de pago, redirección para cuenta del proveedor y pagos sin tarjeta; degrada al envío normal sin JavaScript o si el formulario no carga; textos, iconos, clases y rutas por props; hoja opcional `payments.css`), las funciones puras `buildPayChoices`/`parseChoice`/`cashProviderData`/`checkoutToAttempt`/`payErrorResponse`/`voucherRows`, `paymentMethodMessages` (es/en) y ayudas de CSP (`paymentCspMode`, `paymentNonce`, `paymentCspHeaders`, `scriptHashes`/`imgHttps`). Nuevo subpath `@asteby/storefront-react/payments/server` con `createEmbeddedPayHandlers`: cobro de tarjeta, estado del pago y ficha de efectivo, parametrizados por callbacks de cookie/comprobante, con límite por IP, validación de origen y filas ocultables. Los montos salen siempre del total de OPS.

## 0.8.0

### Minor Changes

- b2ee62c: Nuevo subpath opcional `@asteby/storefront-react/cart` (y hoja `cart.css`): `CartDrawer`, el cajón lateral "Tu carrito (N)" para tiendas con OPS. Sin textos, rutas, moneda ni marca fijos (labels, paths, renderers, iconos y `classNames` por props); muestra `cart.cost` de OPS y muta por la acción de ruta de la tienda con formularios nativos (sin JavaScript) o un `Form` de fetcher inyectable. Incluye `openCartDrawer`/`closeCartDrawer`/`useCartDrawer`, `useOpenCartDrawerWhenDone` (abre al terminar un agregado) y `handleCartLinkClick` (el enlace de la cabecera abre el cajón, con `href` de respaldo). `<dialog>` modal con foco atrapado, Esc, clic fuera, scroll del fondo bloqueado y `prefers-reduced-motion`.
- 71e099c: Nuevo subpath opcional `@asteby/storefront-react/fitment`: compatibilidad de vehículos para tiendas de refacciones (catálogo marca → modelo → año → motor, clave de vehículo, opciones en cascada del selector, estado de compatibilidad `withFit`/`fitStatus`, tabla de compatibilidad y `safeRedirect`). Funciones puras sin textos ni marcas: los prefijos de etiqueta, el atributo de la tabla y las grafías de prioridad se inyectan con `fitmentConfig` y `parseCatalog`.

## 0.7.0

### Minor Changes

- 361ad9b: Scroll moderno compartido: `@asteby/metacore-theme/scrollbars.css` (barras delgadas y redondeadas en `currentColor`, claro y oscuro sin tokens nuevos, `overscroll-behavior` en diálogos y listas). `index.css` del tema ya lo importa, así que el admin de ops lo hereda al actualizar; `@asteby/storefront-react/ui.css` lo incluye inlineado desde la misma fuente.
- 361ad9b: Nuevo subpath `@asteby/storefront-react/ui` (y `ui.css`) con piezas de tienda reutilizables y sin dependencia de router: `Select` (listbox propio con mejora progresiva sobre `<select>` nativo), `Swatch` (muestra 2D plana para variantes: color, combinaciones o emoji; el catálogo manda sobre el nombre vía `parseSwatchAttribute`), `ThemeToggle` + `THEME_INIT_SCRIPT` (claro/oscuro sin parpadeo), `InstallApp` + `useServiceWorker` (PWA), y los estilos `.select`, `.check` y `.radio` basados en los tokens de la tienda.

  Motor de muestras genérico `createSwatchResolver` con diccionarios inyectados (el SDK solo trae colores básicos; los sabores/emojis los aporta la tienda), `optionHasSwatches`, mezclas de emoji apiladas y badge pastel de color con emoji.

### Patch Changes

- Updated dependencies [361ad9b]
  - @asteby/storefront@0.7.0

## 0.6.0

### Minor Changes

- 6653e4c: Exportador de tipos de sección al formato de OPS: `registry.toOpsSectionTypes()` / `sectionTypesToOps()`, validación local (`validateOpsSectionTypes`, `SectionTypesValidationError`) y `syncSectionTypes()` (PUT `/storefront/content/section-types` con token `sk_`). `defineSection` acepta `category` y `maxPerPage`.

### Patch Changes

- 52435d3: Las secciones aceptan la prop `image` como `{ url, alt }` (la forma que OPS publica) además de la URL suelta; antes la sección se descartaba con «must be a string».

## 0.5.0

### Minor Changes

- 7201b08: Componentes de disponibilidad (headless, accesibles, es/en por clave, SSR y sin JavaScript): `AvailabilityBadge` (tarjeta y ficha: «Agotado», «Quedan N», «Bajo pedido», «Preventa»), `VariantOptionState` (opción tachada con «agotado» para lector de pantalla), `RestockNotifyForm` («Avísame», `<form method="post">` que funciona sin JS), `CartLineProblem` y `StockConflictAlert` (409 `insufficient_stock` recuperable: conserva carrito y datos, foco al alert, «Ajustar a N» / «Quitar»), hook `useAvailability`. `AddToCartButton` acepta `availability` / `availabilitySource` (etiqueta del servidor, deshabilitado si no se puede comprar, tope `max_per_order`); `useProductOptions` expone `availability` por valor. `productJsonLd` / `productMeta` publican `schema.org availability` desde el estado del servidor (`LimitedAvailability`, `BackOrder`, `PreOrder` + `availabilityStarts`) con polyfill y sin publicar cantidades.
- 33f2583: Pago integrado y promociones, en dos subrutas nuevas sin estilos propios. `@asteby/storefront-react/payments`: `PaymentBrick` y hook `useEmbeddedPayment` (carga el SDK con la llave pública del servidor, envía solo el token al servidor de la tienda, estados approved / en revisión / ficha de efectivo con referencia y vencimiento / 3DS en `<dialog>` / redirección / rechazo con motivo accionable / error de red con reintento del mismo intento, idempotencia por intento, doble clic seguro, respaldo si el SDK no carga, tokens CSS `--sf-pay-*`), puertos reemplazables `PaymentFormAdapter` y `PaymentTransport` (`createFetchTransport`), `mercadoPagoBricksAdapter` (solo deja salir token, método, emisor, cuotas e identificación; nunca el monto), `loadPaymentSdk` (nonce, timeout, https y origen permitido), `paymentCsp` y `VoucherCard`. `@asteby/storefront-react/promotions`: `PromoPopup` (frecuencia por sesión / N días / versión, exclusiones de ruta, solo cliente tras hidratar, rastreadores, vigencia, disparadores por tiempo, página o scroll, `<dialog>` con foco, Esc y cierre de 44 px; el contenido llega como datos), `CartProgressBars`, `CrossSellModal` y `OrderNote` (con respaldo `<form method="post">` sin JS). Textos es/en sobrescribibles por clave.

### Patch Changes

- Updated dependencies [7201b08]
- Updated dependencies [f69aa91]
  - @asteby/storefront@0.6.0

## 0.4.0

### Minor Changes

- 3a3f97f: `defineMockup({ kind, match?, data?, describe?, render })` y `createStoreMockups(definiciones, { base?, labels? })`: el contrato de un mockup de tienda en un archivo y el registro + `resolveKind` listos para `<MockupProvider {...storeMockups}>`. Las piezas base (`TireMockup`, `PartMockup`, `SupplementMockup`, `GenericMockup`) se reutilizan tal cual o se reemplazan; la API publicada no cambia. El suplemento ya no corta palabras largas (CREATINA MONOHIDRATADA → "MONOHIDRATA…"): ajusta la letra a la palabra más larga (`wrapMockupText(..., wordMax)` y `mockupWordMax`).

## 0.3.0

### Minor Changes

- f9eea88: Mockups de respaldo para productos sin imagen. `@asteby/storefront/mockup` (puro, sin DOM): `resolveMockupKind` (atributo `mockup_kind` → atributos de llanta/refacción → palabras en tipo, categoría y etiquetas → `generic`, con reglas configurables) y extractores tipados (`tireMockupData`, `partMockupData`, `supplementMockupData`, `genericMockupData`, `mockupDataFromProduct`) que solo leen lo que trae el producto, nunca precios, con textos limpios y recortados. `@asteby/storefront-react/mockups`: `<ProductImage>` usa la imagen de OPS (`Image` con `alt`, tamaño y `priority`) y si no hay dibuja un SVG SSR sin JS ni red (`role="img"` + `<title>` que dice "Ilustración de referencia"; `alt=""` lo vuelve decorativo): llanta con medida en cifras e índices, ficha de refacción con número de parte y compatibilidad, bote/frasco/bolsa de suplemento con sabor y presentación, y caja genérica con monograma. Registro extensible (`createMockupRegistry`, `registerMockup`, `MockupProvider` con `resolveKind` y textos), `MockupFrame`/`MockupText` para mockups propios y tema por variables CSS (`--mockup-bg`, `--mockup-ink`, `--mockup-accent`…) que heredan del tema de la tienda y soportan modo oscuro.

### Patch Changes

- Updated dependencies [01d87e3]
- Updated dependencies [f9eea88]
  - @asteby/storefront@0.5.0

## 0.2.0

### Minor Changes

- 21994a8: Primitivos headless de sucursales: `useGeolocation` (solo bajo acción del usuario, errores tipados), `useNearestLocations`, `useSelectedLocation` ("Mi sucursal" en `?sucursal=` y localStorage, nunca cookie), `LocationList`, `LocationPicker`, `OpenStatus`, `DirectionsLink`, `PickupOption` y `NearestLocationForm` (GET a `?cp=` sin JavaScript). Sin estilos, SSR-safe y sin dependencias nuevas; con cero sucursales renderizan `null`.

### Patch Changes

- 270b5d8: `localBusinessJsonLd` ya no emite `openingHours` inválido con horarios de texto libre: solo se emite si cada token es sintaxis schema.org estricta (o si hay `opening_hours` estructurado), y `geo` solo con coordenadas válidas. Nuevo helper `openingHoursJsonLd`.
- Updated dependencies [270b5d8]
- Updated dependencies [21994a8]
  - @asteby/storefront@0.4.0

## 0.1.2

### Patch Changes

- Updated dependencies [0c43cc2]
  - @asteby/storefront@0.3.0

## 0.1.1

### Patch Changes

- Updated dependencies [63e03d2]
  - @asteby/storefront@0.2.0

## 0.1.0

### Minor Changes

- b0a30c2: Nuevo paquete `@asteby/storefront-react` (React 19, apto para SSR): `StorefrontProvider`/`useStorefront`; `CartProvider`/`useCart` con altas, cambios y bajas optimistas con reversión, id del carrito en la cookie `sf_cart` (`getCartIdFromCookie` para los loaders) e `initialCart` para hidratar; componentes `Money`, `Image` (srcset responsivo, diferida salvo `priority`), `ProductPrice` con precio de comparación, `useProductOptions`/`VariantSelector` y `AddToCartButton`; SEO con meta y JSON-LD (Product, Organization, LocalBusiness por sucursal, BreadcrumbList, FAQPage, CollectionPage) y `<JsonLd>` escapado; registro de secciones con esquema (`defineSection`, `Sections`, exportación a JSON Schema) y tema en servidor (`themeToCss`, `<ThemeStyle>`).

### Patch Changes

- Updated dependencies [b0a30c2]
  - @asteby/storefront@0.1.0

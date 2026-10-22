# @asteby/storefront-react

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

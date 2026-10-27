# @asteby/storefront-react

## 0.26.1

### Patch Changes

- 491da60: fix(fiscal): `request-invoice` (factura de un pedido ya hecho) ya no manda `requested` ni `document` y nombra el uso `invoice_use`, así que funciona también contra un OPS que aún no acepta esos campos (400 `requested: unknown field`). Un error de validación del servidor solo marca un control del formulario si el campo corresponde a uno (`fiscal.invoice_use` marca `invoice.use`; alias como `razon_social`, `regimen`, `cp` también); un campo sin control ya no produce `fieldErrors` ni `error.field`, para que la página no diga «revisa los datos marcados» sin nada marcado.

## 0.26.0

### Minor Changes

- 811828e: Checkout en un solo paso: las tarifas de envío cargan solas al completar la dirección.

  Antes las tarifas solo existían después de pulsar «Pagar» con la entrega `ship:` (se guardaba la dirección, se recargaba la página y recién ahí aparecían las paqueterías para elegir y volver a pulsar «Pagar»: dos pasos). Ahora:

  - `useAutoQuote` (`@asteby/storefront-react/checkout`): observa el formulario, y cuando hay CP válido, estado, ciudad, colonia y calle, espera 600 ms sin teclear y llama al `quote(address, signal)` de la tienda (guardar dirección + leer `delivery-options`). Solo re-cotiza cuando cambian campos que afectan el precio (país, CP, estado, ciudad); calle, número, teléfono o referencia no. Cancela respuestas viejas, expone `status` (`idle|waiting|loading|ready|error`), `retry`, y `defaultValue` (la tarifa guardada si sigue ofrecida; si no, la más barata sin recolección). Helpers: `defaultRate`, `quoteFingerprint`, `readQuoteAddress`.
  - `<DeliveryOptions free>`: con el envío gratis (`DeliveryOptions.free`, que calcula el servidor) no hay selector de paquetería: muestra «Envío gratis» y manda la tarifa en un campo oculto para ir directo al pago. `announceReady` agrega un estado accesible («Opciones de envío listas (n)») y el error/carga ya eran `role=alert`/`role=status`.
  - `@asteby/storefront`: `DeliveryOptions` gana `fixed` y `free` (aditivos; los llena `storefront_cart` con su ajuste `shipping_quote_mode`) y el mock acepta `shippingQuoteMode: 'fixed_when_free'`.

  El umbral de envío gratis y el precio fijo son configuración de la organización (Ventas → Envíos y ajuste `shipping_quote_mode` de storefront_cart); nada se calcula ni se escribe en el SDK.

- 22140e3: feat(storefront-react): idioma y avisos de la cuenta del comprador (contrato 1.9). `<LanguagePreference locales value>` (selector con los idiomas de la tienda, nombres legibles con `Intl.DisplayNames`, «el de la tienda» como opción) y `<NotificationPreferences channels preferences>` (matriz evento por canal con casillas reales; lo no configurado cuenta como activo, lo que hoy envía la tienda; avisa que la confirmación del pedido, los pagos y las facturas siempre se envían y no ofrece apagarlos). Headless, `data-sf-lang*` / `data-sf-notif*`, `classNames`, es/en, sin JavaScript. Degradan a nada: con menos de dos idiomas, o sin canales de entrega (`capabilities.notifications.channels` ausente en un servidor anterior al contrato 1.9), no se pinta nada y la tienda no necesita un `if`. La acción de Configuración suma los `intent` `locale` (vacío = el de la tienda) y `notifications` (casillas marcadas = activo, las mostradas y sin marcar = apagado; formato y tope validados antes de llamar al servidor, que rechaza los eventos obligatorios), y el loader `loadAccountSettings(client)` lee cliente, capacidades y dispositivos por separado (nunca lanza; la parte que falla es `null`). Estilos opcionales en `account.css`.
- a2ff0a8: feat(storefront-react): «Dispositivos» de la cuenta del comprador (contrato 1.9). `<SessionsList>` (`@asteby/storefront-react/account`): lista las sesiones abiertas con su dispositivo resumido, marca la actual (sin botón) y da a cada otra un formulario real para cerrarla, más «Cerrar las demás»; headless (`data-sf-session*`, `classNames`, es/en, `messages`) y sin JavaScript. Degrada: con `sessions={null}` (servidor anterior al contrato 1.9 o caído) muestra un aviso y el resto de la Configuración sigue. El servidor (`@asteby/storefront-react/account/server`) trae `loadAccountSessions(client)` (nunca lanza) y `createAccountSettingsAction({ storefront, customerCookie })`, una acción con `intent` (`session-revoke`, `session-revoke-others`) que lee el token de la cookie propia de la tienda, nunca lo expone y responde solo códigos (`SettingsErrorCode`), sin mensajes del servidor ni valores del comprador; cerrar una sesión ya cerrada o ajena responde igual. Base de los demás formularios de Configuración (idioma, avisos, exportar y borrar). Estilos opcionales en `account.css`. Requiere `@asteby/storefront` con el cliente de cuenta (`customer.sessions`).
- 42abb8b: feat(storefront-react): «Mis artículos» / «Mi garage» (Storefront API 1.9), subpaths `/subjects`, `/subjects/server` y `/subjects.css`. `SubjectGarage` (tarjetas por artículo, activo, enmascarado de privados, ver piezas compatibles, hacer activo, editar, eliminar con confirmación en línea, límite y estado degradado con reintento), `SubjectPicker` (cascada guiada por los campos y el catálogo del tipo; sin JavaScript avanza el nivel al enviar), `SubjectFilter` y `SubjectFitBadge`, `useSubjects`; en el servidor `loadSubjectsContext` (nunca lanza; sin tipos no hay sección), `createSubjectAction` (sin logs, sin eco de valores privados, 422 por campo), cookie genérica del invitado `sf_subject_<tipo>` que solo acepta una `fit_key` que resuelva contra el catálogo (nunca placas), y `subjectCacheHeaders`. Ningún tipo conocido: los nombres salen de los datos de la organización. `fitment`: motores con tramos de años (`["2.4", 2007, 2017, 2020, 2022]` / `ranges`), un modelo cubre un año solo si algún motor lo cubre (cambio de comportamiento: ya no hay años fantasma entre `from` y `to`) y `vehicleCatalogToTree` para publicar el catálogo que ya tiene una tienda de piezas; así ProtekAuto puede borrar su copia `vehicle.ts`. Requiere `@asteby/storefront` con `customer.subjects`. `subjectCacheHeaders` responde `Vary: Cookie` también en la copia pública, para que un CDN no sirva la página sin filtrar a quien recuerda un artículo.

### Patch Changes

- Updated dependencies [811828e]
- Updated dependencies [2e223d7]
  - @asteby/storefront@0.18.0

## 0.25.0

### Minor Changes

- 5de7348: `PaymentSummary`: cada pago lleva `data-sf-payment-method-key` (`card`, `oxxo`, `spei`, `wallet`…, o `unknown`) para que la tienda ponga su ícono por método, y `paymentMethodKey(payment)` se exporta. `ShipmentCard`: el título dice la paquetería con una etiqueta «Paquetería» (`data-sf-shipment-eyebrow`) cuando se conoce; sin paquetería sigue «Envío».

### Patch Changes

- Updated dependencies [72d9dbf]
  - @asteby/storefront@0.17.0

## 0.24.0

### Minor Changes

- 518c55c: Pedidos de la cuenta: método de pago legible y motivos reales de la factura.

  - `PaymentSummary` y `RefundList` ya no muestran la clave cruda del proveedor (`Card`, `credit_card`, `oxxo`): `paymentLabel` arma «Tarjeta Visa •••• 1234», «Tarjeta de débito», «Efectivo en OXXO», «Transferencia SPEI», «Billetera digital»… en es/en (`payment.method.*`, ajustables con `messages`), usa `family`, `brand` y `last4` si el servidor los manda, respeta una frase que el servidor ya escribió con su detalle y cae a «Medio de pago», nunca a la clave. Extensible por tienda/organización con `methodLabel`. `PaymentInfo` gana `brand` y `last4` (opcionales).
  - `loadFiscalContext` devuelve `reason` (`available`, `off`, `no_region`, `unknown`, `unreachable`) en vez de un solo «no disponible». Un servidor que no publica `capabilities.invoicing` es `unknown`: ya no se afirma que la tienda no factura.
  - `InvoiceStatusCard`: nuevo `availability={ctx.reason}`. Solo `off`/`no_region` (el servidor dice que no hay facturación) muestra «Facturación aún no activa»; con `unknown`/`unreachable` decide el resumen del propio pedido (`can_request`, etapa, folio) y, sin nada que mostrar, un texto neutro (con «Actualizar» si no se pudo consultar). Nuevos `windowDays` («Puedes pedirla hasta N días después de la compra») y `testMode` (aviso de facturación en pruebas, `InvoicingCapabilities.test_mode`). El texto de `unavailable` ya no dice que la tienda no emite facturas.

### Patch Changes

- Updated dependencies [518c55c]
  - @asteby/storefront@0.16.1

## 0.23.0

### Minor Changes

- 234ed7d: Escanear la constancia (o el documento fiscal de la región) con foto y cámara, y uso de factura sugerido como dato de la región (contrato 1.9). `IdentityDocumentReader` lee también una FOTO del QR cuando la región publica `image_mode` (`qr_only` | `full`): botón «Tomar foto del QR» (`capture="environment"`) y «Escanear con la cámara» (visor en vivo, solo si hay `getUserMedia`); el QR trae el RFC y el id del documento, el resto se pide (evidencia `source: 'qr'`, sin huella de archivo). Ni la imagen ni los fotogramas salen del dispositivo ni se guardan; la cámara se apaga al cerrar, al desmontar y al ocultarse la pestaña, y el motor (`decodeImageQr`) se importa recién al abrir el visor o elegir una foto. Componente nuevo `ScanTaxDocument` (botón con el nombre del documento de la región + «Capturar a mano», hoja inferior con el lector; no renderiza nada si la región no publica documentos) y hook `useCameraQr`. El tipo de persona se deduce de `fiscal_id.person_patterns` (ya no hace falta que la tienda inyecte `personTypeOf`, que queda como override): `personTypeFromPatterns`, `personTypeResolver`. `suggestInvoiceUse(fid, regime)` y `FiscalIdentityFields` preseleccionan el uso sugerido por el régimen (`default_invoice_use` de la org gana; nunca contradice `allowed_regimes`) con la marca «Sugerido» y editable; sin dato en la región no se sugiere nada. Textos es/en nuevos (`reader.scan`, `warnings.qrPartial`, errores `no_qr` y `not_image`, `fields.suggested`) y estilos de la hoja y del visor en `fiscal.css`. Con el mismo cambio, a las regiones que ya publican sugerencias (México nuevo) el uso aparece preseleccionado tras elegir el régimen.

### Patch Changes

- Updated dependencies [234ed7d]
  - @asteby/storefront@0.16.0

## 0.22.0

### Minor Changes

- f556c63: El estado de la dirección es el de su código postal. `AddressFields` ahora bloquea el estado por omisión cuando `lookupPostalCode` lo resuelve (`lockProvinceOnFill` pasa a `true`; `false` conserva lo anterior): candado visual, tooltip y nota «Definido por tu código postal» (`messages.provinceLocked`) y una acción discreta «Cambiar código postal» (`messages.changePostalCode`). El bloqueo ya no es una trampa: al editar el código postal se libera y se limpia lo que el lookup había llenado (estado, ciudad, colonia), también cuando el código nuevo no resuelve nada; un `<select>` recupera su `name` y pierde el campo oculto espejo. Nunca borra lo que el comprador escribió. Además `@asteby/storefront` agrega `client.postalCode(zip)` (`GET /storefront/region/postal-code`, `RegionPostalCode`), la fuente natural del `lookupPostalCode` (misma tabla y nombres con que el servidor re-valida estado y CP en `storefront_cart`; `null` si el CP no está en el catálogo).

### Patch Changes

- Updated dependencies [f556c63]
  - @asteby/storefront@0.15.0

## 0.21.0

### Minor Changes

- 83720b0: `ProductThumb`, `ProductPreview` y `ProductThumbStack` (subpath `/ui`, también re-exportados desde `/account`): la foto del producto con relación de aspecto fija, `object-fit: contain`, `srcset` y carga diferida, shimmer mientras carga y un fallback diseñado (inicial del nombre o ícono de paquete) si no hay imagen, falla la carga o el producto ya no existe; la línea de producto jerarquiza nombre, variante, SKU, cantidad y precios. Estilos en `product-preview.css`, incluidos en `ui.css`, `cart.css`, `checkout.css` y `account.css` (tokens de la tienda, tema oscuro). Adoptado en el cajón del carrito, en `OrderSummary` (foto por línea por omisión; `media={false}` conserva la lista de texto), en `OrderCard` (fotos apiladas con "+N") y en el nuevo `OrderLines` (líneas del pedido para el detalle, tolerante a líneas sin imagen o malformadas). Presupuesto de las pantallas de pedidos: 14 a 16 KB gzip.

## 0.20.0

### Minor Changes

- e802ec5: Pantallas de pedidos de la cuenta del comprador (`@asteby/storefront-react/account`, contrato Storefront API 1.8), headless y estilables (`data-sf-*`, `classNames`, variables CSS, textos es/en, sin estilos de marca): `OrderList`/`OrderCard`, `OrderStatusBadge`, `OrderProgress` (línea de tiempo unificada), `NextActionBar`, `ShipmentCard` (rastreo `https`, eventos, `test_mode` oculto o «de prueba», hueco `renderMap` para el mapa), `InvoiceList` (facturas y notas de crédito, descarga solo por la ruta autenticada de la tienda), `PendingPaymentCard`/`PendingPaymentList` (ficha de efectivo con código de barras Code 128, copiar, imprimir; portado de ProtekAuto), `RefundList`, `PaymentSummary` y los hooks `useCustomerOrders`, `useCustomerOrder` y `usePendingPayments`. En `/account/server`: `invoiceFileResponse` y `pendingVoucherResponse` (rutas recurso en una línea; archivo con `no-store`, `nosniff` y CSP cerrada). Enums abiertos con salida segura, estados de carga/error/vacío, axe sin violaciones y presupuesto de tamaño en pruebas.

  Endurecido en revisión: los hooks nunca devuelven pedidos de otra sesión ni de otro id (cambio de comprador, cierre de sesión, cambio de pedido) y una página pedida antes de un `reload` ya no se agrega a la lista nueva; las rutas de servidor llevan `no-store`, `nosniff`, CSP y `no-referrer` también en los errores, rechazan archivos de más de 10 MB (`maxBytes`) sin decodificarlos, acotan `Retry-After` y la descarga de la ficha no permite scripts; los componentes toleran cualquier forma de dato del servidor (texto, dinero e ids malformados no rompen el render ni muestran `$0.00` inventado) y la ficha imprimible no falla con un método llamado `constructor`/`__proto__`.

### Patch Changes

- dc79172: El modal del reto 3DS (`<PaymentChallenge>`) ahora es cuadrado y centrado: ancho `min(36rem, 100% - 2rem)`, alto máximo `min(90dvh, 40rem)`, centrado vertical y horizontal, overlay oscuro y scroll interno solo en el cuerpo (iframe); en móvil (<480px) ocupa casi toda la pantalla con 1rem de margen. Sin cambios en la lógica de cierre.
- Updated dependencies [358a1f4]
  - @asteby/storefront@0.14.0

## 0.19.0

### Minor Changes

- 3366ba7: Nuevo `<PostPurchaseAccountPrompt>` (`@asteby/storefront-react/account`): invitación a crear cuenta en la página de gracias, sin estilos propios (`data-sf-ppa-*`, `classNames`, `locale` es/en, `messages`). Recibe el correo del comprobante de la sesión (campo oculto, no editable), pide solo la contraseña (o el código por correo si la tienda no tiene contraseñas) y reutiliza `createAuthAction` (`register` / `otp-request` → `verify` / `otp-login`), así que la verificación, la cookie de sesión y la no-enumeración de cuentas son las de `<AccountAuth>`. Con verificación de correo, el pedido de invitado con ese correo aparece en «Mis pedidos» al confirmar el buzón.

### Patch Changes

- cac503c: fix(payments): el primer clic en PAGAR ya no muestra «Revisa los datos de tu tarjeta.» cuando el Brick de Mercado Pago falla la primera lectura (`getFormData`) aunque `card_tokens` respondió 201. El adaptador relee el formulario UNA vez antes de rendirse; todavía no se ha enviado nada al servidor de la tienda, así que no cambia la llave de idempotencia ni repite cobros (reglas de #1252 intactas).

  Si el formulario se retira mientras tokeniza o durante la espera de la relectura (error crítico → `fallback`, pago deshabilitado, remontaje, salida de la página), el token resultante ya no se envía al servidor y el estado puesto por quien lo retiró se conserva (antes un error de lectura pisaba el `fallback` con `ready`).

## 0.18.0

### Minor Changes

- 361af35: `AddressFields`: nueva prop opcional `neighborhoodList="select"`. Cuando el código postal tiene varias colonias, el campo pasa a ser una lista real (`<select>`) en vez de sugerencias en un `datalist`; con una sola colonia se rellena igual. Por defecto sigue el `datalist` (sin cambios para quien no lo active).
- 361af35: 3DS en modal real: `PaymentChallenge` ahora trae estilos por defecto en `payments.css` (`dialog[data-sf-challenge]`: casi pantalla completa, ancho completo en móvil, colores fijos porque la página del banco es blanca), no se cierra con Esc ni clic en el fondo mientras el pago está en curso, y muestra «Cancelar y volver al pago» solo tras `escapeAfterMs` (120 s, WCAG 2.2.1). `PaymentBrick` lo conecta a la nueva `cancelChallenge()` del hook: el resultado queda DESCONOCIDO (el banco pudo aprobar), así que conserva la llave de idempotencia, bloquea un pago nuevo (`blocked` / `payment_in_progress`) y verifica con `refresh` hasta la respuesta del banco; solo un rechazo, vencimiento o cancelación definitivos dan un intento nuevo. Si el navegador cierra el diálogo de todos modos (segundo Esc, gesto atrás de Android), la página ofrece volver a la verificación. El sondeo del reto sube de 60 s a 5 min. Mensajes nuevos `challenge.escape`, `challenge.escape_hint` y `challenge.left`.

### Patch Changes

- Updated dependencies [361af35]
  - @asteby/storefront@0.13.0

## 0.17.0

### Minor Changes

- 67ccba1: Cobro con tarjeta resiliente, generalizado desde store-protekauto para que ninguna tienda lo copie.

  `@asteby/storefront`: `StorefrontError` conserva lo que OPS manda en `error.*` (`retryable`, `retryAfter`, `checkoutId`, `cost`, `messageEn`) y se agrega `classifyPaymentError(err)` -> `{ kind, retryable }` sin textos, igual en servidor y navegador (honra `retryable:false` y los códigos `payment_provider_rejected`, `payment_provider_misconfigured`, `unavailable`, `invalid_state`). `PaymentAttemptStatus` suma `none` (solo de la ruta de estado de la tienda).

  `@asteby/storefront-react`: `createResilientTransport` (misma clave, consulta de estado, una sola petición ante `retryable:false`), `PaymentHttpError.retryable/kind`, `usePaymentRecovery` y `<PaymentRecovery>` (textos en es-MX sobrescribibles, alternativas desde las `choices`); `jsonPayRoute` y handlers que responden siempre JSON con `retryable` y `kind` y 500 en vez de 502-504; `/estado` sin sesión responde 200 `none`. Formulario de tarjeta estable: se monta una vez, `MountedPaymentForm.update({ amount })` (Mercado Pago: `controller.update`), cola de montajes con `create` acotado en el tiempo, sin remontar al teclear el correo ni durante el cobro; el hook sigue verificando ~2 min tras un resultado desconocido; `checkoutShouldRevalidate`. `AddressFields`: un solo escritor, respeta foco y edición del comprador, colonia solo si es única y marca sus eventos (`isAddressFillEvent`).

  Cambios que se notan (no es solo aditivo): los handlers responden 500 en vez de 502-504; los mensajes salen del catálogo (los textos propios de la tienda, como `messages.tooManyRequests`, se conservan); `/estado` sin sesión responde 200 `none` en vez de 404; el correo ya no remonta el Brick y un cambio de total actualiza el formulario en su sitio dentro de un `div` interno; con resultado indeterminado (también un 5xx sin cuerpo) PAGAR reusa la misma clave y los mismos datos, y un cambio de total espera; `PayErrorBody` exige `retryable` y `kind`; `AddressFields` rellena la colonia única y un campo enfocado vacío. Detalle en la sección «Cambios que se notan» del README de storefront-react.

### Patch Changes

- Updated dependencies [67ccba1]
  - @asteby/storefront@0.12.0

## 0.16.1

### Patch Changes

- Updated dependencies [005c658]
  - @asteby/storefront@0.11.2

## 0.16.0

### Minor Changes

- e73d62f: storefront-react/cart: agregado optimista en el cajón del carrito. `cartOptimistic` (`add`/`confirm`/`rollback`/`discard`), `useOptimisticAdd(fetcher)` para React Router, `useOptimisticCart`, `useOptimisticCartCount`, `describeAddFailure` y `optimisticLabels` en `CartDrawer`: la fila aparece al instante («Agregando…»), el cajón se abre sin robar el foco y, si falla, se revierte con el aviso «No pudimos agregar X: motivo». Precios y totales siguen siendo solo de OPS.
- a12788c: storefront-react: subruta `@asteby/storefront-react/fiscal` (+ `/fiscal/server`, `fiscal.css`): `FiscalIdentityFields`, `IdentityDocumentReader`, `InvoiceToggle`, `InvoiceStatusCard`, `loadFiscalContext` y `createInvoiceAction` (incluida la lectura del documento sin JS). storefront: el mock acepta `invoice_use` en `fiscal`.
- d56f4f5: storefront-react/checkout: `AddressFields` acepta `lockProvinceOnFill` — una vez que `lookupPostalCode` llena el campo de estado (sin pisar nunca lo que ya escribió el comprador), lo bloquea: un `<input>` queda de solo lectura y un `<select>` (con `provinces`) queda deshabilitado con un campo oculto que sigue enviando su valor. El comprador corrige el estado corrigiendo el código postal. Por omisión `false`: el campo llenado sigue editable como antes. Marca el elemento con `data-sf-locked="1"` para que la tienda lo estilice si quiere.

### Patch Changes

- Updated dependencies [9ae4581]
- Updated dependencies [a12788c]
  - @asteby/storefront@0.11.1

## 0.15.0

### Minor Changes

- 83e476b: storefront: conexión de la tienda con OPS. `StorefrontError.requiredScopes` y el código `insufficient_scope` (403), `client.token.introspect()` (GET /api/gw/_token), `diagnose(client)` (un aviso con la ruta de reparación si faltan alcances; nunca lanza ni imprime el token completo), `token` del cliente acepta `() => string`, y la subruta `@asteby/storefront/node` con `storefrontTokenFromEnv()` / `createFileTokenSource()` (`STOREFRONT_TOKEN_FILE`, `$CREDENTIALS_DIRECTORY/storefront_token`, relectura cada 30 s por mtime) y `connectStore().keepFresh()` (latido y rotación). Nuevo binario `npx @asteby/storefront connect --ops <url>` que canjea el código de conexión por TTY y escribe la clave de forma atómica con modo 0600. `CustomerCapabilities.unavailable_reason` / `missing_scopes`; el mock acepta `missingScopes`.

  storefront-react: `AccountAuth` y `createAuthAction` distinguen `store_misconfigured` (la credencial de la tienda no tiene permisos: mensaje es-MX al comprador y log en el servidor con la ruta de reparación) de `unsupported`; `loadAuthCapabilities` respeta `password:false` por falta de alcance.

### Patch Changes

- Updated dependencies [83e476b]
- Updated dependencies [4f10283]
  - @asteby/storefront@0.11.0

## 0.14.0

### Minor Changes

- 997243c: checkout: `DeliveryOptions layout="flat"` renderiza UNA sola lista de envíos, ordenada de menor a mayor precio, con los servicios repetidos deduplicados (se queda el más barato), las etiquetas más económico / más rápido / recomendado sobre las filas que las ganan, marca de paquetería, servicio, tiempo y precio por fila, sin `<details>` ni grupos, y con la tarifa elegida siempre visible. Nuevo helper `flatRates()`. `list` y `recommended` no cambian.

## 0.13.1

### Patch Changes

- 3a79b32: account: `<AccountAuth form={Form} />` acepta el `Form` real de react-router sin casts (`form` es `'form' | ComponentType<AccountFormProps>`; `AccountFormProps` se exporta desde `@asteby/storefront-react/account`).
- 64483ce: checkout: la fila «STP (transferencia SPEI)» muestra el logo real de STP (el que la propia empresa publica en stp.mx). SPEI no tiene logo publicado por Banxico ni por STP, así que `spei`, `clabe` y `banktransfer` conservan la insignia genérica de transferencia. Procedencia en `brands/LOGOS.md`.

## 0.13.0

### Minor Changes

- 638eed6: Pantalla de cuenta compartida: `<AccountAuth>` (`/account`, con `account.css` opcional) y, del lado servidor, `loadAuthCapabilities(sf)` (caché corta, degrada a `{ password: true, email_verification: false, otp_channels: [] }`) y `createAuthAction({ storefront, customerCookie, safeNext })` (`/account/server`) para entrar con contraseña, crear cuenta, verificar el código, entrar con código y recuperar la contraseña. Las tiendas solo conectan loader, action y componente. Requiere `@asteby/storefront` con los métodos de contraseña de `customer`.

### Patch Changes

- 4495334: checkout: Paquetexpress muestra su logo real (el wordmark que la empresa publica en su sitio, sobre su azul de marca) en lugar de la insignia tipográfica. Procedencia en `brands/LOGOS.md`.
- 39e1f61: checkout: la fila de transferencia SPEI/STP (y los alias clabe y banktransfer) usa una insignia genérica de transferencia bancaria (flechas + texto «SPEI») en lugar de un wordmark plano. No existe una fuente legítima y verificable del logo oficial de SPEI (Banxico no lo publica en URL estable y no está en Commons), así que no se incluye ni se imita; se documenta en `brands/LOGOS.md`.
- Updated dependencies [638eed6]
  - @asteby/storefront@0.10.0

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

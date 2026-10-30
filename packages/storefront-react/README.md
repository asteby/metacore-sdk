# @asteby/storefront-react

React 19 bindings for [`@asteby/storefront`](../storefront): the pieces every
headless store needs and that are easy to get wrong — cart state, prices,
responsive images, variant selection, SEO and JSON-LD, content sections and
the server-rendered theme. Built for SSR (React Router v7 framework mode,
the same model as Shopify Hydrogen): nothing touches `window` or `document`
during render or at import time.

## Install

```bash
pnpm add @asteby/storefront @asteby/storefront-react
```

## Quickstart (React Router v7)

```tsx
// app/root.tsx
import { StorefrontProvider, CartProvider, ThemeStyle, JsonLd, organizationJsonLd, getCartIdFromCookie } from '@asteby/storefront-react'
import { storefront } from '~/lib/storefront.server' // sk_ client, see @asteby/storefront

export async function loader({ request }: Route.LoaderArgs) {
  const cartId = getCartIdFromCookie(request.headers.get('Cookie')) // sf_cart
  const [shop, theme, cart] = await Promise.all([
    storefront.shop.get(),
    storefront.content.theme(),
    cartId ? storefront.carts.get(cartId) : null,
  ])
  return { shop, theme, cart, env: { OPS_URL: process.env.OPS_URL, PUBLIC_TOKEN: process.env.STOREFRONT_PUBLIC_TOKEN } }
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>('root')
  return (
    <html lang={data?.shop.locale ?? 'es'}>
      <head>
        <Meta />
        <Links />
        <ThemeStyle theme={data?.theme} /> {/* :root{--color-primary:...} in the first byte */}
        {data && <JsonLd data={organizationJsonLd(data.shop)} />}
      </head>
      <body>{children}<Scripts /></body>
    </html>
  )
}

export default function App({ loaderData }: Route.ComponentProps) {
  const { shop, cart, env } = loaderData
  return (
    <StorefrontProvider config={{ baseUrl: env.OPS_URL + '/api/gw', token: env.PUBLIC_TOKEN }} shop={shop}>
      <CartProvider initialCart={cart}>
        <Outlet />
      </CartProvider>
    </StorefrontProvider>
  )
}
```

### Product page

```tsx
import { Image, ProductPrice, VariantSelector, useProductOptions, AddToCartButton, toMerchandise,
  JsonLd, productMeta, productJsonLd, breadcrumbJsonLd } from '@asteby/storefront-react'

export const meta: Route.MetaFunction = ({ data, location }) =>
  data ? productMeta(data.product, data.shop, `https://${data.shop.domain}${location.pathname}`) : []

export default function ProductRoute({ loaderData: { product, shop } }: Route.ComponentProps) {
  const [searchParams] = useSearchParams()
  const { selectedVariant } = useProductOptions(product, { searchParams })
  const url = `https://${shop.domain}/products/${product.handle}`
  return (
    <>
      <Image data={product.featured_image!} sizes="(min-width: 768px) 50vw, 100vw" priority />
      <h1>{product.title}</h1>
      <ProductPrice product={product} variant={selectedVariant} />
      <VariantSelector product={product} searchParams={searchParams}>
        {({ option }) => (
          <fieldset>
            <legend>{option.name}</legend>
            {option.values.map((v) => (
              <Link key={v.value} to={v.search} replace preventScrollReset
                    aria-current={v.selected || undefined} data-unavailable={!v.available || undefined}>
                {v.value}
              </Link>
            ))}
          </fieldset>
        )}
      </VariantSelector>
      <AddToCartButton
        variantId={selectedVariant?.available_for_sale ? selectedVariant.id : null}
        merchandise={selectedVariant ? toMerchandise(product, selectedVariant) : undefined}
      />
      <JsonLd data={[productJsonLd(product, shop, url), breadcrumbJsonLd([{ name: 'Inicio', url: `https://${shop.domain}/` }, { name: product.title, url }])]} />
    </>
  )
}
```

### Cart

```tsx
const { cart, totalQuantity, status, error, addLines, updateLines, removeLines,
  setDiscountCodes, setBuyer, setShippingAddress, setDelivery, deliveryOptions, refresh, clear } = useCart()
```

- `addLines`, `updateLines` and `removeLines` are **optimistic**: the UI
  changes at once (pass `merchandise` to `addLines` for a full line, otherwise
  only the count moves) and a failed call rolls back only its own change.
  Mutations run in order, one at a time.
- The first `addLines` creates the cart. Its id lives in the `sf_cart` cookie
  (`<CartProvider cookie={{ name, maxAgeDays, domain, sameSite, secure }}>`,
  or `cookie={false}`). On the server, read it with
  `getCartIdFromCookie(request.headers.get('Cookie'))` and pass the loaded
  cart as `initialCart`; set it from actions with `serializeCartCookie(id)`.
- Without `initialCart`, the provider loads the cart from the cookie after
  mount and forgets ids the API no longer knows.
- Checkout needs `checkout:write`, which `pk_` tokens do not carry: call
  `storefront.carts.checkout()` from a server action with the `sk_` client and
  redirect to `payment.redirect_url`.

### Sections (content pages)

```tsx
import { defineSection, createSectionRegistry, Sections, faqJsonLd, JsonLd } from '@asteby/storefront-react'

export const hero = defineSection({
  type: 'hero',
  label: 'Hero',
  schema: {
    title: { label: 'Título', kind: 'text', required: true },
    subtitle: { label: 'Subtítulo', kind: 'text', default: '' },
    cta_url: { label: 'Enlace', kind: 'url', default: '/' },
  },
  // Props are typed from the schema: title: string, subtitle: string, cta_url: string
  component: ({ title, subtitle, cta_url }) => <section><h1>{title}</h1><p>{subtitle}</p><a href={cta_url}>Ver</a></section>,
})

export const registry = createSectionRegistry([hero /*, productGrid, faq, ... */])

// app/routes/_index.tsx
const page = await storefront.content.page('home')
<Sections sections={page.sections} registry={registry} context={loaderData} />
```

`<Sections>` skips unknown types (warning outside production), merges
defaults, coerces numeric strings, drops unknown props and skips a section
missing a required prop. `registry.toJSONSchema()` / `sectionJsonSchema(def)`
emit the JSON Schema the OPS editor reads (`section.schema.json`).

### Sincronizar tipos de sección con OPS

Convierte los `defineSection` al formato del addon `storefront_content` y los
publica sin escribir conversores a mano:

```ts
import { createStorefrontClient } from '@asteby/storefront'
import { syncSectionTypes } from '@asteby/storefront-react'

const sf = createStorefrontClient({ baseUrl: process.env.OPS_GW!, token: process.env.OPS_SK! }) // sk_ con content:write
const { created, updated, warnings } = await syncSectionTypes(sf, registry)
// o sin cliente: syncSectionTypes({ baseUrl, token, fetch? }, registry)
// o solo exportar: registry.toOpsSectionTypes() -> { types, warnings }
```

Conversión: `items`→`fields` (recursivo), `url`/`color`→`text` (la URL viaja como
texto; `link` de OPS es `{label,url}`), `products`→`product_list`. `max` fija el
tope de texto en OPS. `defineSection` acepta `category` y `maxPerPage`.

Los tipos integrados de OPS (`hero, product_grid, collection_list, rich_text,
faq, image_with_text`) se excluyen (`excludeBuiltin`, por omisión `true`) y
generan `warnings`; pasa `builtinProps: { hero: ['title', ...] }` para avisar
solo de las props locales que no existen en OPS. Antes de llamar a OPS se valida
localmente (lista sin `fields`, `select` sin `options`, kind desconocido, clave no
snake_case, etiqueta vacía): lanza `SectionTypesValidationError` con `issues[]`
(`{path,message}`); también disponible como `validateOpsSectionTypes(types)`.

### Theme

`themeToCss(theme, { selector?, naming?, fontFallback? })` turns
`content.theme()` into CSS variables: each color token as `--color-<name>`
(Tailwind 4) and `--<name>` (the `@asteby/metacore-theme` naming, so
metacore-ui components pick it up), fonts as `--font-<role>` and `--radius`.
Unsafe values (`;`, `{}`, `<`, `url(`) are dropped. `<ThemeStyle theme />`
renders it as a `<style>`; `themeFontsHref(theme)` gives a Google Fonts URL.

## Disponibilidad (headless)

Todo sale de `availability` del servidor (o del polyfill para servidores sin contrato 1.1); sin umbrales ni topes fijos en la tienda.

```tsx
<AvailabilityBadge availability={variant.availability} source={variant} placement="card" />   {/* listado: nada si hay stock */}
<AvailabilityBadge source={variant} />                                                         {/* ficha: Quedan N, ETA, máximo por pedido */}
<AddToCartButton variantId={variant.id} availabilitySource={variant} />                         {/* «Agotado» deshabilitado, «Pedir bajo pedido»... */}
<VariantOptionState availability={value.availability}>{value.value}</VariantOptionState>        {/* opción tachada + «agotado» sr-only */}
<RestockNotifyForm sku={variant.sku} availability={a} action="/avisame" />                      {/* «Avísame»; <form method=post> sin JS */}
<StockConflictAlert />                                                                           {/* 409 recuperable, lee useCart().error */}
{cart.lines.map((l) => <CartLineProblem key={l.id} line={l} />)}                                 {/* problema de línea al cargar el carrito */}
```

Textos es/en por clave: `messages={{ 'status.low_stock_n': '¡Últimas {n}!' }}`. El JSON-LD (`productJsonLd`) publica
`schema.org availability` desde el estado del servidor y nunca la cantidad.

## Sucursales (headless)

Primitivos sin estilos ni clases (render props), accesibles y SSR-safe. Con cero
sucursales todos renderizan `null`. Leen `shop.branches` del `StorefrontProvider`
si no recibes `locations`.

```tsx
const [origin, setOrigin] = useState<GeoPoint | null>(null)
const cp = new URLSearchParams(search).get('cp')
const { locations } = useNearestLocations({ origin, postalCode: cp, limit: 3 })
const mine = useSelectedLocation({ initialId: urlSucursal }) // ?sucursal= + localStorage, nunca cookie

<NearestLocationForm action="/sucursales" onLocate={setOrigin} /> {/* GET ?cp=06000 sin JS */}
<LocationList locations={locations}>
  {(l, { selected }) => (
    <>
      <strong>{l.name}</strong> <OpenStatus location={l} /> <DirectionsLink location={l} />
      <PickupOption location={l} />
      <button onClick={() => mine.select(l.id)} aria-pressed={selected}>Mi sucursal</button>
    </>
  )}
</LocationList>
```

- `useGeolocation()`: solo pide la ubicación al llamar `request()` desde un gesto
  del usuario; expone `supported`, `permission`, `status`, `position` y un error
  tipado (`denied | unavailable | timeout | unsupported | insecure`). La posición
  no se guarda ni se envía.
- `useNearestLocations({ origin, postalCode, locations, limit, radiusKm, remote })`:
  con `origin` ordena en el navegador (haversine; las coordenadas no salen). Con
  `postalCode` (o `remote`) pregunta al servidor (`client.locations`).
- `useSelectedLocation()`: "Mi sucursal" en `?sucursal=` y `localStorage`
  (`sf_sucursal`); valida contra las sucursales y olvida ids obsoletos. Pasa
  `initialId` desde el loader para que SSR e hidratación coincidan.
- `LocationList`, `LocationPicker` (radios nativos, `name="sucursal"`),
  `OpenStatus` (calcula tras montar; `now` fija el instante), `DirectionsLink`,
  `PickupOption` (muestra lo que manda OPS: costo y días), `NearestLocationForm`.

## Mockups de respaldo (`@asteby/storefront-react/mockups`)

Cuando un producto de OPS no trae imagen, `ProductImage` dibuja una ilustración
SVG según el tipo de producto en lugar de un hueco: **llanta** (medida en cifras,
marca, modelo, índice de carga/velocidad, LT, run flat), **refacción** (ficha con
número de parte, OEM, compatibilidad y posición), **suplemento** (bote, frasco o
bolsa con nombre, sabor y presentación) y **genérico** (caja con monograma).
SSR, sin JavaScript en el cliente, sin red, sin `id`s; ~1–2 KB gzip por mockup.

```tsx
import { ProductImage } from '@asteby/storefront-react/mockups'

// Sustituye el `product.featured_image ? <Image …/> : null` de las tarjetas:
<ProductImage
  product={product}
  variant={selectedVariant}            // opcional: su imagen gana; su sabor/presentación alimenta el mockup
  widths={[240, 360, 480, 720]}
  sizes="(min-width: 1024px) 25vw, 50vw"
  priority={index < 4}                  // LCP (solo aplica a la imagen real)
  className="h-full w-full object-cover"
/>
```

- **Con imagen** renderiza `<Image>` (srcset, `width`/`height`, `priority`); el
  `alt` es el de OPS, o el título del producto si viene vacío.
- **Sin imagen** renderiza `<svg role="img" aria-label="Ilustración de referencia: …">`
  con `<title>`: nunca se anuncia como foto. `alt=""` lo vuelve decorativo
  (`aria-hidden`), útil cuando el nombre ya está junto a la imagen.
- **Nunca inventa ni muestra precios**: solo pinta lo que trae el producto
  (atributos, `vendor`, título, opciones, variante). Sin medida no hay medida;
  el sabor solo aparece con variante elegida o si la opción tiene un único valor.
  Todo texto se limpia (controles/bidi), se recorta con `…` y React lo escapa.
- `image={null}` fuerza el mockup (p. ej. en una galería); `kind="tire"` fuerza el tipo.

### Qué tipo se dibuja

`kind` → `resolveKind` (prop o `MockupProvider`) → `resolveMockupKind(product)`:

1. Atributo `mockup_kind` (o `mockup`) en OPS, si ese tipo está registrado: el
   dueño puede elegirlo sin tocar código.
2. Atributos: `size_key`, `section_width_mm`, `rim_diameter_in`, `speed_rating`… → `tire`;
   `part_number`, `oem_number`, `mpn` → `part`.
3. Palabras en `product_type`, categoría y etiquetas (no en el título): llanta,
   neumático, refacción, autoparte, proteína, creatina, colágeno, suplemento…
4. `generic`.

Atributos que lee cada uno (los del pack del giro, más alias comunes):
llanta `size_key|size`, `section_width_mm|width`, `aspect_ratio|aspect`,
`rim_diameter_in|rim`, `load_index`/`load_service`, `speed_rating`, `model`,
`light_truck`, `runflat`; refacción `part_number|mpn`, `oem_number`,
`fitment|compatibility|compatibilidad`, `position`; suplemento opción
`Sabor`/`Presentación` o atributos `flavor|sabor`, `presentation|net_content`,
`servings` (número) y `form|envase` (`cápsulas` → frasco, `bolsa` → bolsa).

### Personalizar sin tocar el SDK

**Colores y tipografía** con variables CSS. Por defecto toman el tema de la tienda
(`--color-muted`, `--color-foreground`, `--color-background`, `--color-primary`,
`--color-primary-foreground`, `--font-heading`/`--font-sans`, los que emite
`ThemeStyle`) y si no hay, grises neutros con `light-dark()` (modo oscuro cuando
la página declara `color-scheme: dark` o `light dark`).

```css
/* app/app.css de la tienda */
:root {
  --mockup-bg: var(--color-muted);        /* fondo del cuadro */
  --mockup-ink: var(--color-foreground);  /* texto sobre el fondo */
  --mockup-muted: #6b7280;                /* texto secundario sobre el fondo */
  --mockup-surface: #001963;              /* hule, envase, caja */
  --mockup-surface-ink: #ffffff;          /* texto sobre el envase */
  --mockup-label: #ffffff;                /* etiqueta / ficha */
  --mockup-label-ink: #000c3c;            /* texto sobre la etiqueta */
  --mockup-accent: #f66123;               /* acento: R16, banda de la ficha, tapa */
  --mockup-accent-ink: #ffffff;
  --mockup-font: "Archivo", sans-serif;
  --mockup-font-mono: ui-monospace, monospace;  /* números de parte */
  --mockup-text-transform: uppercase;     /* p. ej. nombres en MAYÚSCULAS */
}
.dark { --mockup-surface: #0b1440; }
```

**Tipo por tienda** (sin recompilar el SDK) y textos de la interfaz:

```tsx
// app/root.tsx
import { MockupProvider } from '@asteby/storefront-react/mockups'

<MockupProvider
  resolveKind={(product, guess) => (product.category?.handle === 'shakers' ? 'generic' : guess)}
  labels={{ illustration: 'Imagen ilustrativa', servings: 'servicios' }}
>
  <Outlet />
</MockupProvider>
```

**Un mockup propio** (o reemplazar uno base). `MockupFrame` da el `<svg>`, el
fondo, las variables y la accesibilidad; `MockupText`, `wrapMockupText` y
`fitMockupFontSize` acomodan el texto sin medir el DOM.

```tsx
import {
  BUILTIN_MOCKUPS, MockupFrame, MockupText, MockupProvider, createMockupRegistry,
  cleanMockupText, tone, wrapMockupText, type MockupComponentProps,
} from '@asteby/storefront-react/mockups'

type Helmet = { title: string; shell: string | null }

function HelmetMockup({ data, label, labels, ...svg }: MockupComponentProps<Helmet>) {
  return (
    <MockupFrame kind="helmet" label={label} {...svg}>
      <path d="M90 230a110 110 0 0 1 220 0v40H90z" style={tone('surface')} />
      <MockupText lines={wrapMockupText(data.title, 24, 2)} x={200} y={330} size={22} />
      {data.shell ? <MockupText lines={[data.shell]} x={200} y={372} size={14} tone="muted" /> : null}
    </MockupFrame>
  )
}

const registry = createMockupRegistry(BUILTIN_MOCKUPS).register('helmet', {
  component: HelmetMockup,
  fromProduct: (p) => ({ title: cleanMockupText(p.title) ?? '', shell: cleanMockupText(p.attributes?.shell, 24) }),
  // describe: (d, labels) => `${labels.illustration}: ${d.title}`  (opcional)
})

<MockupProvider registry={registry} resolveKind={(p, guess) => (p.product_type === 'Casco' ? 'helmet' : guess)}>…</MockupProvider>
```

`registerMockup(kind, renderer)` hace lo mismo sobre el registro por defecto
(llámalo una vez a nivel de módulo). Si registras solo un componente para un
tipo base (`registerMockup('tire', MiLlanta)`), recibe los datos del extractor
base (`TireMockupData`). Para dibujar sin producto completo:
`<ProductMockup kind="part" data={partMockupData(product)} />`.

### Los mockups de la tienda: un archivo por tipo (`defineMockup` + `createStoreMockups`)

Cada tienda trae sus mockups en **su repo**, con el mismo marco (convención
`app/mockups/` del starter `local`): un archivo por tipo con `defineMockup` y un
`index.ts` que los junta con `createStoreMockups`. Es azúcar sobre
`createMockupRegistry` + `resolveKind`, así que todo lo anterior sigue igual.

```ts
defineMockup<D>({
  kind,                          // 'supplement', 'tire', 'casco-moto'… (reusar un tipo base lo reemplaza)
  match?: (product, guess) => boolean,           // reclama productos; se pregunta en orden, antes de la propuesta del SDK
  data?: (product, variant?) => D,               // por omisión, el extractor base del tipo (genérico para tipos nuevos)
  describe?: (data, labels) => string,           // nombre accesible; por omisión describeMockup
  render: (props: MockupComponentProps<D>) => JSX,  // un <MockupFrame>… o una pieza base: SupplementMockup, TireMockup…
})

createStoreMockups(definitions, { base?: 'builtin' | 'none' | registry, labels? })
  // → { registry, resolveKind, labels?, kinds }  listo para <MockupProvider {...storeMockups}>
```

```tsx
// app/mockups/supplement.tsx: la pieza base tal cual, con la regla de la tienda
import { SupplementMockup, defineMockup } from '@asteby/storefront-react/mockups'

export const supplement = defineMockup({
  kind: 'supplement',
  match: (product) => product.category?.handle !== 'accesorios', // "todo es suplemento salvo accesorios"
  render: SupplementMockup,
})

// app/mockups/accessory.tsx: un tipo nuevo dibujado por la tienda
import { MockupFrame, MockupText, defineMockup, tone, wrapMockupText, cleanMockupText } from '@asteby/storefront-react/mockups'

export const accessory = defineMockup<{ title: string }>({
  kind: 'accessory',
  match: (product) => product.category?.handle === 'accesorios',
  data: (product) => ({ title: cleanMockupText(product.title) ?? '' }),
  render: ({ data, label, labels: _labels, ...svg }) => (
    <MockupFrame kind="accessory" label={label} {...svg}>
      <rect x={120} y={60} width={160} height={240} rx={28} style={tone('surface')} />
      <MockupText lines={wrapMockupText(data.title, 26, 2)} x={200} y={350} size={20} />
    </MockupFrame>
  ),
})

// app/mockups/index.ts: lo único que importa root.tsx
import { createStoreMockups } from '@asteby/storefront-react/mockups'
import { accessory } from './accessory'
import { supplement } from './supplement'

export const storeMockups = createStoreMockups([accessory, supplement])

// app/root.tsx
<MockupProvider {...storeMockups}><Outlet /></MockupProvider>
```

Reglas: `data` solo lee el producto (atributos, `vendor`, título, opciones,
variante), nunca precios, y limpia el texto con `cleanMockupText`; `render`
pinta con `tone(...)`/`--mockup-*` (sin colores de marca en el SVG), devuelve un
`<MockupFrame>` (accesibilidad y tokens) y no usa `id`s, imágenes ni red.

Los textos de tamaño automático aceptan palabras más largas que el ancho de
línea sin cortarlas: `wrapMockupText(texto, chars, lines, wordMax)` deja la
palabra en su propia línea y `fitMockupFontSize` ajusta la letra a la más
larga; `mockupWordMax(ancho, letraMínima, ratio)` da el `wordMax` que todavía
cabe. El suplemento base ya lo usa (`CREATINA MONOHIDRATADA` ya no queda en
`MONOHIDRATA…`).

## Pago integrado (`@asteby/storefront-react/payments`)

Formulario de tarjeta dentro de la página (Mercado Pago Payment/Card Brick u otro proveedor), sin que el comprador salga. Sin estilos propios: `data-*` y variables CSS `--sf-pay-*`. El cliente **nunca calcula montos**: el total lo manda el servidor, se pasa al Brick y se devuelve como `expected_total`.

Dos puertos reemplazables (`PaymentFormAdapter` = SDK del proveedor en el navegador; `PaymentTransport` = cómo llega el navegador al servidor de la tienda). El navegador nunca llama a OPS: la ruta de la tienda reenvía con `client.checkouts.pay(...)` y su token `sk_`.

```tsx
// app/routes/checkout.tsx (navegador)
import { PaymentBrick, createFetchTransport } from '@asteby/storefront-react/payments'

const transport = createFetchTransport('/pagar', { refreshUrl: '/pagar/estado' }) // misma-origen

<PaymentBrick
  client={card.client}            // paymentMethods[].client (public_key, sdk_url, options, csp)
  amount={cart.cost.total}        // total de OPS; si cambia, el Brick se vuelve a montar
  transport={transport}
  nonce={nonce}                   // nonce de la CSP
  locale="es-MX"
  scope={cart.id}                 // la intención de pago se guarda por carrito
  submitLabel="Realizar el pedido"
  onResult={(o) => o.kind === 'approved' && navigate('/pagar/gracias')}
  onFallback={() => setOption('card_redirect')}   // SDK bloqueado/timeout: Checkout Pro
/>
```

```ts
// servidor de la tienda (action de /pagar): traduce al contrato de OPS
import { paymentIdempotencyKey } from '@asteby/storefront'
const key = paymentIdempotencyKey(checkoutId, body.attempt)       // misma llave = mismo cobro
const result = await sf.checkouts.pay(checkoutId, { method: 'card', provider_data: body.provider_data,
  device_session_id: body.device_session_id, expected_total: body.expected_total }, { idempotencyKey: key })
return Response.json(result)    // PaymentAttemptResult; 409/422/429 se devuelven como { error: { code } } con su status
```

- **Estados** (`useEmbeddedPayment` / `PaymentBrick` por `ref`): `loading → ready → processing → approved | in_review | voucher (efectivo con referencia y vencimiento) | challenge (3DS en `<dialog>`) | redirect | rejected | network_error | blocked | fallback`.
- **Idempotencia**: un `attempt` por intento (sessionStorage, sin datos de tarjeta); el reintento por red reutiliza el mismo `attempt`, la misma llave y el mismo token (en memoria). Tras un rechazo hay intento nuevo y el formulario se vuelve a montar (el token es de un solo uso). El doble clic devuelve la petición en vuelo.
- **Rechazos**: texto accionable por `decline_code` neutro (`paymentMessages`, es/en, sobrescribible por clave); nunca el código crudo del proveedor.
- **Seguridad**: el adaptador de Mercado Pago solo deja salir `token`, `payment_method_id`, `issuer_id`, `installments` e identificación (descarta `transaction_amount`); el script solo carga de `https://sdk.mercadopago.com`; `paymentCsp([client], { nonce })` arma la CSP de `/pagar` con lo que declara el proveedor. Sin SRI a propósito (URL sin versión).
- **Tema**: `--sf-pay-text`, `-text-muted`, `-background`, `-input-background`, `-primary`, `-primary-contrast`, `-error`, `-success`, `-outline`, `-radius` se leen al montar y se pasan al Brick; `--sf-pay-min-height` reserva el alto (sin saltos).
- **Otro proveedor**: implementa `PaymentFormAdapter` (`load`, `mount → { collect, unmount }`) y pásalo en `adapter`/`adapters={{ stripe_elements: … }}`.

### «Método de pago» híbrido (`PaymentMethodSection` + `/payments/server`)

Lo que hace falta alrededor del Brick, listo para usar: filas por opción que publica OPS (tarjeta, efectivo, cuenta del proveedor, pagos sin tarjeta), tarjeta con el formulario seguro DENTRO de la página, efectivo con puntos de pago y ficha, y redirección para el resto. Sin JavaScript, o si el formulario no carga, todo cae al envío normal del formulario de la página (redirección). Textos, rutas, iconos y clases por props; el total es siempre `cart.cost.total` de OPS (nunca se suma ni se recalcula).

```tsx
// loader: filas desde GET payment-methods (la tienda oculta lo que no ofrece)
import { buildPayChoices } from '@asteby/storefront-react/payments'
const choices = buildPayChoices(payment.methods, { hide: ['manual'] })

// componente, dentro del <form> de /pagar
import '@asteby/storefront-react/payments.css'   // opcional: muestra el panel de la fila marcada sin JS
<PaymentMethodSection
  choices={choices} amount={cart.cost.total} scope={cart.id} formRef={formRef}
  payUrl="/pagar/cobrar" statusUrl="/pagar/estado" nonce={nonce}
  delivery={delivery} deliveryReady={delivery !== '' && !delivery.startsWith('ship:')}
  syncDelivery={saveDeliveryAndReloadCart}     // guarda la entrega en el carrito de OPS y resuelve true al releer el total
  onAmountChanged={revalidate} onDone={() => navigate('/pagar/gracias')}
  rebuildHref="/carrito" messages={{ legend: 'Método de pago' }} icons={{ card: <CardIcon /> }}
  classNames={{ radioLabel: '...', submit: 'btn-primary' }} />
```

```ts
// servidor: dos rutas de recurso (POST JSON) y el efectivo del formulario
import { createEmbeddedPayHandlers, paymentCspHeaders, paymentCspMode, paymentNonce } from '@asteby/storefront-react/payments/server'
export const pay = createEmbeddedPayHandlers({
  client, site, returnPath: '/pagar/gracias', readCartId, readSession, serializeSession,
  validateFields, prepareCart, createDraft, settle, hide: ['manual'],
})
// action de /pagar/cobrar -> pay.pay(request); action de /pagar/estado -> pay.status(request)
// efectivo (en la action de /pagar): const out = await pay.cash({ sf, request, cartId, fields, choice, before })
```

- La tienda aporta lo suyo por callbacks: cookies (`readSession`/`serializeSession`), qué campos exige (`validateFields`), cómo guarda contacto, dirección y entrega (`prepareCart`), el comprobante (`createDraft`) y cuándo queda cerrado el pedido (`settle`: añade las cookies y devuelve `true` si fue aprobado, en revisión o ficha).
- El servidor decide qué se paga en la página: un `payment_choice` falsificado u oculto se rechaza (422), un punto de efectivo se arma de la lista del proveedor, el monto nunca viaja en `provider_data`, el reintento reutiliza el checkout y la llave de pago, hay límite por IP y validación de origen.
- CSP solo para `/pagar`: `paymentCspHeaders([client], { mode: paymentCspMode(env.PAY_CSP, isProd), nonce: paymentNonce(), scriptHashes, imgHttps })` y `paymentNonceFromHeaders` para `ServerRouter`.
- Accesibilidad: un `fieldset` con leyenda y radios nativos, avisos en `role="status"`/`alert`, botón de 44 px que explica su estado ocupado; pruebas con axe.

- Marcas (por omisión, `brandMarks`): la marca del proveedor en sus filas de cuenta y sin tarjeta, las de los primeros puntos de pago en la fila de efectivo y junto a cada punto (`payment_point` o `id`; `logo_url` del proveedor gana), y las redes que pase la tienda en la fila de tarjeta (`cardBrands={['visa', 'mastercard', 'amex']}`). `brandMarks={false}` deja las filas en texto.
- El total del botón siempre lleva la entrega: `syncDelivery` se llama una vez por entrega con cualquier fila (no solo con tarjeta); mientras se guarda, el botón no muestra un total viejo.
- El formulario de tarjeta se abre justo debajo de su fila (no al final de todas), con el correo del formulario de la página ya puesto (`payerEmailField`, por omisión `email`): el Brick no vuelve a pedirlo. En página oscura monta el tema base `dark` del proveedor (`readPaymentScheme`: token `--sf-pay-scheme` o `color-scheme`), refinado con los tokens `--sf-pay-*` (texto, fondos, contorno, radios, relleno).
- La elección se recuerda por carrito (`scope`) en `sessionStorage` (`rememberChoice`, por omisión sí): recargar, volver con «atrás» desde el proveedor o pasar por el paso de dirección no pide elegir de nuevo; si la fila ya no se publica, vuelve el valor por omisión del servidor. Solo se guarda el valor de la fila y el punto de efectivo.
- `cashPointsVisible={4}` deja a la vista los primeros puntos de efectivo y manda el resto a «Ver más puntos de pago» (se abre solo si el punto recordado está ahí).
- Botón: «Generar ficha de pago $X» con efectivo (`placeOrderCash`) y «Elige la entrega para continuar» mientras falta la entrega (`chooseDelivery`; al pulsarlo señala el campo que falta en vez de pagar).

### Cobro resiliente: reintento, verificación, formulario estable y aviso con salida

Un cobro con tarjeta puede quedar **indeterminado** (la respuesta se perdió, el proxy devolvió HTML, OPS tardó). La regla que nunca cambia: **un resultado indeterminado jamás se cobra con otra clave de idempotencia**; se repite con la MISMA clave o se consulta el estado. Lo de abajo se adopta de forma opcional, pero **no es solo aditivo** (ver «Cambios que se notan» al final de esta sección), y está pensado para que ninguna tienda tenga que copiar código de otra.

**1. Servidor (`/payments/server`).** `createEmbeddedPayHandlers` ya responde SIEMPRE JSON `{ error: { code, message, retryable, kind } }` (clasificado con `classifyPaymentError` de `@asteby/storefront`) y devuelve `500` en lugar de `502-504` (Traefik/CDN los cambian por HTML y se pierde el `Set-Cookie` de la sesión de pago). `/estado` sin cookie `sf_pay` responde `200 { payment: { status: 'none' }, recoverable }` en vez de `404`: `none` no es un resultado, así que un cobro indeterminado sigue con la misma clave; `recoverable` dice si la tienda aún tiene el carrito del comprador. Para rutas propias: `jsonPayRoute(run, 'pay', { locale, messages })`. Los textos de los errores salen del catálogo `error.<kind>` y se reemplazan con `errorMessages` (o `messages`/`locale` de `jsonPayRoute`).

**2. Navegador.**

```tsx
import { PaymentMethodSection, PaymentRecovery, alternativeChoices, createResilientTransport, pickChoice, usePaymentRecovery } from '@asteby/storefront-react/payments'

const recovery = usePaymentRecovery({ scope: cart.id, onRevalidate: revalidate })
const transport = useMemo(
  () => createResilientTransport({ payUrl: '/pagar/cobrar', statusUrl: '/pagar/estado', fields: () => formFields(formRef.current), onIssue: recovery.onIssue }),
  [],
)

<PaymentRecovery
  notice={recovery.notice} alternatives={alternativeChoices(choices.choices)}
  onRetry={recovery.retry} onRefresh={() => location.assign('/pagar')}
  onPick={(c) => { recovery.clear(); pickChoice(formRef.current, c.value) }} />
<PaymentMethodSection key={recovery.sectionKey} transport={transport} brickProps={{ autoRetries: 0 }} onEvent={recovery.onEvent} ... />
```

- `createResilientTransport({ payUrl, statusUrl, fields, onIssue, retries = 2, backoffMs = [800, 2000], statusPolls = 3, statusPollMs = 2000, headers, locale, messages, fetch, sleep })`: reintenta los fallos transitorios con la misma clave, consulta `/estado` y, si sigue sin resolverse, lanza `PaymentHttpError(503, 'network', …, { retryable: true, kind: 'transient' })` (el hook conserva el intento y deja «Reintentar»). Con `retryable: false` de OPS hace UNA petición. Un cuerpo que no es JSON se trata como transitorio. `PaymentHttpError` expone `retryable` y `kind`. Con `autoRetries: 0` en `brickProps` el hook no duplica la política del transporte.
- `usePaymentRecovery({ scope, storage, formAutoRetries = 2, onRevalidate })` devuelve `notice`, `sectionKey` (úsalo como `key` de la sección), `onIssue`, `onEvent`, `retry()` y `clear()`. `retry()` quita la clave del intento y monta una sección nueva SOLO tras un fallo definitivo; mientras el resultado es desconocido (confirmando, verificando, transitorio) no hace nada y devuelve `false`. Un formulario de tarjeta que no carga se vuelve a montar solo `formAutoRetries` veces antes de mostrar el aviso.
- `<PaymentRecovery notice alternatives onRetry onPick onRefresh locale messages alternativeLabel classNames testIds>`: nunca deja un panel vacío; un fallo del comercio (credenciales, configuración) no culpa al comprador y pone primero las alternativas, que salen de las `choices` publicadas (nada de marcas en los textos). Textos en español de México por omisión (`en*` disponible), todos reemplazables con `messages` (`notice.<tipo>.title|body`, `action.retry|retry_form|refresh|alternative` con `{label}`, `error.<tipo>`; ver `paymentRecoveryMessages`), clases con `classNames` (`root title body actions primary secondary`).
- **Consulta de estado tras «verificando»**: `useEmbeddedPayment` sigue leyendo `transport.refresh` con espera creciente (2 s, 4 s, 8 s… hasta 15 s) durante `verifyTimeoutMs` (120 s). Solo un resultado resuelto (pagado, rechazado, ficha, reto, redirección) lo termina; `pending` y `none` no. Expone `verifying` y la clave del intento no cambia. Opciones: `verifyTimeoutMs`, `verifyIntervalMs`.
- `checkoutShouldRevalidate({ paths: ['/pagar'] })`: `shouldRevalidate` para las rutas de ALREDEDOR (root, encabezado…): el `fetcher.submit` de la entrega a `/pagar` ya no vuelve a ejecutar todos los loaders. No lo uses en la ruta de checkout (su loader debe releer el total).

**3. Formulario de tarjeta estable.** El contenedor se monta UNA vez por vida del formulario:

- Un cambio de total NO remonta: el hook llama `MountedPaymentForm.update({ amount })` (en Mercado Pago, `controller.update` del Card Payment Brick). Si el proveedor no lo tiene o falla, se remonta UNA vez, en cola. Varios cambios seguidos se fusionan en el último.
- Nunca se actualiza ni remonta mientras `onSubmit` va en vuelo: se aplica después de la respuesta, y un `submit` espera a que termine la actualización en curso.
- Escribir el correo ya no remonta (se usa al crear el formulario).
- `PaymentMethodSection`: mientras `syncDelivery` no termina, el formulario se queda montado con la capa «Actualizando el total…» (`data-sf-pay-updating`, `payments.css`) y el botón bloqueado (`aria-disabled`).
- Cola de montajes (`mountQueued` / `withMountQueue`, la usa el hook con cualquier adaptador): uno a la vez por contenedor, `await unmount` antes del siguiente `create`, nodo interno con id único, cancelación (`signal` en `PaymentFormMountOptions`) del montaje viejo y de uno cuyo contenedor salió del DOM, y tiempo límite de `create` (`createTimeoutMs`, por omisión `sdkTimeoutMs`) para que la cadena no se cuelgue (cae a la alternativa de redirección).
- Adaptadores propios: implementa `update?` si el proveedor sabe cambiar el monto; si no, el hook remonta.

**4. `AddressFields` (checkout).** Un solo escritor en cola; no escribe en un campo con foco ni en uno que el comprador editó (evento `input` con `isTrusted`); la colonia solo se rellena si el código postal tiene UNA sola; los eventos `input` que dispara el autollenado llevan `event.sfSynthetic === true` (`isAddressFillEvent(event)`) para que la tienda los ignore.

**Migrar una tienda que copió esto** (p. ej. `store-protekauto`): borra su `pay-errors`, `pay-transport`, `pay-route.server`, `brick-adapter` y `pay-recovery`; usa `createResilientTransport`, `usePaymentRecovery`, `<PaymentRecovery>` y los handlers del servidor; quita el `key` de `PaymentBrick` si lo tenía y el adaptador envuelto. Los textos propios van en `messages`.

### Cambios que se notan

Al subir el pin de `@asteby/storefront` / `@asteby/storefront-react` (en 0.x un caret no adopta un minor solo):

- Los handlers de pago responden **500** donde antes respondían 502-504 (y `payErrorResponse({})` pasa de 503 a 500). La señal de «indeterminado» viaja en el cuerpo (`retryable`, `kind`); un 5xx sin cuerpo legible se trata como indeterminado (misma clave), nunca como rechazo.
- Los mensajes salen del catálogo es-MX/en y no del texto de OPS para los tipos transitorio, en curso, límite de intentos, configuración, rechazo del proveedor, pedido ya registrado y tienda cerrada. Los textos propios de la tienda (`messages.tooManyRequests`, `fillFields`, etc.) se conservan.
- `/estado` sin sesión o con un checkout inexistente responde **200** `{ status: 'none', recoverable }` en lugar de 404. `'none'` se suma a `PaymentAttemptStatus`.
- Escribir el correo ya no remonta el formulario de tarjeta: un invitado que lo escribe después del montaje ve el campo de correo dentro del Brick.
- Un cambio de total actualiza el formulario en su sitio (no lo remonta) y el formulario queda dentro de un `div` interno: un contenedor propio de `useEmbeddedPayment` no debe tener hijos renderizados por React (`replaceChildren`).
- Con resultado indeterminado, PAGAR reintenta con los mismos datos y la misma clave (no vuelve a tokenizar), y un cambio de total espera a que se resuelva.
- `createTimeoutMs` toma por omisión `sdkTimeoutMs`.
- `AddressFields` rellena la colonia cuando el código postal tiene una sola, rellena un campo enfocado solo si está vacío y no lo editó el comprador, y marca sus eventos (`isAddressFillEvent`).
- Tipos: `PayErrorBody` exige `retryable` y `kind`; `paymentErrorView` trata un 5xx (salvo `retryable:false`) como `network`.

## Entrega y marcas (`@asteby/storefront-react/checkout`)

Las tarifas de envío y las sucursales de «Entrega» como radios nativos, iguales en todas las tiendas: marca y nombre comercial de la paquetería (`fedex` → FedEx), servicio sin repetir la paquetería, llegada en días hábiles («Llega en 4 días hábiles»), insignias discretas de «Más económico» / «Más rápido» (solo si una tarifa lo es estrictamente) y el precio tal cual lo manda OPS. La vigencia de la cotización es UNA sola nota para toda la lista, en la zona horaria del comprador («Precios de envío vigentes hasta las 9:39 p.m.»), que aparece tras hidratar en una línea reservada (sin salto de diseño). `loading` pinta filas esqueleto al recotizar.

```tsx
import { DeliveryOptions } from '@asteby/storefront-react/checkout'
import '@asteby/storefront-react/checkout.css' // opcional: disposición, insignias, esqueleto y nota

<fieldset>
  <legend>Entrega</legend>
  <DeliveryOptions rates={delivery.rates} pickup={delivery.pickup} partial={delivery.partial}
    renderAmount={(m) => <Money data={m} />} classNames={{ option: 'card has-checked:border-accent' }} />
</fieldset>
```

Cotizaciones largas (`layout="recommended"`): con 10+ servicios, la lista plana obliga a comparar todo. Con `layout="recommended"` se ven hasta tres tarifas (`recommendedCount`) con su etiqueta: la más económica, la más rápida y la de mejor equilibrio precio-tiempo («Recomendado»); el resto queda en «Ver más opciones (N)» (`<details>`, funciona sin JavaScript) agrupado por paquetería, con la marca y el nombre UNA vez por grupo (cada radio conserva su nombre completo para lectores de pantalla). Los servicios repetidos (misma paquetería y servicio cotizados por dos proveedores) se quedan con el más barato. Si la tarifa elegida está dentro, la lista se abre sola (también en el HTML del servidor). La lógica pura está en `recommendRates()` / `dedupeRates()`. `error` (+ `onRetry`) muestra un aviso amable con «Intentar de nuevo» cuando no se pudo cotizar.

Una sola lista (`layout="flat"`): como en la mayoría de los ecommerce. Muestra TODAS las tarifas en una lista plana, de menor a mayor precio, sin `<details>` ni grupos; cada fila lleva la marca de la paquetería, el nombre completo, el servicio, el tiempo y el precio. Los servicios repetidos (misma paquetería y servicio de dos proveedores) se quedan con el más barato, y las etiquetas «Más económico», «Más rápido» y «Recomendado» (esta última solo en cotizaciones de más de 4 servicios, `recommendedCount`) van sobre las filas que las ganan. La tarifa elegida siempre aparece (aunque sea un servicio repetido) y, sin `defaultValue`, se preselecciona la primera fila, la más barata. Son radios nativos con el mismo `name` (grupo de radio sin JavaScript); envuélvelos en tu `<fieldset><legend>`. Decisión de API: es un tercer valor de `layout`, no otra prop, para no tocar `list` ni `recommended`; la lógica pura está en `flatRates()`.

Tarifa vencida o cambiada: si guardar la entrega falla con `isQuoteChange(err)` (códigos `quote_expired`/`rate_expired`…, un 409, o el 422 genérico de servidores anteriores), la tienda recarga las tarifas conservando la dirección, vuelve a elegir el mismo servicio con `matchRate(anterior, nuevas)`, pasa `requoted` a `DeliveryOptions` y resuelve `syncDelivery` con `'requote'`: `PaymentMethodSection` muestra un aviso (no un error) y vuelve a intentar con la nueva tarifa.

### Campos, validación en línea y resumen del pedido

Piezas del formulario de pago iguales en todas las tiendas (también en `@asteby/storefront-react/checkout`):

- `ContactFields` y `AddressFields`: correo (`type="email"`, `inputMode="email"`), teléfono (`tel`), nombre (`given-name`) y apellidos (`family-name`); dirección en el orden en que se llena en México: código postal primero, estado, ciudad o municipio, colonia (`address-level3`, campo propio `neighborhood` de la API), calle y número, número interior (opcional) y referencias (opcional, `reference`). Sin país escrito en el código: el formato del código postal (`postalCode={{ pattern, maxLength, inputMode, title }}`), la lista de estados (`provinces`, de la configuración de la región) y la consulta por código postal (`lookupPostalCode`, una ruta propia sobre un catálogo) los pone la tienda. Con la consulta, estado y ciudad se llenan solos (nunca sobre lo que el comprador escribió) y las colonias salen como sugerencias (`<datalist>`). Sin ella, son campos de texto normales. Con `hideResolvedFields` (por omisión activo), si la consulta resuelve estado y ciudad/municipio no se muestran como campos: una línea «Miguel Hidalgo, Ciudad de México» (`aria-live`) con «Cambiar código postal» bajo el código, y `province`, `province_code` y `city` viajan ocultos (el servidor sigue validando estado ↔ código postal). Si no resuelve, el municipio es ambiguo (`PostalCodeInfo.cities`) o el servidor reporta error en esos campos, vuelven los campos editables; `hideResolvedFields={false}` conserva el comportamiento anterior.
- `useFieldErrors(formRef)` + `CheckoutField` + `ErrorSummary`: validación en línea con las reglas del propio HTML (`required`, `type`, `pattern`…). Al salir de un campo con un valor inválido aparece el texto debajo del campo (`aria-invalid`, `aria-describedby`); se borra al corregirlo. Al enviar (o con `reportValidity()`, que usa `PaymentMethodSection`) los globos del navegador se reemplazan por los textos en línea y un resumen enfocable con enlaces a cada campo (WCAG 3.3.1). Los campos que rechace el servidor (`serverFields`) salen igual. Sin JavaScript, el navegador valida como siempre.
- `OrderSummary`: líneas y totales de `cart.cost` tal cual (subtotal, descuentos por código, envío «Al elegir la entrega» / «Actualizando…» / «Gratis», impuestos aparte o «Incluye $X de impuestos», total con `aria-live`). `OrderSummaryDisclosure` lo envuelve para teléfono: barra plegada arriba con el total («Ver resumen del pedido · $857.82»), `<details>` nativo, sin salto al hidratar. La tienda la muestra solo en pantallas angostas y el resumen fijo (`sticky`) en escritorio.

```tsx
const v = useFieldErrors(formRef, { serverFields: actionData?.fields })
<ErrorSummary items={v.summary} focusKey={v.summaryKey} />
<ContactFields errors={v.errors} defaults={{ email: cart.buyer.email }} />
<AddressFields errors={v.errors} countryCode="MX" defaults={cart.shipping_address}
  postalCode={{ pattern: '[0-9]{5}', maxLength: 5, inputMode: 'numeric', title: 'Escribe los 5 dígitos.' }} />
<OrderSummaryDisclosure total={cart.cost.total} className="lg:hidden">
  <OrderSummary title={false} lines={cart.lines} cost={cart.cost} />
</OrderSummaryDisclosure>
```

Catálogo compartido de marcas (`brandKey`, `brandName`, `findBrand`, `<BrandMark brand="oxxo" />`): paqueterías (FedEx, DHL, Estafeta, Paquetexpress, UPS, Redpack, 99 Minutos, J&T…), redes de tarjeta (Visa, Mastercard, American Express, Carnet), billeteras (Mercado Pago, PayPal…) y puntos de efectivo y bancos de México (OXXO, SPEI/STP, 7-Eleven, Circle K, Soriana, Extra, BBVA…). La clave es el identificador que ya mandan los proveedores. Precedencia de lo que dibuja `<BrandMark>`: `logo_url` https del proveedor > logo real incluido > insignia tipográfica de respaldo (marcas sin logo disponible) > monograma neutro (marca desconocida). Los logos reales van incrustados como data URI (cero peticiones a terceros, mismo tamaño en servidor y navegador), sin recolorear, sobre una placa blanca con filo sutil para que se lean igual en tema claro y oscuro (`--sf-brand-mark-plate` y `--sf-brand-mark-ring` la ajustan). El elemento lleva `data-sf-brand-mark="<clave>"` y `data-sf-brand-source="provider|logo|badge"`; con `title` se anuncia con el nombre comercial, sin él es decorativo.

**Procedencia de los logos.** Son marcas registradas de sus titulares y se muestran sin alteración solo para identificar el servicio o método de pago que la tienda ofrece, sin sugerir patrocinio; cada tienda debe respetar las guías de marca de cada titular. Fuente, licencia, fecha y versión (color/monocroma) de cada uno, y las marcas que quedaron con insignia por no tener fuente con condiciones claras, están en `src/checkout/brands/LOGOS.md` (se regenera con `node scripts/build-logos.mjs`). Para usar un logo propio o licenciado: `<BrandMark brand="redpack" logoUrl="https://cdn.mitienda.mx/redpack.svg" title="Redpack" />`; en pagos, `PaymentPoint.logo_url`. Solo se acepta `https:`.

## Receta de checkout en un paso (cualquier tienda)

El envío se cotiza solo cuando el código postal se resuelve (sin «Continuar»), la tarjeta carga desde el inicio y el botón
dice «Calculando envío…» mientras espera. Todo viene del SDK; la tienda solo monta y viste. Sin JavaScript queda el
formulario de dos pasos (`addressFirst`).

```tsx
import { AddressFields, ContactFields, DeliveryOptions, DeliveryStatus, OrderSummary, useLiveDelivery } from '@asteby/storefront-react/checkout'
import { PaymentMethodSection } from '@asteby/storefront-react/payments'

const js = useSyncExternalStore(() => () => {}, () => true, () => false) // hidratado
const live = useLiveDelivery({
  formRef, delivery: loaderData.delivery, enabled: js, quoteUrl: '/pagar/envio',
  saved: { address: cart.shipping_address, rateId: cart.delivery.rate_id, branchId: cart.delivery.branch_id },
})

<form ref={formRef} onChange={live.onFormChange}>
  <ContactFields … /> <AddressFields … />
  <fieldset aria-busy={live.quoting || undefined} style={{ minHeight: '9rem' }}>
    <legend>Entrega</legend>
    {js ? <DeliveryStatus {...live.statusProps} /> : null}
    <DeliveryOptions {...live.optionsProps} layout="recommended" />
  </fieldset>
  <PaymentMethodSection earlyCard={js} deliveryReady={live.deliveryReady} holdLabel={live.holdLabel}
    delivery={live.deliveryValue} addressFirst={addressFirstServer && !js} syncDelivery={…} amount={cart.cost.total} … />
</form>
<OrderSummary quoting={live.quoting} cost={cart.cost} lines={cart.lines} />
```

La ruta `quoteUrl` la monta la tienda con `createQuoteHandler` de `@asteby/storefront-react/checkout/server` (`export const action = ({ request }) => createQuoteHandler({ storefront, readCartId })(request)`) (POST JSON con `zip`, `province`, `city`, `neighborhood`, `address1`…): guarda el destino
en el carrito (`PUT /carts/:id/shipping-address`) y responde `GET /carts/:id/delivery-options` tal cual. OPS exige calle para
guardar el domicilio; mientras falta se manda un marcador y el domicilio completo se vuelve a guardar al pagar. Nada se
calcula en el navegador: tarifas, envío gratis (`free`), precio fijo, recogida (`pickup`) y total son lo que devuelve OPS.
Se re-cotiza (antirrebote 400 ms, peticiones viejas canceladas) solo si cambian país, CP, estado o ciudad; si el precio
cambia, `DeliveryStatus` lo anuncia por `aria-live` («Actualizamos tu envío: …»). Al pagar, el servidor revalida el total
(`expected_total`): un total distinto nunca se cobra sin que el comprador lo vea.

## Código postal (`AddressFields` + `@asteby/storefront-react/postal`)

La fuente del código postal es el **catálogo del paquete de región** (p. ej. `region_mx`: ~32 mil CP con estado,
municipio y colonias) detrás de la Storefront API: `GET /storefront/region/postal-code?zip=` (`client.postalCode(zip)`).
Llena **y bloquea** Estado y Ciudad con los mismos nombres con que el servidor valida el estado de la dirección.

- **Por defecto**: si `<StorefrontProvider>` tiene un cliente de navegador (`pk_`), `AddressFields` lo usa solo. La prop
  `lookupPostalCode` lo sobreescribe.
- **Tiendas sin token de navegador** (todo pasa por el servidor de la tienda): una ruta mínima que reenvía a la API con
  el cliente del servidor y `Cache-Control` largo, y `lookupPostalCode` apunta a esa ruta del mismo origen.
- **Otro país**: nada que hacer en el SDK; el paquete de región del país sirve el mismo endpoint con su catálogo.
- Un CP que el catálogo no tiene devuelve `null`: Estado y Ciudad quedan editables y se muestra
  `messages.postalCodeNotFound` («No encontramos ese código postal; revísalo o escribe tu estado y ciudad.»).
- Si el CP cubre varios municipios la respuesta trae `cities` y la ciudad queda editable para que el comprador elija.

`createPostalLookup({ providers })` (subpath `/postal`, sin React) compone proveedores en orden con caché por CP,
`source` en la respuesta y respaldo si uno falla: `createStorefrontPostalProvider(client)` es el de la tienda;
`createCatalogProvider({ get })` envuelve un catálogo local para herramientas sin paquete de región.
`createOsmProvider` (Nominatim) está **obsoleto para tiendas**: los datos de OSM no son autoritativos para estado y ciudad
y nunca deben bloquear campos; no lo cablees en una tienda. Si lo usas en una herramienta propia, respeta la política de
Nominatim (User-Agent identificable, 1 petición por segundo, caché) y atribuye «© OpenStreetMap contributors» (ODbL).

## Calle y número con sugerencias (`AddressFields.suggestAddress`)

«Calle y número» sugiere direcciones mientras el comprador teclea. La fuente es el **proveedor de geocodificación del
mercado** detrás de la Storefront API (`GET /storefront/address/suggest`, `client.addressSuggest`; en OPS, el addon
`geo_photon` sobre un Photon autoalojado u otro que provea `geo.address.suggest`). El navegador nunca llama a un tercero y
la tienda no cablea proveedores: se elige por organización y mercado en OPS.

- **Por defecto** se activa solo si `<StorefrontProvider>` tiene un cliente de navegador; `suggestAddress={fn}` usa otra fuente
  (`(query, { signal, zip, country, locale }) => { suggestions, available?, degraded? }`) y `suggestAddress={false}` la apaga.
- **Solo sugiere.** El estado, la ciudad y la colonia son del catálogo del código postal: elegir una opción rellena calle y
  número, el CP si estaba vacío (y entonces corre la consulta normal) y la colonia **solo si es una del catálogo** (con su
  ortografía) o si el catálogo no tiene colonias para ese código. Nunca toma estado ni ciudad de la sugerencia, no pisa lo
  que el comprador escribió ni bloquea ningún campo. `onSuggestionChosen(s)` entrega la opción completa (`lat`, `lng`,
  `precision`, `source`) por si la tienda quiere guardarla; el contrato de dirección aún no tiene coordenadas.
- **Cuándo pregunta.** Desde 3 caracteres, tras 250 ms sin teclear, nunca espera más de 800 ms, descarta respuestas viejas, y
  tras dos fallos seguidos descansa 30 s. Sin proveedor (`available: false`), con uno lento o caído, el campo es el input de
  siempre: no hay error, no se bloquea nada, el pago no se toca.
- **Accesible.** Combobox ARIA (`role="combobox"`, `aria-expanded`, `aria-activedescendant`, listbox con opciones): flechas
  arriba/abajo, Enter acepta solo una opción resaltada (si no, Enter envía el formulario), Escape cierra, Tab sale, clic o toque
  elige sin quitar el foco; una región `aria-live` dice cuántas hay y qué se eligió. ES/EN (`messages`).
- **Atribución.** Junto a las opciones aparece «© OpenStreetMap contributors» (ODbL) enlazada a su página de copyright;
  `suggestAttribution={<span>…</span>}` la reemplaza y `false` la oculta (solo para un proveedor cuyos datos no la exijan).
- **Estilo.** Sin CSS propio usa colores del sistema; `classNames.suggestions|suggestion|suggestionActive|attribution` para el tuyo.
- En desarrollo, `createMockStorefront({ addressSuggestions: [...] })` sirve la ruta; sin ellas responde `available: false`.

## Promociones y venta cruzada (`@asteby/storefront-react/promotions`)

Mecanismos sin contenido: los textos y montos llegan como datos de OPS (`Cart.promotions`, `GET /storefront/promotions`, `carts.recommendations`).

```tsx
import { CartProgressBars, CrossSellModal, OrderNote, PromoPopup } from '@asteby/storefront-react/promotions'

<PromoPopup announcement={announcement} pathname={location.pathname}
  onEvent={track} renderCta={({ href, label, onClick }) => <Link to={href} onClick={onClick}>{label}</Link>} />
<CartProgressBars promotions={cart.promotions} />
<CrossSellModal open={open} promotions={cart.promotions} recommendations={recs.nodes} totalSaved={cart.cost.discount}
  onAdd={async ({ variantId }) => addToCart(variantId)}      // useFetcher; devuelve { error: 'sold_out' } en 409
  onContinue={goToPayment} onSkip={(why) => { markSeen(); goToPayment() }} />
<OrderNote value={cart.note} onSave={(n) => saveNote(n)} form={{ action: '/carrito', intent: 'note' }} />
```

- `PromoPopup`: solo cliente tras hidratar (no existe en el SSR), frecuencia `session` / cada N días (7) / una vez por versión, exclusiones de ruta (carrito, pago, gracias, cuenta, login, legales, editor; con o sin prefijo de mercado), sin rastreadores ni `navigator.webdriver`, dentro de la vigencia, disparadores 5 s / 2.ª página / 40 % de scroll (el primero), `<dialog>` con foco, Esc, fondo y X de 44 px.
- `CartProgressBars`: `role="progressbar"` con `aria-valuetext`; usa `remaining`, `percent` y `reached` del servidor; umbral 0 = «Envío gratis en todo tu pedido» sin barra.
- `CrossSellModal`: una vez por carrito lo decide la tienda; Esc/X/fondo/«Continuar sin agregar» = `onSkip`; errores de «agregar» en la tarjeta.
- `OrderNote`: `<textarea>` con etiqueta, 1000 caracteres, guardado con *debounce* (800 ms) y al salir del campo; sin JS es un `<form method="post">` con botón «Guardar nota».
- Funciones puras testeables: `isExcludedPath`, `frequencyAllows`, `isCrawler`, `withinWindow`, `resolveTrigger`, `safeInternalPath`.

## Cajón del carrito (`@asteby/storefront-react/cart`)

Cajón lateral derecho "Tu carrito (N)" que se abre al agregar. Subpath opcional, sin textos, rutas, moneda, iconos ni marca fijos: todo entra por props. Muestra `cart.cost` y los totales de línea de OPS; no recalcula nada. Muta el carrito con la acción de ruta que la tienda ya tiene (formularios `POST` nativos que funcionan sin JavaScript; con `useLineForm` se mejoran con un fetcher).

```tsx
import { CartDrawer, openCartDrawer, handleCartLinkClick, useOpenCartDrawerWhenDone } from '@asteby/storefront-react/cart'
import '@asteby/storefront-react/cart.css' // opcional: usa --background, --card, --border, --primary...

// root.tsx, una sola vez
<CartDrawer
  cart={cart}
  labels={{ title: t.cart.yourCart, close: t.cart.close, empty: t.cart.empty, subtotal: t.cart.subtotal, note: t.cart.calcAtCheckout,
            checkout: t.cart.checkout, viewCart: t.cart.viewCart, remove: t.cart.remove, increase: t.add.increase, decrease: t.add.decrease }}
  paths={{ cart: paths.cart(), checkout: paths.checkout(), browse: paths.collections(), product: (h, v) => paths.product(h, v) }}
  shipping={free && { message: '...', percent: free.progress, reached: free.reached, progressLabel: '...' }}  // calculado con lo que manda OPS
  upsell={<Suggestions />} upsellTitle={t.cart.suggestions}
  renderMoney={(m) => <Money data={m} />}
  renderLink={({ href, ...p }) => <Link to={href} {...p} />}   // navegación del router
  useLineForm={() => { const f = useFetcher(); return { Form: f.Form, formData: f.formData } }}  // opcional, optimista
/>

// Abrir tras agregar: busy = hay un agregado en vuelo
useOpenCartDrawerWhenDone(fetchers.some(isAdd), { skip: silent })
// Enlace de cabecera: href="/carrito" funciona sin JS; con JS abre el cajón
<a href={paths.cart()} onClick={handleCartLinkClick}>Mi carrito</a>
```

- `openCartDrawer()`, `closeCartDrawer()`, `toggleCartDrawer()`, `isCartDrawerOpen()` y el hook `useCartDrawer()` (`open`, `openDrawer`, `closeDrawer`, `toggle`).
- `form` ajusta el contrato de la acción (por omisión `intent=update|remove`, `line_id`, `quantity`).
- Accesibilidad: `<dialog>` modal con `role="dialog"` y `aria-modal`, foco atrapado y devuelto al abridor, Esc, clic fuera y botón de cierre, el scroll del fondo se bloquea, `prefers-reduced-motion` respetado en `cart.css`.
- Estilos: `cart.css` (CSS plano con los tokens de la tienda) y/o `classNames` por pieza (Tailwind). Cada pieza lleva `data-sf-cart-*`.
- `renderLine`, `renderImage`, `icons`, `notice` y `isDefaultVariantTitle` cubren las variaciones de cada tienda.

### Agregado optimista (`cartOptimistic`, `useOptimisticAdd`)

Al pulsar «Agregar» la fila aparece YA en el cajón, el contador sube y el cajón se abre (sin mover el foco al botón de cierre); cuando OPS responde, el carrito real la sustituye. Si la acción falla (409 sin existencias, `store_not_ready`, red, 5xx, tiempo agotado) la fila se quita, el contador regresa y aparece «No pudimos agregar X: motivo» (`role="alert"`, descartable); si el cajón queda vacío por el fallo, se cierra. **Solo es la fila**: precios, totales, envío e impuestos los dicta siempre OPS; el subtotal conserva el último valor de OPS con «calculando…» hasta confirmar. Sin JavaScript el formulario de la ruta sigue funcionando igual.

```tsx
import { useFetcher } from 'react-router'
import { useOptimisticAdd, useOptimisticCartCount } from '@asteby/storefront-react/cart'

function AddToCart({ product, variant }) {
  const fetcher = useFetcher()
  const { add } = useOptimisticAdd(fetcher) // confirma o revierte cuando el fetcher termina
  return (
    <fetcher.Form method="post" action="/carrito"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        add(
          { variantId: variant.id, title: product.title, variantTitle: variant.title, image: product.featured_image, price: variant.price, quantity: 1 },
          () => fetcher.submit(form),
        )
      }}>
      <input type="hidden" name="intent" value="add" />
      <input type="hidden" name="variant_id" value={variant.id} />
      <button type="submit">Agregar</button>
    </fetcher.Form>
  )
}

const badge = useOptimisticCartCount(cart?.total_quantity ?? 0) // contador de la cabecera
```

- La acción de ruta debe devolver el error en `fetcher.data` (`{ error: { code, status } }`, `{ ok: false }`, `{ success: false }` o `{ status >= 400 }`); para otro formato pasa `useOptimisticAdd(fetcher, { settle: (data) => ({ ok: true }) | ({ ok: false, reason }) })`. `describeAddFailure({ status, code })` da el motivo en es-MX.
- API sin React: `cartOptimistic.add(input, { open?, timeoutMs? })` devuelve el id de la acción; `confirm(id)`, `rollback(id, reason)`, `discard(id)` (sin aviso), `dismissNotice(id)`, `reset()`. Con `input.key` repetir la llamada no suma otra vez (doble clic); la misma variante comparte una fila y cada acción se confirma o revierte por separado, en cualquier orden.
- Un segundo `add` con el mismo fetcher antes de terminar da por entregado el anterior (el router lo reemplaza y manda el carrito real de la revalidación). Si el componente se desmonta, las filas en vuelo se descartan sin aviso.
- `optimisticLabels` en `CartDrawer` cambia los textos (`adding`, `added` «Agregado al carrito» en región `aria-live="polite"`, `calculating`, `failed(title, reason)`, `dismiss`). `cart.css` ya estiliza `data-sf-cart-line-pending`, `data-sf-cart-notice` y respeta `prefers-reduced-motion`.

## Compatibilidad de vehículos (`@asteby/storefront-react/fitment`)

Módulo opcional y sin interfaz para tiendas de refacciones: catálogo marca → modelo → año → motor, clave de vehículo, opciones en cascada del selector y estado de compatibilidad de cada pieza. No trae textos ni marcas: los prefijos de etiqueta, el atributo de la tabla de compatibilidad y las grafías del backend se inyectan con `fitmentConfig` / `parseCatalog`.

```ts
import { parseCatalog, resolveVehicle, fitmentConfig, fitFilterTags, withFit, safeRedirect } from '@asteby/storefront-react/fitment'

const config = fitmentConfig({ compatAttribute: 'compatibilidad' })        // por defecto: tags `fit:*`, atributo `compatibility`
const catalog = parseCatalog(section.props, { priorityAliases: { alta: 'high' } })
const vehicle = resolveVehicle(catalog, cookieKey)                         // null si la clave ya no existe
const tags = vehicle ? fitFilterTags(vehicle, config) : []                 // products.list({ tags_any: tags }), no `q` ni `filter.tag`
const product = withFit(rawProduct, vehicle, config)                       // cientos de tags fit:* → UNA etiqueta de estado
```

El catálogo acepta motores con tramos de años reales (`["2.4", 2007, 2017, 2020, 2022]` o `{ id, ranges }`): un hueco es un hueco, un modelo cubre un año solo si algún motor lo cubre y el selector no ofrece años fantasma. `vehicleCatalogToTree(catalog)` lo convierte al árbol que la organización publica para «Mis artículos» (abajo). La cookie, el formulario y el redirect son de la tienda; `safeRedirect` valida el destino. Para guardar varios vehículos en la cuenta, con selector y filtro listos, usa `/subjects`.

## Mis artículos / Mi garage (`@asteby/storefront-react/subjects`, contrato 1.9)

Algo del comprador para lo que compra (un vehículo, una impresora, un celular, una mascota, una talla), de un **tipo que la organización declara como dato**: el SDK no nombra ninguno y los textos salen de los datos (`kind.label`, `kind.label_plural`). Una tienda que no declara tipos (God's Nutrition, Local) **no tiene sección**: `loadSubjectsContext` devuelve `kinds: []` y no se pinta nada.

| Pieza | Para qué |
| --- | --- |
| `SubjectGarage` | «Mi garage» de un tipo: tarjetas con etiqueta, apodo, insignia «Activo», valores privados enmascarados, «Ver piezas compatibles», hacer activo, editar, eliminar (confirmación en línea) y agregar. Estados vacío, límite y «No pudimos cargar esto · Reintentar» |
| `SubjectPicker` | El formulario de un artículo, guiado por los campos del tipo: cascada que se angosta (marca → modelo → año → motor), años por rangos, campos libres y el campo privado. Sin JavaScript es un `<form method="post">` que avanza el nivel al enviar (`subject-refine`) |
| `SubjectFilter` / `SubjectFitBadge` | La barra «Para: Nissan NP300 2012 · Cambiar · Ver todo» de un catálogo y la insignia «Compatible con tu vehículo» de un producto. Enlaces, no botones |
| `useSubjects(client?)` | Hook para tiendas que pintan en el cliente (`ready` / `error` / `unavailable`) |
| `/subjects/server` | `loadSubjectsContext` (nunca lanza), `createSubjectAction`, cookie del invitado `sf_subject_<tipo>`, `subjectCacheHeaders` |
| `/subjects.css` | Hoja neutra opcional (`--sf-subject-*`) |

```tsx
// loader (/garage y los catálogos)
const subjects = await loadSubjectsContext(sf, { customer: customerClient, cookieHeader: request.headers.get('cookie') })
//   subjects.kinds        → [] si la tienda no declara tipos: no renderices la sección
//   subjects.active.vehicle → { label, fit_key, source: 'account' | 'cookie' }

// catálogo: solo lo compatible, con el filtro del servidor
const products = await sf.products.list({ tags_any: fitTagsAny(subjects.active.vehicle?.fit_key) })
headers = subjectCacheHeaders(cookieHeader, 'public, max-age=60', { signedIn })   // con artículo activo la página es privada; ambas respuestas llevan Vary: Cookie

// acción (POST /garage)
export const action = createSubjectAction({ storefront: sf, readCustomerToken })
// página
<SubjectGarage kind={kind} subjects={subjects.subjects} data={actionData} partsHref={(s) => `/piezas?para=${s.fit_key}`} status={subjects.degraded.subjects ? 'error' : 'ready'} />
```

**Privacidad.** Un campo `private` (placas) nunca entra a la etiqueta, la clave de compatibilidad, el filtro, la caché, la cookie ni el pedido. El servidor lo devuelve solo enmascarado (`••23`): el formulario no lo rellena, un campo vacío al editar conserva el guardado y `.clear` lo quita. La cookie del invitado guarda **solo** la `fit_key`, y `serializeSubjectCookie` se niega (`TypeError`) a escribir cualquier valor que no resuelva contra el catálogo del tipo. La acción no registra nada, no devuelve valores privados en `values` y los errores nombran el campo, nunca el valor.

**Adoptar en ProtekAuto** (la tienda no se toca en este paquete): (1) subir el SDK y usar `fitment` en lugar de `app/lib/vehicle.ts` (`fitmentConfig({ tagPrefix: 'fit:', stateTagPrefix: 'ajuste:', compatAttribute: 'compatibilidad' })`, `parseCatalog(props, { priorityAliases: { alta: 'high', media: 'medium', baja: 'low' } })`); (2) publicar los datos: registrar las secciones `subject_kinds` y `subject_catalog` (`PUT /storefront/content/section-types`, ver `shared/subjectspec/README.md` de addons), la página `subject-kinds` con el tipo `vehicle` (`label_plural: «Mi garage»`, plantilla `{make}/{model}/{year}/{engine}`, campo `plate` con `private: true`) y el catálogo con `splitSubjectTree(vehicleCatalogToTree(parseCatalog(...)))`: el real (50 marcas, 417 modelos, 1 165 opciones, ~70 KB como texto) no cabe en una página de OPS (una escritura de 64 KB con borrador y copia pública), así que va en 3 páginas `vehiculos-1..3` y el tipo las nombra todas en `catalog_ref`; (3) en el loader, `loadSubjectsContext` y `products.list({ tags_any })` en vez de buscar la etiqueta con `q` (`vehicle.server.ts` deja de filtrar a mano); (4) cookie `sf_subject_vehicle` en lugar de `pa_vehiculo` (leer la vieja una vez y reescribirla); (5) `/garage` con `SubjectGarage` + `createSubjectAction`; (6) `subjectCacheHeaders` en lugar de `vehicleCacheHeaders`. Pendiente fuera del SDK: ligar el artículo al pedido (`CheckoutRequest.subject`, `storefront_cart` + `customers`).

## Rastreo de envíos (`@asteby/storefront-react/tracking`)

Dónde va el paquete, en una pieza para cualquier tienda y cualquier transportista (Skydropx, Emissary, 99minutos, Envía…): `TrackingTimeline` (los escaneos, el más nuevo primero), `ShipmentTracker` (estado, guía copiable, enlace `https` del transportista, llegada estimada, escaneos y mapa opcional) y `TrackOrderLookup` (el formulario público «Rastrea tu pedido», sin sesión). Sin `StorefrontProvider`, headless (`data-sf-tracker*`, `data-sf-tracking-*`, `classNames`), es/en, accesible y con hoja opcional `tracking.css` (tokens `--sf-tracking-*` y los `--sf-tone-*` de las pantallas de pedido, claro y oscuro). Nunca imprime un `label_url`.

```tsx
// app/routes/rastreo.tsx
import { TrackOrderLookup, resolveTrackingLookup } from '@asteby/storefront-react/tracking'
import '@asteby/storefront-react/tracking.css'

export async function action({ request }: Route.ActionArgs) {
  return resolveTrackingLookup(sf, await request.formData()) // { tracking } | { error, retryAfter? }, nunca lanza
}

export default function Rastreo({ actionData }: Route.ComponentProps) {
  return (
    <TrackOrderLookup
      action="/rastreo"
      result={actionData?.tracking}
      error={actionData?.error}
      retryAfter={actionData?.retryAfter}
      trackerProps={{ loadMaps: () => import('@asteby/metacore-maps'), geocode }} // mapa: opcional
    />
  )
}
```

- **Funciona sin JavaScript**: es un `<form method="post">`; con JavaScript pasa `onSubmit` (recibe `{ order_number, email }` o `{ tracking_number }`) para no recargar la página. El resultado se anuncia (`aria-live="polite"`) y recibe el foco.
- **Misma respuesta ante cualquier falla** (`not_found`, `rate_limited`, `unavailable`): la página nunca distingue un pedido real de uno que no existe. `sf.tracking.lookup(input)` (`POST /storefront/customer/track`) las devuelve ya plegadas, sin lanzar; la ruta la habilita cada tienda.
- **Mapa opcional**: `loadMaps={() => import('@asteby/metacore-maps')}` lo carga bajo demanda (MapLibre, sin llaves de API; el SDK nunca lo importa). Dibuja la ruta con `map.path` del servidor o con los escaneos que traen `lat`/`lng`; si el transportista solo da nombres de ciudad, pasa `geocode(lugar)`. Sin coordenadas, sin `loadMaps` o si el mapa falla, queda la línea de tiempo y ningún error. El tipo de `loadMaps` acepta el módulo real tal cual (sin `as`): `src/tracking/maps-loader.typecheck.ts` lo compila en cada `typecheck`.
- **Estados**: `ShipmentTracker` resuelve `loading` / `empty` / `error` (con `onRetry`) / `ready`; una incidencia (`exception`, `lost`, `returned`) se anuncia como aviso (`role="status"`), no como fallo.
- `ShipmentCard` y `ShipmentDetail` (pedidos) usan `TrackingEventList` por dentro, con el mismo DOM de siempre.

## Contacto: teléfono y burbuja de WhatsApp (`@asteby/storefront-react/contact`)

Un solo lugar para el teléfono y el WhatsApp de cualquier tienda y cualquier giro. Sin número configurado **no se pinta nada**, así que una tienda que no lo use no cambia.

```tsx
import { PhoneLink, WhatsAppBubble, whatsappUrl } from '@asteby/storefront-react/contact'
import '@asteby/storefront-react/contact.css'

// En el layout raíz: `shop.contact` viene de la Storefront API (nada de números escritos en el código).
<WhatsAppBubble phone={shop.contact.whatsapp} pathname={location.pathname} hideOn={['/pagar']} />

// En el pie:
<PhoneLink phone={shop.contact.phone} />          // «+52 55 5104 6865» → tel:+525551046865
const href = whatsappUrl(shop.contact.whatsapp, 'Hola, necesito ayuda con mi pedido 123')  // enlace wa.me o null
```

- **`WhatsAppBubble`**: un `<a>` puro (funciona sin JavaScript) que abre el chat en pestaña nueva con `rel="noopener noreferrer"`. Solo icono: el nombre accesible sale de `label` (por omisión «Escríbenos por WhatsApp» / «Chat with us on WhatsApp»). `message` es el texto precargado (`''` para ninguno). `position` (`bottom-right` | `bottom-left`) y `offset` (px o longitud CSS) para librar una barra fija de la página. `hideOn` (cadenas que ocultan la ruta y todo lo que cuelga de ella, o RegExp) junto con `pathname`: el SDK no tiene router, la tienda le pasa la ruta actual.
- **`PhoneLink`**: enlace `tel:` que conserva el `+` y se lee «Llámanos al …».
- **`whatsappUrl(phone, text?)`**, `telHref`, `phoneDigits`, `isUsablePhone`, `isHiddenPath`: helpers puros. Un número con menos de 8 dígitos no es usable (devuelven `null`). El número debe llevar el código de país (`+52…`): wa.me no lo adivina.
- **Estilo** (`contact.css`, opcional): variables `--sf-whatsapp-bg` / `-fg` (verde `#0f7b6c`: el glifo blanco queda sobre 3:1, el mínimo para un gráfico), `-size`, `-inset`, `-offset`, `-z`, `-ring`. Va fijo con las áreas seguras del dispositivo y **sin cálculos con el ancho del viewport**: una barra de scroll visible nunca la mueve ni la recorta. Respeta `prefers-reduced-motion` y se oculta al imprimir.
- Textos es/en con `locale` y `messages` para cambiarlos.

## API

| Export | |
|---|---|
| `StorefrontProvider`, `useStorefront`, `useOptionalStorefront`, `useStorefrontClient` | Client (`client` or `config`), shop, locale, currency |
| `CartProvider`, `useCart`, `useOptionalCart`, `optimisticCart` | Cart state and optimistic reducers |
| `getCartIdFromCookie`, `serializeCartCookie`, `readCartCookie`, `writeCartCookie`, `CART_COOKIE_NAME` | Cart cookie helpers |
| `Money`, `Image`, `ProductPrice`, `defaultImageLoader` | Display components |
| `useProductOptions`, `VariantSelector`, `AddToCartButton`, `toMerchandise` | Variant selection and add to cart |
| `seoMeta`, `productMeta`, `collectionMeta` | Meta descriptors (React Router `meta` shape) |
| `productJsonLd`, `organizationJsonLd`, `localBusinessJsonLd`, `breadcrumbJsonLd`, `faqJsonLd`, `collectionJsonLd`, `JsonLd`, `serializeJsonLd` | schema.org JSON-LD |
| `defineSection`, `SectionRegistry`, `createSectionRegistry`, `Sections`, `resolveSectionProps`, `sectionJsonSchema` | Content sections |
| `themeToCss`, `themeToCssVariables`, `ThemeStyle`, `themeFontsHref`, `tokenName` | SSR theme |
| `ProductImage`, `ProductMockup`, `MockupProvider`, `createMockupRegistry`, `registerMockup`, `BUILTIN_MOCKUPS`, `MockupFrame`, `MockupText`, `TireMockup`, `PartMockup`, `SupplementMockup`, `GenericMockup` | Mockups de respaldo (subpath `/mockups`) |
| `PaymentMethodSection`, `buildPayChoices`, `createEmbeddedPayHandlers` + `jsonPayRoute` (`/payments/server`), `createResilientTransport`, `usePaymentRecovery`, `PaymentRecovery`, `mountQueued`, `checkoutShouldRevalidate`, `PaymentBrick`, `useEmbeddedPayment`, `VoucherCard`, `PaymentChallenge`, `createFetchTransport`, `mercadoPagoBricksAdapter`, `loadPaymentSdk`, `paymentCsp`, `readPaymentTheme` | Pago integrado (subpath `/payments`) |
| `PromoPopup`, `CartProgressBars`, `PromoProgressBar`, `CrossSellModal`, `OrderNote`, `isExcludedPath`, `frequencyAllows`, `isCrawler` | Promociones y venta cruzada (subpath `/promotions`) |

## `@asteby/storefront-react/ui`

Piezas de interfaz de tienda, sin dependencia de router. Importa los estilos una vez (`import '@asteby/storefront-react/ui.css'`)
y define los tokens `--background --foreground --border --tint --primary --primary-foreground --ring`.

| Pieza | Para qué |
|---|---|
| `Select` | Selector con teclado completo y tema claro/oscuro; sin JavaScript es un `<select>` nativo. |
| `Swatch` | Muestra 2D plana de una variante: color, combinación (partes iguales) o emoji. Aro del color primario solo si el color se pierde con el fondo. |
| `parseSwatchAttribute` / `resolveSwatchSpec` | El catálogo manda: atributo `"Nombre:#hex\|Nombre:#hex+#hex\|Nombre:🍓"`; si no hay dato, se resuelve por nombre (colores y sabores en español e inglés). |
| `ThemeToggle`, `THEME_INIT_SCRIPT` | Claro/oscuro con `html[data-theme]` y localStorage, sin parpadeo. |
| `InstallApp`, `useServiceWorker` | Instalación PWA (Android/Chrome y pista para iOS) y registro del service worker. |
| `.select`, `.check`, `.radio` | Controles de formulario con los tokens de la tienda. |
| `PendingButton` | Botón (o enlace con `href`) para lo que cuesta: pagar, descargar, procesar. Mientras `pending`: `disabled` + `aria-disabled` + `aria-busy`, `Spinner`, texto de estado, mismo ancho, anuncio `role="status"`, ignora clics; al terminar anuncia el resultado, devuelve el foco y aguanta 600 ms contra el doble clic. Sin estilos de marca (`className`/`classNames`, `data-sf-pending`, `data-sf-locked`). |
| `useActionLock` / `useSubmitOnce` | El candado: `useActionLock().run(fn)` para acciones propias (`fetch`, descargas; `AbortSignal` que se cancela al desmontar o con `abort()`) y `useSubmitOnce(pending)` para lo que posee el router (`useNavigation`/`useFetcher`). |
| `pendingMessages(locale, overrides)` | Textos ES/EN («Descargando…», «Generando factura…», «Procesando pago…», «Enviando…»), con override por `messages`. |

### Receta: acciones con loader (anti doble envío)

Toda acción que tarda o cuesta (pagar, descargar, generar, enviar) se monta igual; la tienda solo la viste. Necesita `@asteby/storefront-react/progress.css` (giro del spinner).

```tsx
import { PendingButton, useActionLock, useSubmitOnce } from '@asteby/storefront-react/ui'

// 1) Formulario de una ruta (React Router): el botón es un <button type="submit">, funciona sin JavaScript.
function RequestInvoice() {
  const nav = useNavigation()
  const { locked, guard } = useSubmitOnce(nav.state !== 'idle')
  return (
    <Form method="post" onSubmit={guard}>
      <PendingButton type="submit" pending={locked} kind="invoice" className="btn-primary">
        Solicitar factura
      </PendingButton>
    </Form>
  )
}

// 2) Acción propia (fetch, descarga): una sola ejecución, cancelable.
function Download({ href }: { href: string }) {
  const lock = useActionLock()
  return (
    <PendingButton
      pending={lock.pending}
      kind="download"
      result={lock.result}
      onClick={() => void lock.run(async (signal) => save(await fetch(href, { signal })))}
    >
      Descargar PDF
    </PendingButton>
  )
}
```

- Varios botones de envío en un mismo formulario: `shared` en cada uno; solo el pulsado muestra el spinner, todos se bloquean.
- Un `fetcher`: `pending={fetcher.state !== 'idle'}`.
- Textos: `kind` elige «Descargando…», «Generando factura…», «Procesando pago…», «Enviando…», «Guardando…»; `pendingLabel` o `messages={{ 'pending.pay': 'Cobrando…' }}` los cambian.
- Cierra un diálogo = cancela la petición: el `AbortSignal` de `run` se aborta al desmontar.
- El cliente no es la única defensa: en el servidor, `invoiceFileResponse({ ..., guard: { buyer: sessionToken } })` limita a 6 por minuto por comprador y documento (429 con `Retry-After`), comparte una sola llamada entre peticiones iguales y recuerda la respuesta 60 s.
- Ya lo usan, sin que la tienda haga nada: `InvoiceList`/`InvoiceDetail` (Ver factura, PDF, XML), `InvoiceStatusCard` (`pending`), `AccountAuth`, `EmailSettings`, `PostPurchasePrompt`, `PaymentMethodSection` (pagar; bloqueado también durante el 3DS) y `OrderList` (ver más).

## Cuenta del comprador: `/account`

Pantalla de cuenta compartida (contraseña, crear cuenta, verificar código, entrar con código, olvidé mi contraseña). La tienda no escribe nada de esto: el loader pregunta qué admite OPS, la action la resuelve el SDK y el componente muestra solo lo que la tienda ofrece.

```tsx
// app/routes/account.login.tsx (React Router v7)
import { Form, useActionData, useLoaderData, useNavigation, useSearchParams } from 'react-router'
import { AccountAuth } from '@asteby/storefront-react/account'
import { createAuthAction, loadAuthCapabilities } from '@asteby/storefront-react/account/server'
import '@asteby/storefront-react/checkout.css' // campos
import '@asteby/storefront-react/account.css'  // opcional

export const loader = () => loadAuthCapabilities(storefront) // caché de 60 s por cliente; nunca lanza
export const action = createAuthAction({
  storefront,                  // cliente sk_
  customerCookie,              // createCookie('sf_customer', ...): serialize(token, { expires })
  safeNext,                    // opcional; por omisión solo rutas del mismo sitio (safeNextPath)
})

export default function Login() {
  const caps = useLoaderData<typeof loader>()
  const data = useActionData<typeof action>()
  const nav = useNavigation()
  const [params] = useSearchParams()
  return <AccountAuth capabilities={caps} data={data} next={params.get('next')} pending={nav.state !== 'idle'} form={Form} />
}
```

- `loadAuthCapabilities(sf, { ttlMs?, signal?, now? })` -> `CustomerCapabilities`. Si OPS no responde (servidor viejo, caída, token sin scope) devuelve `SAFE_AUTH_CAPABILITIES` (`{ password: true, email_verification: false, otp_channels: [] }`) y reintenta a los 5 s.
- `createAuthAction({ storefront, customerCookie, safeNext?, defaultNext?, clientIp?, capabilities? })` -> `({ request }) => Promise<Response | AuthActionData>`. Un solo `POST` con campo `intent`: `login`, `register`, `resend`, `verify`, `otp-request`, `otp-login`, `forgot`, `reset`. Éxito: `303` a `next` con `Set-Cookie` de la sesión. Si no, `AuthActionData` (`{ ok, step?, email?, resent?, error?: { code, field?, retryAfter? } }`, sin textos ni contraseñas). `resend` repite el registro (misma entrada que `register`) para pedir un código nuevo en el paso «Confirma tu correo»: el servidor guarda solo el hash de la contraseña, así que el formulario la conserva **solo en memoria** del navegador y la manda en un segundo formulario aparte (el del código nunca la lleva); el servidor aplica su enfriamiento de 60 s (`429` → `error.retryAfter`) y el botón cuenta los segundos. Si las rutas de la tienda filtran los `intent` que aceptan (checkout, gracias), deben admitir `resend`. `forgot` siempre avanza a `reset` (no revela qué correos tienen cuenta).
- `<AccountAuth>`: `classNames` por pieza, atributos `data-sf-account-*`, `locale` (`es` por omisión, `en`), `messages` para cambiar cualquier texto, `form` para el `Form` del router. Con el mock (`createMockStorefront`) funciona entera: código `000000`.
- Sin JavaScript funciona el inicio de sesión con contraseña y los pasos que devuelve la action; el cambio entre pantallas (enlaces) necesita JavaScript.

### Invitación posterior a la compra (`/pagar/gracias`)

`<PostPurchaseAccountPrompt>` (`@asteby/storefront-react/account`) invita al invitado a crear cuenta justo después de pagar. Sin estilos propios: `data-sf-ppa-*`, `classNames`, `locale`, `messages`, `form`, `headingLevel`. La tienda lo compone con su diseño y apunta su `action` a la ruta que monta `createAuthAction`.

```tsx
<PostPurchaseAccountPrompt
  email={receipt.email}            // del comprobante de la sesión, leído en el servidor
  capabilities={capabilities}      // loadAuthCapabilities
  data={actionData}                // resultado de createAuthAction
  next="/cuenta/pedidos"
  action="/cuenta/entrar"
  form={Form}
/>
```

- El correo viaja como campo oculto y no se edita; solo se pide contraseña (o el código por correo si la tienda no tiene contraseñas). No pide dirección ni teléfono.
- Sin correo válido o sin forma de registrarse no pinta nada. Con verificación de correo la respuesta es la misma exista o no la cuenta (no enumera).
- El pedido de invitado hecho con ese correo (y su pago pendiente por ficha) aparece en «Mis pedidos» cuando el buzón queda verificado: `storefront_customers` filtra por `customer_id` o por correo VERIFICADO. En una tienda sin verificación de correo la cuenta nace sin verificar y no ve pedidos de invitado; el texto entonces no lo promete.

### Pantallas de pedidos (contrato 1.8)

Componentes **headless** de `@asteby/storefront-react/account` (+ `account.css` opcional y neutro, + `/account/server`). Sin estilos de marca: `data-sf-*`, `classNames`, variables CSS (`--sf-account-*`, `--sf-tone-*`), textos es/en con `locale` y `messages`, fechas con `timeZone` (pasa la zona de la tienda para que servidor y navegador impriman lo mismo). Todos los enums del servidor son abiertos: un valor desconocido se escribe con palabras genéricas, nunca como código.

| Componente | Qué pinta | Hooks de estilo |
|---|---|---|
| `OrderList` / `OrderCard` | Lista con estados `loading` (esqueletos de alto fijo), `error` (reintento), vacío útil y `ready`; cada tarjeta: número, fecha, estado, mini-progreso, envío, total y UNA acción | `data-sf-order`, `data-sf-order-status` |
| `Pager` | Anterior / Siguiente (o «Cargar más») de una lista paginada por cursor: enlaces reales a la misma página con otro cursor (`renderLink` para el router), «Mostrando 11–20 de 300» en región `aria-live`, `aria-busy` al navegar, error con reintento | `data-sf-pager`, `data-sf-pager-link`, `data-sf-pager-status` |
| `ListFilters` / `useListFocus` | Filtros (estado, entrega, factura, fechas, número de pedido) como formulario GET con los valores en la URL; `useListFocus(key)` lleva el foco al inicio de la lista al cambiar de página | `data-sf-list-filters`, `data-sf-list-focus` |
| `OrderStatusBadge` | Estado en palabras + tono (`done/current/problem/muted`) | `data-sf-tone` |
| `OrderProgress` | Línea de tiempo pagado → preparación → enviado → en camino → entregado (variante recoger, incidencia escrita, `compact`) como `<ol>` con `aria-current="step"` | `data-sf-step`, `data-sf-step-state` |
| `NextActionBar` | «Rastrear envío», «Descargar factura», «Pagar ahora»… `href` solo `https` (rastreo) o el que dé la tienda (`hrefFor`) | `data-sf-action` |
| `ShipmentCard` | Paquetería (marca por `renderCarrierMark`), número con copiar, enlace de rastreo `https`, fecha prometida, eventos (últimos 3 + «Ver todo»). `test_mode` → `testMode="hide"` (omisión) o `"mark"` («De prueba», sin número ni enlace). La guía solo en devoluciones. Hueco del mapa: `renderMap({ shipment, map })` | `data-sf-shipment-*` |
| `InvoiceList` | Facturas y notas de crédito (bajo su factura); estados `issued/pending/cancelled/error`; descarga solo por `fileHref` (tu ruta autenticada) o `onDownload`; sandbox marcado «de prueba, sin validez» o `testMode="hide"`; sin documentos, `renderSummary` (p. ej. `InvoiceStatusCard`) | `data-sf-invoice-*` |
| `PendingPaymentCard` / `PendingPaymentList` | Ficha de efectivo: referencia/CLABE, copiar, código de barras Code 128 (SVG), vencimiento, imprimir y descargar (por `voucherHref` de tu servidor o armada en el navegador, con su código en un chunk aparte) | `data-sf-voucher-*` |
| `RefundList`, `PaymentSummary` | Reembolsos y pagos | `data-sf-refund`, `data-sf-payment` |
| `useCustomerOrders`, `useCustomerOrder(id, { poll })`, `usePendingPayments` | Carga con `status` (`loading/ready/error/not_found`), `reload`, `loadMore`; `initial` desde el loader (SSR). Los datos son del cliente (sesión) y del id que los pidieron: al cambiar de comprador, cerrar sesión o cambiar de pedido no se muestra nada del anterior; pasa un cliente estable (`useMemo`), uno nuevo por render recarga cada vez | — |

`degraded` (secciones que el servidor no pudo leer) se pasa a la sección: error recuperable con «Reintentar» y el resto del pedido se ve.

```tsx
// Detalle de pedido (loader: sf.customer.order(id))
<h1>Pedido {order.number}</h1>
<OrderStatusBadge order={order} />
<NextActionBar order={order} hrefFor={(a) => (a.kind === 'download_invoice' ? `/cuenta/pedidos/${order.id}/facturas/${a.ref}.pdf` : null)} />
<OrderProgress order={order} />
{order.shipments?.map((s) => <ShipmentCard key={s.id} shipment={s} headingLevel={2} renderCarrierMark={(x) => <BrandMark brand={x.carrier_logo_key} />} />)}
<InvoiceList invoices={order.invoices} summary={order.invoice} degraded={order.degraded?.includes('invoices')} onRetry={revalidate}
  fileHref={(d, kind) => `/cuenta/pedidos/${order.id}/facturas/${d.id}.${kind}`} renderSummary={(s) => <InvoiceStatusCard invoice={s} requestHref="/cuenta/factura" />} />
<PaymentSummary payments={order.payments} /> <RefundList refunds={order.refunds} />
```

Rutas recurso de la tienda (`@asteby/storefront-react/account/server`), cada una en una línea; el navegador nunca ve el token del comprador ni una URL del PAC:

```ts
// account.order.$id.invoice.$doc.$kind.ts
export const loader = async ({ request, params }) => invoiceFileResponse({ storefront: await sfFor(request), orderId: params.id, invoiceId: params.doc, kind: params.kind, request })
// account.pending.$id.ficha.ts
export const loader = async ({ request, params }) => {
  const q = new URL(request.url).searchParams
  return pendingVoucherResponse({ storefront: await sfFor(request), id: params.id, download: q.get('descargar') === '1', format: q.get('formato') === 'pdf' ? 'pdf' : 'html', shopName: 'Mi tienda' })
}
```

La ficha es por método: OXXO/efectivo imprime referencia y código de barras (solo si el servidor manda `payment.barcode { format: 'code128' | 'code39', value }`; sin él, solo la referencia), SPEI/transferencia imprime beneficiario, banco, CLABE y referencia con instrucciones de transferencia. Las instrucciones salen de `payment.instructions_key` / método / `payment.kind` (es/en, con fallback genérico). `format: 'pdf'` entrega `ficha-de-pago.pdf` (`application/pdf`, attachment, no-store, solo del dueño) generado sin navegador; la página HTML trae «Descargar PDF» (enlace, sin JS; `pdfHref` por omisión `?formato=pdf`) e «Imprimir». Para `PendingPaymentList`/`Card`, `voucherHref(payment, { download, format })` pide `html` para ver/imprimir y `pdf` para descargar.

`invoiceFileResponse` sirve `attachment` (con `filename` y `filename*`; con `request` y `?inline=1` el PDF sale `inline` con `frame-ancestors 'self'` para la vista previa) con `Cache-Control: private, no-store`, `nosniff` y CSP `sandbox` ; todo lo que no es el archivo es JSON `{ error: { code, message } }` sin cabeceras de archivo (`404 not_found`, `409 not_ready` = «el PDF se está generando», `401`, `429`, `502 unavailable`) y los botones lo muestran como aviso en la página en vez de guardar un `pdf.txt`; el tipo sale de `kind`, no de lo que diga la API, y un archivo de más de `maxBytes` (10 MB por defecto) es un 502 genérico sin decodificarlo. `pendingVoucherResponse` solo entrega una ficha que está en la lista del comprador (si no, 404) con CSP cerrada y nonce por respuesta. Accesibilidad: WCAG 2.2 AA verificada con axe en las pruebas (contraste lo decide cada tienda con sus tokens), objetivos ≥ 44 px en el CSS opcional, `prefers-reduced-motion`. Presupuesto: todas las pantallas ≈ 13 KB gzip (prueba `size-budget`).

## Facturación y constancia fiscal (`/fiscal`)

Subruta `@asteby/storefront-react/fiscal` (+ `/fiscal/server`, + `fiscal.css` opcional). Todo sale de `Region.fiscal_id` (etiquetas, formato, regímenes, usos, documentos); el núcleo no sabe de ningún país. Textos es-MX por omisión, `locale="en"` o `messages` para otros.

- `FiscalIdentityFields`: ID fiscal (mayúsculas, sin espacios, validado con el patrón de la región), razón social, CP fiscal, régimen (filtrado por tipo de persona si pasas `personTypeOf`, p. ej. `personTypeByLength({ individual: 13, company: 12 })`) y uso (filtrado por `allowed_regimes`). Controles `invoice.<campo>`.
- `IdentityDocumentReader`: «Sube tu constancia». Lee el PDF en el dispositivo (pdf.js se carga bajo demanda con `import()`, nunca en el bundle principal) y requiere `workerSrc`, un `pdf.worker.mjs` que sirve TU sitio (sin CDN). Muestra los campos prellenados con la marca «De tu constancia», avisos (QR, vigencia, régimen) y errores (no PDF, tamaño, escaneado, contraseña) con salida a captura manual. Nunca muestra ni conserva lo que la región lista en `discard_fields` (CURP, calle...). Entrega valores + evidencia (`buildDocumentEvidence`).
- `InvoiceToggle`: «Necesito factura» colapsado; perfil guardado (RFC enmascarado, Cambiar / Usar otros datos), lector o captura manual. `onChange` da `{ requested, invoice, ready, source, payLabel }` (`Pagar` / `Pagar y facturar`).
- `InvoiceStatusCard`: los estados de una `InvoiceSummary` (sin pedir, esperando pago, en proceso con `onRefresh` cada 10 s máx. 1 min, emitida, faltan datos, revisión, fuera de plazo, no disponible, cancelada).
- Factura rechazada por un dato del comprador (contrato 1.18): `order.invoice` trae `reason_message` (frase lista, sin jerga ni texto del PAC), `reason_field`, `submitted` (lo que envió) y `retries_left`. `invoiceCorrection(order.invoice)` devuelve `values` (para prellenar `FiscalIdentityFields`), `errors` (marca el campo rechazado), `canCorrect` y `retriesLeft`; `InvoiceRejectionNotice` pinta el aviso («No pudimos emitir tu factura…», «Te quedan N intentos hoy»). El formulario vuelve a mostrarse sólo mientras no exista CFDI timbrado; con 0 intentos el resumen pasa a `needs_review` hasta mañana.
- `/fiscal/server`: `loadFiscalContext(sf)` (región + `capabilities.invoicing`, caché corta, degrada a «sin facturación» sin lanzar) y `createInvoiceAction({ storefront, customerCookie })` con intents `set-invoice`, `save-profile`, `request-invoice`, `clear-profile` y `extract-document` (subida sin JS: se lee en memoria con el mismo motor, 5 MiB / 6 páginas / 3 s, sin disco ni logs; el archivo se descarta).

```tsx
// app/routes/checkout.tsx (React Router)
import { InvoiceToggle } from '@asteby/storefront-react/fiscal'
import { createInvoiceAction, loadFiscalContext } from '@asteby/storefront-react/fiscal/server'
import '@asteby/storefront-react/fiscal.css'

export const loader = async () => ({ fiscal: await loadFiscalContext(storefront) })
export const action = createInvoiceAction({ storefront, customerCookie })

export default function Checkout() {
  const { fiscal } = useLoaderData<typeof loader>()
  const data = useActionData<typeof action>()
  const [pay, setPay] = useState('Pagar')
  return (
    <Form method="post" encType="multipart/form-data">
      {fiscal.region && (
        <InvoiceToggle region={fiscal.region} capabilities={fiscal.invoicing} profile={customer?.fiscal} data={data}
          canSave={!!customer} workerSrc="/assets/pdf.worker.mjs" serverUpload noJsHref="?factura=1"
          personTypeOf={personTypeByLength({ individual: 13, company: 12 })}
          onChange={(s) => setPay(s.payLabel)} />
      )}
      <button type="submit" name="intent" value="set-invoice">{pay}</button>
    </Form>
  )
}

// Cuenta: <IdentityDocumentReader region={region} workerSrc=... onConfirm={...} /> con intent save-profile (+ campo consent).
// Pedido:  <InvoiceStatusCard invoice={order.invoice} available={fiscal.available} onRefresh={revalidate} />
```

CSP: el lector necesita `worker-src 'self'` (o el origen que sirva el worker). Sin `workerSrc` el navegador no puede leer el PDF y el comprador pasa a captura manual.

### Cómo funciona y qué sale del navegador (nada)

«Escanear mi constancia» es una AYUDA de captura que corre entera en el navegador; el servidor sigue siendo la autoridad.

1. **En el navegador, y de ahí no sale nada.** El PDF, una foto del QR o los cuadros de la cámara se leen en el dispositivo: pdf.js (y `jsqr` como respaldo del `BarcodeDetector` nativo) se cargan con `import()` solo cuando el comprador elige un archivo, el worker lo sirve TU sitio (sin CDN), `isEvalSupported: false` y sin JavaScript del PDF. El archivo, su texto, el CURP y la calle se descartan al terminar (`discard_fields` de la región: ni se muestran ni se guardan) y no hay ninguna petición de red con ellos. Lo único que continúa es lo que el comprador ve y confirma en la tarjeta «Revisa tus datos»: RFC, razón social, CP, régimen y uso, más una evidencia mínima (tipo de documento, id del documento, fecha de emisión, huella SHA-256, de dónde vino) y solo si él marca «Guardar» para la próxima vez.
2. **Nunca envía solo.** Confirmar la tarjeta solo rellena el formulario (o `InvoiceToggle`); enviar es una acción aparte del comprador. Sin JavaScript el formulario manual sigue siendo la vía y `serverUpload` es opt-in (lee el archivo en memoria y lo descarta).
3. **El servidor no confía en lo extraído.** Lo extraído llega como cualquier dato tecleado (`request-invoice` / `save-profile` / `set-invoice`). OPS, `storefront_customers` y `fiscal_mexico` lo revalidan contra los datos de la región: estructura del RFC y dígito verificador, razón social (sin régimen societario), CP, régimen contra `region_fiscal_catalogs`, compatibilidad régimen-uso y tipo de persona. La evidencia (`document`) es informativa: no compra confianza ni salta ninguna validación.
4. **Qué NO hace.** No consulta al SAT ni a un proveedor (el QR solo aporta el RFC y el idCIF que ya trae); no valida que el nombre coincida con el registro del SAT. Eso lo decide el PAC al timbrar; si lo rechaza, el flujo de corregir y reintentar (`invoiceCorrection`) marca el campo.

## Correo de la cuenta (`<EmailSettings>`, contrato 1.15)

```tsx
const { customer, capabilities } = await loadAccountSettings(sf.withCustomerToken(token))
<EmailSettings customer={customer} capabilities={capabilities} data={actionData} pending={busy} form={Form} />
```

Muestra el correo con su estado (`Customer.email_verified`), un botón para pedir un código si no está verificado y, si `capabilities.email_change`, «Cambiar mi correo»: correo nuevo + contraseña (o un código de acceso enviado al correo actual con `email-reauth-code`) y después el código que llega al correo nuevo. La acción `createAccountSettingsAction` ya atiende los intents `email-*`. Sin la capacidad (OPS anterior a 1.15 o sin conector de correo) solo muestra el correo. Los textos no afirman que el correo se envió: la respuesta es la misma tenga o no cuenta la dirección nueva.


### Vista previa y descargas de la factura

`InvoiceList`, `InvoiceDetail` e `InvoiceHistory` (y por tanto «Mis facturas») muestran «Ver factura», «Descargar PDF» y «Descargar XML» cuando les pasas `fileHref`. Cada clic pide el archivo a TU ruta autenticada en ese momento (sin enlaces que venzan, tantas veces como quiera el comprador) y lo guarda con el nombre que manda el servidor (`factura-<serie>-<folio>.pdf`). «Ver factura» abre `InvoicePreviewDialog` (diálogo nativo con foco atrapado, Esc, título accesible, ES/EN; carga perezosa): el PDF incrustado, o mientras no exista, los datos del CFDI leídos del XML con «El PDF se está generando» y reintento. En móvil abre el PDF en una pestaña nueva. La ruta de la tienda solo necesita pasar `request` a `invoiceFileResponse`.

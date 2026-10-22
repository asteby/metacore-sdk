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

## Compatibilidad de vehículos (`@asteby/storefront-react/fitment`)

Módulo opcional y sin interfaz para tiendas de refacciones: catálogo marca → modelo → año → motor, clave de vehículo, opciones en cascada del selector y estado de compatibilidad de cada pieza. No trae textos ni marcas: los prefijos de etiqueta, el atributo de la tabla de compatibilidad y las grafías del backend se inyectan con `fitmentConfig` / `parseCatalog`.

```ts
import { parseCatalog, resolveVehicle, fitmentConfig, fitFilterTags, withFit, safeRedirect } from '@asteby/storefront-react/fitment'

const config = fitmentConfig({ compatAttribute: 'compatibilidad' })        // por defecto: tags `fit:*`, atributo `compatibility`
const catalog = parseCatalog(section.props, { priorityAliases: { alta: 'high' } })
const vehicle = resolveVehicle(catalog, cookieKey)                         // null si la clave ya no existe
const tags = vehicle ? fitFilterTags(vehicle, config) : []                 // filter.tag = alguno de
const product = withFit(rawProduct, vehicle, config)                       // cientos de tags fit:* → UNA etiqueta de estado
```

La cookie, el formulario y el redirect son de la tienda; `safeRedirect` valida el destino. Un componente de selector sobre estas funciones llega en una versión posterior.

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
| `PaymentBrick`, `useEmbeddedPayment`, `VoucherCard`, `PaymentChallenge`, `createFetchTransport`, `mercadoPagoBricksAdapter`, `loadPaymentSdk`, `paymentCsp`, `readPaymentTheme` | Pago integrado (subpath `/payments`) |
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

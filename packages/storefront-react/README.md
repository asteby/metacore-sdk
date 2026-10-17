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

### Theme

`themeToCss(theme, { selector?, naming?, fontFallback? })` turns
`content.theme()` into CSS variables: each color token as `--color-<name>`
(Tailwind 4) and `--<name>` (the `@asteby/metacore-theme` naming, so
metacore-ui components pick it up), fonts as `--font-<role>` and `--radius`.
Unsafe values (`;`, `{}`, `<`, `url(`) are dropped. `<ThemeStyle theme />`
renders it as a `<style>`; `themeFontsHref(theme)` gives a Google Fonts URL.

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

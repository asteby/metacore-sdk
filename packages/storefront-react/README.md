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

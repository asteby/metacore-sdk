# @asteby/storefront

Typed client for the **Storefront API v1**: the public API OPS serves for
headless stores (catalog, search, collections, cart, checkout, buyer accounts
and content). Zero runtime dependencies and only global `fetch`, so it runs
in Node 20+, edge runtimes (Workers, Vercel/Netlify edge) and browsers. ESM
and CommonJS builds with types.

Includes `@asteby/storefront/mock`: an in-memory implementation of the whole
contract (catalog with facets, carts, discounts, delivery, checkout, OTP
login, content) to build a store without OPS.

React bindings (cart, prices, images, SEO, sections, theme) live in
[`@asteby/storefront-react`](../storefront-react).

## Install

```bash
pnpm add @asteby/storefront
```

## Quickstart

### Server (SSR loaders) with a private `sk_` token

```ts
// app/lib/storefront.server.ts
import { createStorefrontClient } from '@asteby/storefront'

export const storefront = createStorefrontClient({
  baseUrl: process.env.OPS_URL + '/api/gw', // routes are appended as /storefront/...
  token: process.env.STOREFRONT_PRIVATE_TOKEN!, // sk_... never reaches the browser
  locale: 'es-MX',
  timeoutMs: 8000,
})

// app/routes/products.$handle.tsx
export async function loader({ params, request }: LoaderFunctionArgs) {
  const product = await storefront.products.get(params.handle!) // null on 404
  if (!product) throw new Response('Not found', { status: 404 })
  return { product }
}

// app/routes/search.tsx — filters map to repeated `filter.<attr>` params
const results = await storefront.products.list({
  q: 'llanta',
  collection: 'llantas',
  sort: 'price_asc',
  available: true,
  filters: { rim: [15, 16], vendor: 'Marca Norte' },
  first: 24,
  after: cursor,
})
results.nodes // Product[]
results.facets // Facet[]
results.page_info // { has_next_page, end_cursor }
```

Buyer routes need the session from the OTP login:

```ts
await storefront.customer.requestOtp({ email })
const { token } = await storefront.customer.createSession({ email, code })
const me = storefront.withCustomerToken(token) // sends X-Customer-Token
await me.customer.orders()
```

Checkout always sends an `Idempotency-Key` (generated with
`crypto.randomUUID()` unless you pass `{ idempotencyKey }`):

```ts
const { order, payment } = await storefront.carts.checkout(cartId, {
  payment_method: 'card',
  return_url: 'https://mystore.com/checkout/thanks',
})
if (payment.redirect_url) return redirect(payment.redirect_url)
```

### Browser with a public `pk_` token

`pk_` tokens only carry `catalog:read`, `content:read` and `cart:write`, so
they are safe to embed in the page. Checkout and buyer routes go through your
server.

```ts
import { createStorefrontClient, isTokenPublishable } from '@asteby/storefront'

const token = window.ENV.STOREFRONT_PUBLIC_TOKEN
if (!isTokenPublishable(token)) throw new Error('Use a pk_ token in the browser')

const sf = createStorefrontClient({ baseUrl: window.ENV.OPS_URL + '/api/gw', token })
const cart = await sf.carts.addLines(cartId, [{ variant_id, quantity: 1 }])
```

### Mock (no OPS)

```ts
import { createStorefrontClient } from '@asteby/storefront'
import { createMockStorefront } from '@asteby/storefront/mock'

const mock = createMockStorefront() // "Mi tienda": 24 products, 4 collections
const storefront = createStorefrontClient({
  baseUrl: 'https://mock.local/api/gw',
  token: 'sk_mock', // pk_* and sk_* both work; scopes are enforced like OPS
  fetch: mock.fetch,
})
```

Mock behaviour:

- Catalog: text search, `collection`, `available`, `price_min`/`price_max`,
  `filter.vendor`, `filter.product_type`, `filter.<attribute>` (tires carry
  `width`, `aspect`, `rim`, `size_key`, ...), all sorts, cursor pagination,
  facets, `ETag` + `304`.
- Cart: stock checks (`409 insufficient_stock`), discount code `BIENVENIDA10`
  (10 %), flat shipping (free from $999), express shipping and pickup at the
  shop branches, IVA included.
- Checkout: returns a fake order and a `redirect_url`, decrements stock and
  honours `Idempotency-Key`.
- Buyer: OTP code `000000`; seed customer `cliente@example.com` with one order.
- Content: theme tokens, `home` page (hero, product_grid, collection_list,
  rich_text, faq), `main` and `footer` menus, legal pages (`terminos`,
  `privacidad`, `devoluciones`) and two articles. `?preview=` returns a draft.

Images are `https://picsum.photos/seed/<handle>/800/800` placeholders built by
`MOCK_IMAGE_URL`; pass `createMockStorefront({ imageUrl })` to swap them.
`mock.reset()` restores the seed and `mock.state` exposes the live data.

## API

`createStorefrontClient(options)`:

| Option | |
|---|---|
| `baseUrl` | Gateway base, e.g. `https://ops.example.com/api/gw` |
| `token` | `pk_...` or `sk_...` → `Authorization: Bearer` |
| `customerToken?` | Buyer session → `X-Customer-Token` |
| `fetch?` | Custom fetch (default `globalThis.fetch`) |
| `locale?` | `Accept-Language` |
| `headers?` | Extra headers on every request |
| `timeoutMs?` | Abort after N ms (`StorefrontError` code `timeout`) |
| `onRequest?(ctx)` | Runs before each request; return a `Response` to short-circuit (SSR cache hit) |
| `onResponse?(ctx)` | Runs after each response (cache store, logging, metrics) |

Resources: `shop.get`, `products.list/get/recommendations`,
`collections.list/get`, `stock.get`,
`carts.create/get/addLines/updateLines/removeLines/setDiscountCodes/setBuyer/setShippingAddress/deliveryOptions/setDelivery/checkout`,
`customer.requestOtp/createSession/get/orders/order/requestReturn/requestInvoice/addresses.{list,create,update,delete}`,
`content.theme/page/menu/articles/article`. Every method takes a last
`options` argument: `{ cache, signal, next, headers, timeoutMs, customerToken }`
(plus `idempotencyKey` on writes and `preview` on pages/articles); unknown keys
are forwarded to `fetch`.

`get`-by-handle methods (`products.get`, `collections.get`, `carts.get`,
`customer.order`, `content.page/menu/article`) resolve `null` on 404. Every
other failure throws `StorefrontError` with `status`, `code`
(`validation`, `not_found`, `insufficient_stock`, `network`, `timeout`, ...),
`message` and `field`.

Helpers: `formatMoney(money, locale, options?)`, `parseMoney(money)`,
`toMoney(number, currency)`, `isTokenPublishable(token)`,
`productListQuery(params)`, `parseProductFilters(searchParams)`.

All contract types (`Product`, `Cart`, `Shop`, `Page`, ...) are exported from
the package root.

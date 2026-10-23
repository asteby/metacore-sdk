# @asteby/storefront

Typed client for the **Storefront API v1**: the public API OPS serves for
headless stores (catalog, search, collections, cart, checkout, buyer accounts
and content). Zero runtime dependencies and only global `fetch`, so it runs
in Node 20+, edge runtimes (Workers, Vercel/Netlify edge) and browsers. ESM
and CommonJS builds with types.

Includes `@asteby/storefront/mock`: an in-memory implementation of the whole
contract (catalog with facets, carts, discounts, delivery, checkout, OTP
login, content, region and invoices) to build a store without OPS, and
`@asteby/storefront/fiscal-document`: reads a buyer's fiscal document (PDF)
in the browser or Node with rules published by the region.

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

Stores that also offer email + password accounts ask what the store supports and
then use the password routes (the `StorefrontError` codes are `unauthorized` for
wrong credentials or codes, `conflict` for an email already registered and
`rate_limited` for too many attempts):

```ts
const caps = await storefront.customer.capabilities()
// { password: boolean, email_verification: boolean, otp_channels: ('email' | 'whatsapp')[] }

const res = await storefront.customer.register({ email, password, first_name, last_name })
const session =
  res.status === 'created'
    ? res.session // no verification required: already signed in
    : await storefront.customer.verifyRegistration({ email, code }) // code from the email

const again = await storefront.customer.loginWithPassword({ email, password })

// Signed-in buyer sets or changes the password (current_password when it already has one):
await storefront.customer.setPassword({ password, current_password }, { customerToken: session.token })

// Forgot password: requestOtp({ email }) emails a code, then
await storefront.customer.resetPassword({ email, code, password })
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
- Password accounts: `customer.capabilities()` is configurable
  (`createMockStorefront({ customerCapabilities })`, default
  `{ password: true, email_verification: true, otp_channels: ['email'] }`).
  `register` answers `verification_required` and the code is `000000`; accounts
  live in memory (passwords of 10-128 characters); `409` for a registered email,
  `401` for wrong credentials/codes, `429` after `maxLoginAttempts` (5) failed
  logins, `403` when `password` is disabled. The seed customer has no password
  until `setPassword` (or `resetPassword` with the OTP code).
- Content: theme tokens, `home` page (hero, product_grid, collection_list,
  rich_text, faq), `main` and `footer` menus, legal pages (`terminos`,
  `privacidad`, `devoluciones`) and two articles. `?preview=` returns a draft.

Images are `https://picsum.photos/seed/<handle>/800/800` placeholders built by
`MOCK_IMAGE_URL`; pass `createMockStorefront({ imageUrl })` to swap them.
`mock.reset()` restores the seed and `mock.state` exposes the live data.

## Geo helpers (`@asteby/storefront/geo`)

Pure TypeScript (no network, no DOM; Node 20, edge and browsers). Behaviour is
pinned by `src/geo-vectors.json`, shared with the Go implementation.

```ts
import {
  distanceKm, rankByDistance, formatDistance, directionsUrl, parseLatLng,
  openStatus, formatOpeningHours, toSchemaOpeningHours,
} from '@asteby/storefront/geo'

const origin = parseLatLng('19.4326,-99.1332') // null when malformed or (0,0)
const near = rankByDistance(shop.branches, origin!, { radiusKm: 25, limit: 3 })
// [{ item, distanceKm }] sorted by distance, ties keep input order.
// Items without a valid point (null, out of range or the "unset" (0,0)) are excluded.
formatDistance(near[0]!.distanceKm, 'es-MX') // "300 m" (50 m steps) or "4.2 km"
directionsUrl(near[0]!.item, { provider: 'google' }) // coordinates, else address text

const hours = { weekly: [{ day: 1, open: '09:00', close: '19:00' }, /* 1 = Mon ... 7 = Sun */] }
openStatus(hours, 'America/Mexico_City') // { open, closesAt, nextOpenAt } as ISO instants
formatOpeningHours(hours, 'es-MX')       // "Lun–Vie 9:00–19:00 · Sáb 9:00–14:00"
toSchemaOpeningHours(hours)              // ["Mo-Fr 09:00-19:00", "Sa 09:00-14:00"]
```

`openStatus` honors intervals that cross midnight, several intervals per day,
dated `exceptions` and daylight saving time (uses `Intl.DateTimeFormat`; throws
`RangeError` for an unknown time zone). `ShopBranch` has optional
`opening_hours`, `timezone` and `opening_hours_text`; they arrive with Storefront
API `locations.v1` and are not populated yet.

## Locations (`client.locations`, Storefront API `locations.v1`)

```ts
const { nodes } = await sf.locations.list()                        // visible branches
const byCp = await sf.locations.list({ postal_code: '06000' })     // ordered by distance_km
const one = await sf.locations.get('br_centro')                    // null when unknown
const near = await sf.locations.nearest({ lat: 19.4326, lng: -99.1332 }) // closest first, nodes[i].distance_km
```

`Location` is a `ShopBranch` whose structured fields are always present: `kind`,
`postal_code`, `timezone`, `opening_hours`, `services`, `contacts` and
`pickup { enabled, fee, prep_days }` (`fee: null` = free). `nearest` is
`private, no-store`: the server rounds the point to 0.01° and never stores it,
and the client neither logs nor keeps it (hooks such as `onRequest` do see the
URL, so do not log it). To rank branches you already have without sending the
point anywhere, use `rankByDistance` from `/geo` on `shop.branches`.
The mock serves the three routes with three example branches (CDMX, Monterrey,
Guadalajara) ordered by haversine; it knows the centroid of a few postal codes
(`MOCK_POSTAL_CENTROIDS`), pickup is offered only where `pickup.enabled`, and
the pickup `fee` is charged on the cart.

## Availability (Storefront API 1.1)

The server resolves the state (`availability.status`: `in_stock | low_stock | out_of_stock | backorder | preorder`)
and filters the quantity by the shop's `show_stock`; the storefront never calculates it nor invents a number.

```ts
import { availabilityView, resolveAvailability, cartLineProblemView } from '@asteby/storefront'

const a = resolveAvailability(variant)            // server `availability`, or polyfill from available_for_sale / quantity_available
const view = availabilityView(a, 'es-MX')         // { tone, label, sublabel, ctaLabel, ctaEnabled, showNotify, srText, maxPerOrder, showOnCard }
```

- Texts are es/en by key (`availabilityMessages(locale, overrides)`); a shop overrides texts, never the logic.
- The "Quedan N" threshold comes from the server (`availability.quantity` only arrives when it applies). The polyfill
  only reports `low_stock` if you pass the shop's own `lowStockThreshold`.
- `409 insufficient_stock`: `error.stockLines` lists `{ line_id, variant_id, sku, status, max_quantity }`; the cart is untouched.
  `CartLine.problem` is computed when the cart is read.
- `client.restock.subscribe({ sku, email | phone, locale, consent: true })` -> `202 { status: 'pending' }` ("Avísame cuando vuelva").
- `schemaAvailability(status)` returns the schema.org `ItemAvailability` URL.

## Mockup data (`@asteby/storefront/mockup`)

Pure helpers behind the fallback mockups of `@asteby/storefront-react/mockups`
(products without an image): which illustration to draw and what it may show.

```ts
import { resolveMockupKind, mockupDataFromProduct, cleanMockupText } from '@asteby/storefront/mockup'

resolveMockupKind(product)                 // 'tire' | 'part' | 'supplement' | 'generic' | a custom kind
resolveMockupKind(product, { rules, kinds, fallback })
mockupDataFromProduct('tire', product)     // { size, width, aspect, rim, service, model, brand, lightTruck, runFlat, title }
mockupDataFromProduct('supplement', product, variant) // flavor/presentation from the selected variant
```

Resolution: `mockup_kind` attribute (set in OPS) → attribute rules (tire specs,
part numbers) → words in `product_type`, category and tags (never the title) →
`generic`. Extractors only read the product (attributes, `vendor`, title,
options, variant), never prices, and never fill a missing value; every string
is cleaned and capped (`MOCKUP_TEXT_LIMITS`).

## Embedded payment and promotions (Storefront API 1.2)

Types and pure presentation helpers; the React components live in `@asteby/storefront-react`.

```ts
const cfg = await sf.checkouts.paymentConfig(checkoutId)          // payable, reason, amount, client, action (voucher/3DS pendiente tras recargar)
const methods = await sf.carts.paymentMethods(cart.id)           // methods[].options / .client (public data to mount the form)
const checkout = await sf.carts.checkout(cart.id, { payment_method: 'mercadopago', return_url, payment_flow: 'embedded', payment_option: 'card', expected_total: cart.cost.total })
const result = await sf.checkouts.pay(checkout.checkout.id, { method: 'card', provider_data: { token }, expected_total: cart.cost.total },
  { idempotencyKey: paymentIdempotencyKey(checkout.checkout.id, attemptId) })   // idempotencyKey is REQUIRED (throws before calling)
const outcome = paymentOutcome(result, 'es-MX')                   // approved | in_review | voucher | challenge | redirect | rejected | expired | cancelled
paymentErrorView(error)                                           // network (retry same attempt) | price_mismatch | payment_in_progress | expired | too_many_attempts
```

- `declineMessage(code, locale)` / `paymentMessages(locale, overrides)`: actionable es/en texts; unknown codes become `declined`.
- `safeHttpsUrl`: voucher and redirect URLs are only trusted when https.
- `sf.carts.recommendations(id, { first, placement })`, `sf.carts.setNote(id, note)`, `sf.promotions.list()`; `Cart.promotions`, `CartCost.discounts[]`.
- `promoProgressView(cart.promotions, locale)` and `rewardLabel(reward, locale)` only format what OPS sends (`remaining`, `percent`, `reached`); never subtract or divide in the shop.
- The mock serves `POST /checkouts/:id/payment` with outcomes by token (`tok_APRO` paid, `tok_FUND`/`tok_SECU`/`tok_EXPI`/`tok_FORM`/`tok_CALL`/`tok_OTHE` rejected, `tok_CONT` in review, `tok_3DS` challenge, `method: 'cash'` voucher), idempotency, `price_mismatch` 422, attempts cap 429 and `409` while another attempt is paid/pending; plus `PUT /carts/:id/note`, `GET /carts/:id/recommendations` and `GET /promotions`.

## Domain and market (single-customer storefront)

A storefront that belongs to ONE organization sends its verified domain plus the
market it is serving. OPS resolves the organization from the domain and honors
the market when that organization has it active (otherwise it falls back to the
domain's own market).

```ts
import { createStorefrontClient, storefrontDomainHeader } from '@asteby/storefront'

const client = createStorefrontClient({
  baseUrl: 'https://ops.example.com/api/gw',
  token: process.env.STOREFRONT_SK!,
  domain: 'godsnutrition.com', // verified domain of the organization
  market: 'mx',                // -> X-Storefront-Domain: godsnutrition.com#mx
})

storefrontDomainHeader('godsnutrition.com', 'MX') // 'godsnutrition.com#mx'
storefrontDomainHeader('godsnutrition.com')       // 'godsnutrition.com'
```

Per-request market (one domain, path prefixes `/mx`, `/us`): create the client
per request with that request's `market`, or build the header yourself with
`storefrontDomainHeader` and pass it in `headers`.

### Market detection and hreflang

Pure helpers, no DOM: `visitorCountry(headers)` (CDN country headers),
`preferredLanguages` / `negotiateLocale` (Accept-Language), `suggestMarket`
(suggests, never redirects; respects crawlers and a saved choice; country wins
over language) and `hreflangLinks` for per-market SEO.

## Fiscal identity and invoices (Storefront API 1.6)

The buyer's tax data travels in four pieces, all country-agnostic. What changes per country is DATA the region
publishes; the SDK knows no tax authority.

```ts
const region = await sf.region()              // GET /storefront/region (null on 404)
const fid = region?.fiscal_id                 // { kind, label, pattern, generic_ids, regimes[], invoice_uses[], documents[] }

// Ask for an invoice in the checkout. 422 names the exact field: `invoice.tax_id`, `invoice.tax_regime`, `invoice.use`...
await sf.carts.setInvoice(cart.id, { tax_id, legal_name, tax_regime, use, postal_code, document })
await sf.carts.setInvoice(cart.id, null)      // withdraw (sends { requested: false })
// checkout uses `carts.invoice` when `CheckoutInput.invoice` is omitted; both are validated BEFORE any charge.

await customer.customer.update({ fiscal: { ...data } })   // save to the account (PATCH /customer)
await customer.customer.update({ fiscal: null })          // delete it (ARCO)
await customer.customer.requestInvoice(order.id, data)    // later; order.invoice.stage / can_request / action drive the UI
```

`customer.capabilities().invoicing` says whether the store invoices (`available`, `countries`, `checkout`,
`post_purchase`, `identity_documents`). Types: `Region`, `RegionFiscalId`, `IdentityDocumentSpec`, `FiscalIdentity`,
`FiscalDocumentEvidence`, `InvoiceSummary` (`stage`, `reason_code`, `action`, `can_request`, `blocked_reason`, `url`,
`xml_url`), `CartInvoice`, `InvoicingCapabilities`.

### Reading the buyer's document (`@asteby/storefront/fiscal-document`)

The buyer can upload the authority's PDF (in Mexico, the constancia de situación fiscal) to prefill the form. It is
read **on the buyer's device** (or in memory on your server for the no-JS path); the PDF is never uploaded, stored or
logged. Only the fields the buyer reviews, plus minimal evidence (document id, SHA-256, extractor, QR match), travel.

```ts
import { readPdfText, extractIdentityDocument, decodePdfQr, buildDocumentEvidence, catalogsFromRegion, isIdentityDocumentError } from '@asteby/storefront/fiscal-document'

const spec = region.fiscal_id.documents.find((d) => d.kind === 'MX:csf')!

try {
  const { text, sha256 } = await readPdfText(file, { workerSrc: '/assets/pdf.worker.mjs', maxBytes: spec.max_bytes, maxPages: spec.max_pages }) // browser: YOUR worker URL
  const qr = await decodePdfQr(file, { workerSrc: '/assets/pdf.worker.mjs' })             // optional; null if it cannot (the URL the QR encodes)
  const x = extractIdentityDocument(text, spec, { catalogs: catalogsFromRegion(region.fiscal_id), qr })
  x.fields      // { tax_id, legal_name, postal_code, tax_regime: ['612', '605'], document_id, issued_on } (what was read)
  x.missing     // fields to leave empty for the buyer to type
  x.qr.match    // true | false | null (no QR / nothing to compare)
  x.stale       // older than spec.freshness_days
  const document = buildDocumentEvidence(x, { sha256, source: 'pdf_client' }) // goes in InvoiceRequest.document
} catch (err) {
  if (isIdentityDocumentError(err)) err.code // 'too_large' | 'not_pdf' | 'unreadable' | 'no_text' | 'password'
}
```

- **Sensitive data never comes out.** The spec's `discard_fields` (a national person id, street, activities...) are
  removed from the output whatever produced them (rules may not even declare them). The extraction carries no
  text and no error message contains document text.
- **pdf.js is loaded on demand** (`import('pdfjs-dist/legacy/build/pdf.mjs')`) with `isEvalSupported: false`; the
  main entry point does not include it. Install `pdfjs-dist@>=4.2.67` (older versions are affected by CVE-2024-4367).
  In browsers there is deliberately **no default worker and no CDN**: copy `pdf.worker.mjs` to your own assets and pass
  `workerSrc` (or `setPdfjsLoader` to configure it once). Allow it in your CSP with `worker-src 'self'`. Node needs no worker file.
- **Limits** (`readPdfText` options): `maxBytes` 5 MiB, `maxPages` 6, `timeoutMs` 3000, `%PDF-` signature checked first.
  Scans have no text layer: `no_text` means "ask for manual entry" (no OCR).
- **`decodePdfQr`** is best effort: `BarcodeDetector` or the optional `jsqr` package (both on demand) on a rendered page.
  Without a canvas (Node) it returns `null` unless you pass your own `decode(imageData)`. It never blocks the flow.
- **Countries with code**: `registerIdentityExtractor('<id or kind>', (text, spec, options) => ({ fields, qr }))`
  for a spec with `engine: 'plugin:<id>'`. `discard_fields` still applies to it. The server-side validator is the region's.

#### `rules@1`

The generic engine runs the rules of the spec (`spec.rules`; the API publishes an object, JSON text is accepted).
It is the TypeScript twin of the reference interpreter of the region packs (`regionspec.ExtractIdentity`): same
semantics, held to the same synthetic documents. The text is normalized (`nbsp`, `collapse_ws`), then each field
tries its strategies in order and the first non-empty value wins.

```jsonc
{
  "version": 1,
  "normalize": ["nbsp", "collapse_ws"],
  "labels": ["RFC", "CURP", "C[óo]digo Postal", "Reg[íi]menes", "Obligaciones"],  // a labelled value ends at the next caption
  "fields": [
    { "key": "tax_id", "required": true, "strategies": [
        { "strategy": "labeled_lines", "label": "RFC", "upper": true, "capture": { "pattern": "\\b([A-Z]{4}[0-9]{6}[A-Z0-9]{3})\\b", "group": 1 } },
        { "strategy": "qr_param", "param": "D3", "split": "_", "parts": 2, "match": "^[A-Z]{4}[0-9]{6}[A-Z0-9]{3}$" } ] },
    { "key": "tax_regime", "multiple": true, "strategies": [
        { "strategy": "catalog_phrases", "catalog": "fiscal_regime", "start": "Reg[íi]menes\\s*:?", "end": "Obligaciones\\s*:" } ] }
  ]
}
```

| Strategy | Reads |
|---|---|
| `regex` | `group` (0 = whole match) of the first match of `pattern` (`flags`: `i`, `s`, `m`) |
| `labeled_lines` | the value after the caption `label` up to the next caption of `labels`, line breaks or not |
| `concat_labeled` | the values of several captions joined with `separator` (first names + surnames) |
| `catalog_phrases` | the codes of the catalog entries whose phrases appear between `start` and `end`, in order of first mention. Phrases come from `match_phrases`, or the label when absent. No `start` found: no section |
| `date` | `pattern` with three groups in the order of `order` (`dmy`, `ymd`...); `months` (12 names) reads a month in text; calendar-invalid dates are dropped. Result `YYYY-MM-DD` |
| `qr_param` | from the QR URL: parameter `param`, split on `split` into exactly `parts` parts; the part matching `match` (uppercased) |

Any strategy takes `upper` and `capture` (`{pattern, flags, group}`: the value must match it and the group replaces
the value). **The text wins over the QR**; a `qr_param` strategy only fills what the text lacks, and `extraction.qr.match`
is `false` when both carry a field and differ (a warning, never a block). Patterns are limited to the subset common to Go and
JavaScript (no lookaround, backreferences, named groups, inline flags or `\p`); `validateRules` rejects the rest, and
a rule that produces a `discard_fields` field. Catalogs for `catalog_phrases` come from `catalogsFromRegion(region.fiscal_id)`
(`fiscal_regime`, `invoice_use`). A text that does not match yields `missing` (required fields); only a spec that cannot
run throws `IdentityRulesError`.

## API

`createStorefrontClient(options)`:

| Option | |
|---|---|
| `baseUrl` | Gateway base, e.g. `https://ops.example.com/api/gw` |
| `token` | `pk_...` or `sk_...` → `Authorization: Bearer` |
| `customerToken?` | Buyer session → `X-Customer-Token` |
| `clientIp?` | Shopper IP for server-side calls → `X-Storefront-Client-IP` (see below) |
| `fetch?` | Custom fetch (default `globalThis.fetch`) |
| `locale?` | `Accept-Language` |
| `domain?` | Public host of the storefront → `X-Storefront-Domain` (see below) |
| `market?` | Market code (`mx`, `us`) → `X-Storefront-Domain: <domain>#<market>`; ignored without `domain` |
| `headers?` | Extra headers on every request |
| `timeoutMs?` | Abort after N ms (`StorefrontError` code `timeout`) |
| `onRequest?(ctx)` | Runs before each request; return a `Response` to short-circuit (SSR cache hit) |
| `onResponse?(ctx)` | Runs after each response (cache store, logging, metrics) |

Resources: `shop.get`, `region`, `products.list/get/recommendations`,
`collections.list/get`, `stock.get`,
`carts.create/get/addLines/updateLines/removeLines/setDiscountCodes/setBuyer/setShippingAddress/deliveryOptions/setDelivery/setInvoice/checkout`,
`customer.requestOtp/createSession/capabilities/register/verifyRegistration/loginWithPassword/setPassword/resetPassword/get/update/orders/order/requestReturn/requestInvoice/addresses.{list,create,update,delete}`,
`content.theme/page/menu/articles/article`. Every method takes a last
`options` argument: `{ cache, signal, next, headers, timeoutMs, customerToken, clientIp }`
(plus `idempotencyKey` on writes and `preview` on pages/articles); unknown keys
are forwarded to `fetch`.

**Shopper IP (SSR).** A server that renders for many shoppers with one `sk_`/`pt_`
token shares a single rate-limit bucket, and the OTP limiter would see only the
server's address. Issue the token with the `trust_client_ip` option (OPS
`opts:trust_client_ip` scope) and pass the shopper's IP taken from your own
connection or trusted proxy (never from a browser-forgeable header):
`createStorefrontClient({ ..., clientIp })`, `client.withClientIp(ip)` or
`{ clientIp }` per call. It is sent as `X-Storefront-Client-IP`, never with a
`pk_` token, and invalid values (lists, ports, text) are dropped.

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

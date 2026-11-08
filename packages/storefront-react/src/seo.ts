/**
 * SEO helpers: pure functions returning meta descriptors (React Router v7
 * `meta` export shape) and schema.org JSON-LD objects (`<JsonLd>` renders them).
 * Nothing here touches the DOM, so it is safe in loaders and SSR.
 */
import { productAvailability, resolveAvailability, schemaAvailability, type Collection, type Image, type Product, type ResolveAvailabilityOptions, type SEO, type Shop } from '@asteby/storefront'
import { isValidPoint, toSchemaOpeningHours, type OpeningHours } from '@asteby/storefront/geo'

/** Same shape as React Router's `MetaDescriptor`. */
export type MetaDescriptor =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { tagName: 'link'; rel: string; href: string; [attr: string]: string }
  | { 'script:ld+json': JsonLdObject | JsonLdObject[] }

export type JsonLdObject = { '@context'?: string; '@type': string | string[]; [key: string]: unknown }

export type SeoMetaInput = {
  title?: string | null
  description?: string | null
  /** Canonical absolute URL. */
  url?: string | null
  image?: Image | string | null
  /** `og:type` (default `website`). */
  type?: string
  siteName?: string | null
  locale?: string | null
  noindex?: boolean
  /** Appended to the title as `Title | Suffix` unless already present. */
  titleSuffix?: string | null
}

const clean = (s: string | null | undefined, max?: number): string | undefined => {
  if (!s) return undefined
  const text = s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  return max && text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text
}

/** Generic title/description/canonical/Open Graph/Twitter descriptors. */
export function seoMeta(input: SeoMetaInput): MetaDescriptor[] {
  const out: MetaDescriptor[] = []
  let title = clean(input.title)
  if (title && input.titleSuffix && !title.includes(input.titleSuffix)) title = `${title} | ${input.titleSuffix}`
  const description = clean(input.description, 160)
  const image = typeof input.image === 'string' ? { url: input.image, alt: null } : (input.image ?? null)
  if (title) out.push({ title }, { property: 'og:title', content: title }, { name: 'twitter:title', content: title })
  if (description) {
    out.push({ name: 'description', content: description }, { property: 'og:description', content: description }, { name: 'twitter:description', content: description })
  }
  if (input.url) out.push({ tagName: 'link', rel: 'canonical', href: input.url }, { property: 'og:url', content: input.url })
  out.push({ property: 'og:type', content: input.type ?? 'website' })
  if (input.siteName) out.push({ property: 'og:site_name', content: input.siteName })
  if (input.locale) out.push({ property: 'og:locale', content: input.locale.replace('-', '_') })
  if (image) {
    out.push({ property: 'og:image', content: absoluteUrl(image.url, input.url) ?? image.url })
    if (image.width) out.push({ property: 'og:image:width', content: String(image.width) })
    if (image.height) out.push({ property: 'og:image:height', content: String(image.height) })
    if (image.alt) out.push({ property: 'og:image:alt', content: image.alt })
  }
  out.push({ name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' })
  if (input.noindex) out.push({ name: 'robots', content: 'noindex, nofollow' })
  return out
}

function seoOf(seo: SEO, fallbackTitle: string, fallbackDescription: string | null | undefined) {
  return { title: seo.title ?? fallbackTitle, description: seo.description ?? fallbackDescription ?? null }
}

/** Product page descriptors (`og:type=product` and price tags). */
const OG_AVAILABILITY = { in_stock: 'in stock', low_stock: 'in stock', out_of_stock: 'out of stock', backorder: 'backorder', preorder: 'preorder' } as const

export function productMeta(product: Product, shop: Pick<Shop, 'name' | 'locale'> | null, url: string, options: ResolveAvailabilityOptions = {}): MetaDescriptor[] {
  const { title, description } = seoOf(product.seo, product.title, product.description)
  const meta = seoMeta({
    title,
    description,
    url,
    image: product.featured_image,
    type: 'product',
    siteName: shop?.name ?? null,
    locale: shop?.locale ?? null,
    titleSuffix: shop?.name ?? null,
  })
  meta.push(
    { property: 'product:price:amount', content: product.price_range.min.amount },
    { property: 'product:price:currency', content: product.price_range.min.currency_code },
    { property: 'product:availability', content: OG_AVAILABILITY[productAvailability(product, options).status] ?? 'out of stock' },
  )
  if (product.vendor) meta.push({ property: 'product:brand', content: product.vendor })
  return meta
}

/** Collection page descriptors. */
export function collectionMeta(collection: Collection, shop: Pick<Shop, 'name' | 'locale'> | null, url: string): MetaDescriptor[] {
  const { title, description } = seoOf(collection.seo, collection.title, collection.description)
  return seoMeta({ title, description, url, image: collection.image, siteName: shop?.name ?? null, locale: shop?.locale ?? null, titleSuffix: shop?.name ?? null })
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

const CONTEXT = 'https://schema.org'

function shopUrl(shop: Pick<Shop, 'domain'>, fallback?: string): string | undefined {
  if (shop.domain) return /^https?:\/\//.test(shop.domain) ? shop.domain : `https://${shop.domain}`
  if (fallback) {
    try {
      return new URL(fallback).origin
    } catch {
      return undefined
    }
  }
  return undefined
}

/** `url` resolved against the page (`base`): JSON-LD and Open Graph need absolute URLs; OPS serves photos as `/storage/…`. */
function absoluteUrl(url: string | null | undefined, base: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (!base) return url
  try {
    return new URL(url, base).toString()
  } catch {
    return url
  }
}

function compact<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) delete obj[k]
  }
  return obj
}

function withVariant(url: string, variantId: string): string {
  try {
    const u = new URL(url)
    u.searchParams.set('variant', variantId)
    return u.toString()
  } catch {
    return `${url}${url.includes('?') ? '&' : '?'}variant=${encodeURIComponent(variantId)}`
  }
}

/** Return policy for `hasMerchantReturnPolicy`: pass it only from the shop's real policy (e.g. OPS `policies.returns_days`). */
export type ReturnPolicyJsonLd = {
  /** ISO 3166-1 alpha-2 (`MX`). */
  applicableCountry: string
  /** Days to return; `0` = no returns accepted. Not a finite number (`null` from OPS) → nothing is published. */
  days: number | null
  /** Public returns page. */
  url?: string | null
  fees?: 'FreeReturn' | 'ReturnFeesCustomerResponsibility' | 'ReturnShippingFees' | null
  method?: 'ReturnByMail' | 'ReturnInStore' | 'ReturnAtKiosk' | null
}

/** Shipping for `shippingDetails`: pass it only when the rate and times are the shop's real ones. */
export type ShippingJsonLd = {
  /** ISO 3166-1 alpha-2 destination (`MX`). */
  country: string
  rate: { amount: string; currency_code: string }
  /** Business days `[min, max]`. */
  handlingDays?: [number, number] | null
  transitDays?: [number, number] | null
}

export type ProductJsonLdOptions = ResolveAvailabilityOptions & {
  /** Display name (e.g. `productTitle(product, { identifiers: true })`); default `product.title`. */
  name?: string | null
  /** Manufacturer part number (`mpn`), on the product and on each offer of a single-variant product. */
  mpn?: string | null
  /** `YYYY-MM-DD`: only when the price really expires (a dated offer). */
  priceValidUntil?: string | null
  returnPolicy?: ReturnPolicyJsonLd | null
  shipping?: ShippingJsonLd | null
  /**
   * URL of a variant's offer when the product has several (default: `?variant=<id>` on `url`). Use the same rule as
   * the shopping feed (`productPath` of `@asteby/storefront/merchant`) so both point to the same page.
   */
  variantUrl?: ((variantId: string) => string) | null
}

function returnPolicyJsonLd(p: ReturnPolicyJsonLd): JsonLdObject | undefined {
  // An unknown window is not «no returns»: only an explicit 0 publishes MerchantReturnNotPermitted.
  if (typeof p.days !== 'number' || !Number.isFinite(p.days) || !p.applicableCountry) return undefined
  const days = Math.max(0, Math.floor(p.days))
  return compact({
    '@type': 'MerchantReturnPolicy',
    applicableCountry: p.applicableCountry,
    returnPolicyCategory: days > 0 ? 'https://schema.org/MerchantReturnFiniteReturnWindow' : 'https://schema.org/MerchantReturnNotPermitted',
    merchantReturnDays: days > 0 ? days : undefined,
    returnMethod: days > 0 && p.method ? `https://schema.org/${p.method}` : undefined,
    returnFees: days > 0 && p.fees ? `https://schema.org/${p.fees}` : undefined,
    merchantReturnLink: p.url ?? undefined,
  })
}

function shippingJsonLd(s: ShippingJsonLd): JsonLdObject {
  const range = (r: [number, number] | null | undefined) => (r ? { '@type': 'QuantitativeValue', minValue: r[0], maxValue: r[1], unitCode: 'DAY' } : undefined)
  const deliveryTime = s.handlingDays || s.transitDays ? compact({ '@type': 'ShippingDeliveryTime', handlingTime: range(s.handlingDays), transitTime: range(s.transitDays) }) : undefined
  return compact({
    '@type': 'OfferShippingDetails',
    shippingRate: { '@type': 'MonetaryAmount', value: s.rate.amount, currency: s.rate.currency_code },
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: s.country },
    deliveryTime,
  })
}

/** schema.org `Product` with one `Offer` per variant. Brand, SKU, MPN and availability match the shopping feeds. */
export function productJsonLd(product: Product, shop: Pick<Shop, 'name' | 'domain'> | null, url: string, options: ProductJsonLdOptions = {}): JsonLdObject {
  const images = (product.images.length ? product.images.map((i) => i.url) : product.featured_image ? [product.featured_image.url] : [])
    .map((u) => absoluteUrl(u, url))
    .filter((u): u is string => !!u)
  const name = options.name?.trim() || product.title
  const single = product.variants.length === 1
  const mpn = options.mpn?.trim() || undefined
  const returnPolicy = options.returnPolicy ? returnPolicyJsonLd(options.returnPolicy) : undefined
  const shippingDetails = options.shipping ? shippingJsonLd(options.shipping) : undefined
  const offers = product.variants.map((v) => {
    // schema.org availability comes from the server state; the quantity is never published.
    const availability = resolveAvailability(v, options)
    return compact({
      '@type': 'Offer',
      sku: v.sku,
      gtin: v.barcode ?? undefined,
      name: product.variants.length > 1 ? `${name} - ${v.title}` : undefined,
      mpn: single ? mpn : undefined,
      price: v.price.amount,
      priceCurrency: v.price.currency_code,
      availability: schemaAvailability(availability.status),
      availabilityStarts: availability.status === 'preorder' ? (availability.preorder_release_at ?? undefined) : undefined,
      itemCondition: 'https://schema.org/NewCondition',
      url: product.variants.length > 1 ? (options.variantUrl ? options.variantUrl(v.id) : withVariant(url, v.id)) : url,
      seller: shop ? { '@type': 'Organization', name: shop.name } : undefined,
      priceValidUntil: options.priceValidUntil ?? undefined,
      hasMerchantReturnPolicy: returnPolicy,
      shippingDetails,
    })
  })
  const additionalProperty = Object.entries(product.attributes).map(([name, value]) => ({ '@type': 'PropertyValue', name, value }))
  return compact({
    '@context': CONTEXT,
    '@type': 'Product',
    '@id': `${url}#product`,
    name,
    description: clean(product.description) ?? undefined,
    url,
    image: images,
    sku: single ? product.variants[0]!.sku : undefined,
    mpn,
    brand: product.vendor ? { '@type': 'Brand', name: product.vendor } : undefined,
    category: product.category?.title ?? product.product_type ?? undefined,
    additionalProperty,
    offers: offers.length === 1 ? offers[0] : offers,
  })
}

/** schema.org `Organization` for the shop (logo, contact, url). */
export function organizationJsonLd(shop: Shop, url?: string): JsonLdObject {
  const site = shopUrl(shop, url)
  const contactPoint = shop.contact.email || shop.contact.phone
    ? [compact({ '@type': 'ContactPoint', contactType: 'customer service', email: shop.contact.email ?? undefined, telephone: shop.contact.phone ?? undefined })]
    : []
  return compact({
    '@context': CONTEXT,
    '@type': 'Organization',
    '@id': site ? `${site}#organization` : undefined,
    name: shop.name,
    description: shop.description ?? undefined,
    url: site,
    logo: absoluteUrl(shop.logo?.url, site),
    email: shop.contact.email ?? undefined,
    telephone: shop.contact.phone ?? undefined,
    contactPoint,
  })
}

export type LocalBusinessOptions = {
  /** schema.org type (default `Store`), e.g. `AutoPartsStore`, `ClothingStore`. */
  type?: string
  /** Shop URL fallback when `shop.domain` is empty. */
  url?: string
  priceRange?: string
}

const SCHEMA_HOURS = /^(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?( \d{2}:\d{2}-\d{2}:\d{2})?$/

/**
 * schema.org `openingHours` values from structured hours or a legacy string.
 * A string is accepted only if EVERY comma-separated token is strict schema.org
 * syntax (`Mo-Fr 09:00-19:00`); free text such as `Lun-Sáb 8:00 a 18:00` yields
 * `undefined` so no invalid markup is ever emitted.
 */
export function openingHoursJsonLd(hours: OpeningHours | string | null | undefined): string[] | undefined {
  if (!hours) return undefined
  if (typeof hours !== 'string') {
    const list = hours.weekly ? toSchemaOpeningHours(hours) : []
    return list.length ? list : undefined
  }
  const tokens = hours.split(',').map((t) => t.trim())
  return tokens.length && tokens.every((t) => SCHEMA_HOURS.test(t)) ? tokens : undefined
}

/**
 * One schema.org `LocalBusiness` (default `Store`) per shop branch. Hours come
 * from `opening_hours` when present, else from the legacy `hours` string.
 */
export function localBusinessJsonLd(shop: Shop, options: LocalBusinessOptions = {}): JsonLdObject[] {
  const site = shopUrl(shop, options.url)
  return shop.branches.map((b) =>
    compact({
      '@context': CONTEXT,
      '@type': options.type ?? 'Store',
      '@id': site ? `${site}#branch-${b.id}` : undefined,
      name: `${shop.name} - ${b.name}`,
      url: site,
      image: absoluteUrl(shop.logo?.url, site),
      telephone: b.phone ?? shop.contact.phone ?? undefined,
      priceRange: options.priceRange,
      address: compact({ '@type': 'PostalAddress', streetAddress: b.address, addressLocality: b.city, addressCountry: shop.country_code }),
      geo: isValidPoint(b) ? { '@type': 'GeoCoordinates', latitude: b.lat, longitude: b.lng } : undefined,
      openingHours: openingHoursJsonLd(b.opening_hours ?? b.hours),
      parentOrganization: site ? { '@id': `${site}#organization` } : { '@type': 'Organization', name: shop.name },
    }),
  )
}

export type BreadcrumbItem = { name: string; url: string }

export function breadcrumbJsonLd(items: BreadcrumbItem[]): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: item.url })),
  }
}

export type FaqItem = { question: string; answer: string }

export function faqJsonLd(items: FaqItem[]): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}

/** schema.org `CollectionPage` with an `ItemList` of the products shown. */
export function collectionJsonLd(
  collection: Collection,
  products: Pick<Product, 'handle' | 'title' | 'featured_image'>[],
  url: string,
  options: { productUrl?: (handle: string) => string } = {},
): JsonLdObject {
  const origin = (() => {
    try {
      return new URL(url).origin
    } catch {
      return ''
    }
  })()
  const productUrl = options.productUrl ?? ((handle: string) => `${origin}/products/${handle}`)
  return compact({
    '@context': CONTEXT,
    '@type': 'CollectionPage',
    name: collection.seo.title ?? collection.title,
    description: clean(collection.seo.description ?? collection.description) ?? undefined,
    url,
    image: absoluteUrl(collection.image?.url, url),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.map((p, i) =>
        compact({ '@type': 'ListItem', position: i + 1, url: productUrl(p.handle), name: p.title, image: absoluteUrl(p.featured_image?.url, url) }),
      ),
    },
  })
}

/**
 * Serializes JSON-LD for a `<script>` tag, escaping `<`, `>`, `&` and line
 * separators so the payload cannot close the tag or inject markup.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

// ---------------------------------------------------------------------------
// Site-level and editorial JSON-LD (entity, E-E-A-T) and a light validator
// ---------------------------------------------------------------------------

/** schema.org `WebSite` with a `SearchAction` (sitelinks search box). `searchUrl` has `{search_term_string}` as the query. */
export function websiteJsonLd(input: { origin: string; url: string; name: string; locale?: string | null; searchUrl?: string | null }): JsonLdObject {
  return compact({
    '@context': CONTEXT,
    '@type': 'WebSite',
    '@id': `${input.origin}#website`,
    url: input.url,
    name: input.name,
    inLanguage: input.locale ?? undefined,
    publisher: { '@id': `${input.origin}#organization` },
    potentialAction: input.searchUrl
      ? { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: input.searchUrl }, 'query-input': 'required name=search_term_string' }
      : undefined,
  })
}

export type ArticleJsonLdInput = {
  url: string
  title: string
  description?: string | null
  image?: string | null
  publishedAt?: string | null
  modifiedAt?: string | null
  /** Real author (person). When absent the publisher is credited. */
  author?: { name: string; url?: string | null; jobTitle?: string | null } | string | null
  publisher: { name: string; url: string; logo?: string | null }
  locale?: string | null
  /** schema.org type (default `BlogPosting`). */
  type?: 'BlogPosting' | 'Article' | 'NewsArticle'
}

/** `BlogPosting`/`Article` with author, publisher, dates and language (headline cut to 110 characters). */
export function articleJsonLd(a: ArticleJsonLdInput): JsonLdObject {
  const author = typeof a.author === 'string' ? { name: a.author } : a.author
  return compact({
    '@context': CONTEXT,
    '@type': a.type ?? 'BlogPosting',
    '@id': `${a.url}#article`,
    headline: a.title.length > 110 ? `${a.title.slice(0, 109)}…` : a.title,
    description: clean(a.description, 160),
    image: absoluteUrl(a.image, a.url),
    datePublished: a.publishedAt ?? undefined,
    dateModified: a.modifiedAt ?? a.publishedAt ?? undefined,
    author: author
      ? compact({ '@type': 'Person', name: author.name, url: author.url ?? undefined, jobTitle: author.jobTitle ?? undefined })
      : { '@type': 'Organization', name: a.publisher.name },
    publisher: compact({ '@type': 'Organization', name: a.publisher.name, url: a.publisher.url, logo: a.publisher.logo ? { '@type': 'ImageObject', url: a.publisher.logo } : undefined }),
    inLanguage: a.locale ?? undefined,
    mainEntityOfPage: { '@type': 'WebPage', '@id': a.url },
  })
}

export type WebPageJsonLdInput = {
  url: string
  name: string
  type?: 'WebPage' | 'AboutPage' | 'ContactPage' | 'FAQPage' | 'CollectionPage'
  description?: string | null
  locale?: string | null
  datePublished?: string | null
  dateModified?: string | null
  /** Date the content was last reviewed (E-E-A-T); publish only a real review. */
  lastReviewed?: string | null
  reviewedBy?: { name: string; url?: string | null } | null
  origin?: string | null
}

/** `WebPage` (`AboutPage`, `ContactPage`…) with the content-review date and reviewer when the store has them. */
export function webPageJsonLd(p: WebPageJsonLdInput): JsonLdObject {
  return compact({
    '@context': CONTEXT,
    '@type': p.type ?? 'WebPage',
    '@id': `${p.url}#webpage`,
    url: p.url,
    name: p.name,
    description: clean(p.description, 160),
    inLanguage: p.locale ?? undefined,
    datePublished: p.datePublished ?? undefined,
    dateModified: p.dateModified ?? undefined,
    lastReviewed: p.lastReviewed ?? undefined,
    reviewedBy: p.reviewedBy ? compact({ '@type': 'Organization', name: p.reviewedBy.name, url: p.reviewedBy.url ?? undefined }) : undefined,
    isPartOf: p.origin ? { '@id': `${p.origin}#website` } : undefined,
    about: p.origin ? { '@id': `${p.origin}#organization` } : undefined,
  })
}

export type RealReview = { author: string; rating: number; text?: string | null; date?: string | null }

/**
 * `aggregateRating` + `review` for a Product, ONLY from real, visible reviews: every review needs an author and a 1–5
 * rating; with none (or none valid) it returns `null`, so a store without reviews publishes nothing. The aggregate is
 * computed from the reviews received (or from `summary` when the store keeps its own real count, e.g. migrated reviews).
 * Never call it with sample or placeholder data.
 */
export function productReviewsJsonLd(reviews: readonly RealReview[], summary?: { value: number; count: number } | null): { aggregateRating: JsonLdObject; review: JsonLdObject[] } | null {
  const valid = reviews.filter((r) => r.author?.trim() && Number.isFinite(r.rating) && r.rating >= 1 && r.rating <= 5)
  if (!valid.length) return null
  const sum = summary && summary.count >= valid.length && summary.value >= 1 && summary.value <= 5 ? summary : { value: valid.reduce((s, r) => s + r.rating, 0) / valid.length, count: valid.length }
  return {
    aggregateRating: { '@type': 'AggregateRating', ratingValue: Math.round(sum.value * 10) / 10, reviewCount: sum.count, bestRating: 5, worstRating: 1 },
    review: valid.map((r) =>
      compact({ '@type': 'Review', author: { '@type': 'Person', name: r.author.trim() }, reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 }, reviewBody: clean(r.text) ?? undefined, datePublished: r.date ?? undefined }),
    ),
  }
}

const REQUIRED: Record<string, string[]> = {
  Organization: ['name'],
  WebSite: ['name', 'url'],
  Product: ['name', 'offers'],
  Offer: ['price', 'priceCurrency', 'availability'],
  BreadcrumbList: ['itemListElement'],
  FAQPage: ['mainEntity'],
  BlogPosting: ['headline', 'datePublished', 'author', 'publisher'],
  Article: ['headline', 'datePublished', 'author', 'publisher'],
  AggregateRating: ['ratingValue', 'reviewCount'],
  Review: ['author', 'reviewRating'],
}

/** Light structural check of a JSON-LD object (and its nested `offers`/`review`): required properties per type, ISO currency, absolute URLs. Returns human-readable issues; `[]` = ok. */
export function validateJsonLd(obj: unknown, path = '$'): string[] {
  const issues: string[] = []
  if (Array.isArray(obj)) return obj.flatMap((o, i) => validateJsonLd(o, `${path}[${i}]`))
  if (!obj || typeof obj !== 'object') return issues
  const o = obj as Record<string, unknown>
  const types = ([] as unknown[]).concat(o['@type'] ?? []).map(String)
  for (const t of types) for (const key of REQUIRED[t] ?? []) if (o[key] === undefined || o[key] === null || o[key] === '') issues.push(`${path}: ${t} sin ${key}`)
  if (typeof o.priceCurrency === 'string' && !/^[A-Z]{3}$/.test(o.priceCurrency)) issues.push(`${path}: priceCurrency inválida`)
  if (typeof o.price === 'string' && !/^\d+(\.\d+)?$/.test(o.price)) issues.push(`${path}: price no numérico`)
  for (const key of ['url', 'image', 'logo']) {
    for (const v of ([] as unknown[]).concat(o[key] ?? [])) if (typeof v === 'string' && !/^https?:\/\//.test(v)) issues.push(`${path}.${key}: URL no absoluta`)
  }
  for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object') issues.push(...validateJsonLd(v, `${path}.${k}`))
  return issues
}

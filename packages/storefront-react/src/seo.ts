/**
 * SEO helpers: pure functions returning meta descriptors (React Router v7
 * `meta` export shape) and schema.org JSON-LD objects (`<JsonLd>` renders them).
 * Nothing here touches the DOM, so it is safe in loaders and SSR.
 */
import type { Collection, Image, Product, SEO, Shop } from '@asteby/storefront'
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
    out.push({ property: 'og:image', content: image.url })
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
export function productMeta(product: Product, shop: Pick<Shop, 'name' | 'locale'> | null, url: string): MetaDescriptor[] {
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
    { property: 'product:availability', content: product.available_for_sale ? 'in stock' : 'out of stock' },
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

/** schema.org `Product` with one `Offer` per variant. */
export function productJsonLd(product: Product, shop: Pick<Shop, 'name' | 'domain'> | null, url: string): JsonLdObject {
  const images = product.images.length ? product.images.map((i) => i.url) : product.featured_image ? [product.featured_image.url] : []
  const offers = product.variants.map((v) =>
    compact({
      '@type': 'Offer',
      sku: v.sku,
      gtin: v.barcode ?? undefined,
      name: product.variants.length > 1 ? `${product.title} - ${v.title}` : undefined,
      price: v.price.amount,
      priceCurrency: v.price.currency_code,
      availability: v.available_for_sale ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      url: product.variants.length > 1 ? withVariant(url, v.id) : url,
      seller: shop ? { '@type': 'Organization', name: shop.name } : undefined,
    }),
  )
  const additionalProperty = Object.entries(product.attributes).map(([name, value]) => ({ '@type': 'PropertyValue', name, value }))
  return compact({
    '@context': CONTEXT,
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.title,
    description: clean(product.description) ?? undefined,
    url,
    image: images,
    sku: product.variants.length === 1 ? product.variants[0]!.sku : undefined,
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
    logo: shop.logo?.url,
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
      image: shop.logo?.url,
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
    image: collection.image?.url,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.map((p, i) =>
        compact({ '@type': 'ListItem', position: i + 1, url: productUrl(p.handle), name: p.title, image: p.featured_image?.url }),
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

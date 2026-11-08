/**
 * Shopping feeds and crawler files built from the Storefront API catalog: Google Merchant Center (RSS 2.0 XML and
 * TSV), OpenAI / ChatGPT Merchants (Product Feed Spec, JSONL) and `robots.txt`.
 *
 * Pure functions: the storefront walks its catalog with its own (anonymous) client and serves the result on its own
 * domain. Nothing here computes prices or stock: price, sale price and availability are what OPS sent, in the
 * currency of the market the client asked for.
 */
import { resolveAvailability } from './availability.js'
import { PART_TITLE_KEYS, productTitle, type PartTitleKeys, type TitleLocale } from './product-title.js'
import { AI_SEARCH_AGENTS, AI_TRAINING_AGENTS, AI_USER_AGENTS, WEB_SEARCH_AGENTS, crawlerGroups, type CrawlerPolicy } from './seo-kit.js'
import type { Connection, Image, Money, Product, ProductVariant } from './types.js'

export type FeedAvailability = 'in_stock' | 'out_of_stock' | 'preorder' | 'backorder'

/** One sellable item (a variant) of the catalog, in neutral form; the writers below format it per channel. */
export type FeedItem = {
  /** Stable id: the variant SKU (≤ 50 chars) or its OPS id. */
  id: string
  /** OPS id of the variant (fallback id when two variants share a SKU). */
  variant_id: string
  /** Product id when the product has several variants (Google `item_group_id`, OpenAI `group_id`). */
  group_id: string | null
  title: string
  description: string
  link: string
  image_link: string
  additional_image_links: string[]
  availability: FeedAvailability
  /** RFC 3339 / `YYYY-MM-DD`, only for `preorder` / `backorder` when OPS knows it. */
  availability_date: string | null
  /** Regular price; with an offer it is the compare-at price and `sale_price` carries the selling price. */
  price: Money
  sale_price: Money | null
  brand: string | null
  mpn: string | null
  gtin: string | null
  /** `false` when there is no GTIN (Google `identifier_exists=no`); brand and MPN are still sent. */
  identifier_exists: boolean
  condition: 'new'
  product_type: string | null
  /** Selected options of a variant (`{ Talla: 'M' }`); empty for single-variant products. */
  variant_options: Record<string, string>
}

/**
 * Why a variant is not in the feed. `no_date`: a preorder without a release date (Google requires it, and it is
 * never invented). `no_link`: `productPath` gave no http(s) URL. `duplicate_id`: SKU and OPS id both already used.
 */
export type FeedSkipReason = 'hidden' | 'no_price' | 'no_image' | 'out_of_stock' | 'no_brand' | 'no_date' | 'no_link' | 'duplicate_id'

export type FeedOptions = {
  /** Public origin of the store, no trailing slash (`https://protekauto.com.mx`). */
  siteUrl: string
  /**
   * Path of a product page. For a product with several variants it gets the variant id too; for a single-variant
   * product `variantId` is `undefined`. Put the variant in the path or the query, never in a `#fragment` (crawlers drop
   * it). When the function ignores the id, `?variant=<id>` is added. Pass the same rule to `productJsonLd`
   * (`variantUrl`) so the feed `link` and the JSON-LD offer `url` match.
   * E.g. `(h, v) => `/productos/${h}` + (v ? `?variante=${v}` : '')`.
   */
  productPath: (handle: string, variantId?: string) => string
  locale?: TitleLocale
  /** Title of the item. Default: `productTitle(product, { identifiers: true })` (type, brand, part number, fitment). */
  title?: (product: Product) => string
  /** Attribute keys for the part title / part number (`PART_TITLE_KEYS` by default). */
  keys?: Partial<PartTitleKeys>
  /** Out-of-stock items are left out unless this is `true` (then they go as `out_of_stock`). Default `false`. */
  includeOutOfStock?: boolean
  /** Internal / test products. Default: tags `qa` / `interno`, or every SKU starts with `TEST-`. */
  isHidden?: (product: Product) => boolean
  /** Brand for products without `vendor`; without it such items are skipped (`no_brand`): both channels require it. */
  brandFallback?: string | null
}

const HIDDEN_TAGS = new Set(['qa', 'interno'])

/**
 * Internal products (payment / shipping QA): never in a feed. Same rule as the storefronts' hidden products and as
 * `isInternalProduct` of the main entry (sdk#1409); kept private here so both can land in any order, to unify later.
 */
function internalProduct(product: Pick<Product, 'tags'> & { variants?: readonly Pick<ProductVariant, 'sku'>[] | null }): boolean {
  if ((product.tags ?? []).some((t) => HIDDEN_TAGS.has(String(t).trim().toLowerCase()))) return true
  const skus = (product.variants ?? []).map((v) => v.sku ?? '').filter(Boolean)
  return skus.length > 0 && skus.every((s) => /^TEST-/i.test(s))
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
/** `description_html` → text: tags out, then entities decoded (`&amp;` last, so `&amp;lt;` stays `&lt;`). */
const fromHtml = (html: string | null | undefined) =>
  squash(
    String(html ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&'),
  )

/** Cuts at a word boundary, never mid-word, adding `…` when it had to cut. */
export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:–-]+$/, '')}…`
}

function absolute(url: string | null | undefined, base: string): string | null {
  if (!url) return null
  try {
    const u = new URL(url, `${base}/`)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

/** Feed images must be raster files reachable by the crawler (no SVG mockups, no data: URLs). */
const usableImage = (img: Image | null | undefined, base: string) => {
  const url = absolute(img?.url, base)
  return url && !/\.svg(\?|#|$)/i.test(url) ? url : null
}

/** GTIN-8/12/13/14 with a valid check digit; anything else is not sent. */
export function validGtin(value: string | null | undefined): string | null {
  const digits = String(value ?? '').trim()
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(digits)) return null
  const nums = digits.split('').map(Number)
  const check = nums.pop()!
  const sum = nums.reverse().reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check ? digits : null
}

const positive = (m: Money | null | undefined): m is Money => !!m && feedAmount(m) !== null && Number(m.amount) > 0

/** Decimals of a currency (`MXN` 2, `JPY` 0). */
function currencyDigits(code: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

/**
 * OPS's amount as the feeds want it, without passing through a float: `494.7` → `494.70`, `1500` JPY → `1500`.
 * `null` (item skipped as `no_price`) when it is not a plain decimal or has more decimals than the currency.
 */
export function feedAmount(money: Money): string | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(money.amount ?? '').trim())
  if (!m || !/^[A-Za-z]{3}$/.test(money.currency_code ?? '')) return null
  const digits = currencyDigits(money.currency_code.toUpperCase())
  const decimals = (m[2] ?? '').replace(/0+$/, '')
  if (decimals.length > digits) return null
  return digits ? `${m[1]}.${decimals.padEnd(digits, '0')}` : m[1]!
}

function variantLink(base: string, product: Product, variant: ProductVariant, productPath: FeedOptions['productPath']): string | null {
  const plain = absolute(productPath(product.handle), base)
  if (product.variants.length <= 1 || !plain) return plain
  const withVariant = absolute(productPath(product.handle, variant.id), base)
  if (withVariant && withVariant !== plain) return withVariant
  const u = new URL(plain)
  u.searchParams.set('variant', variant.id)
  return u.toString()
}

function feedAvailability(variant: ProductVariant): { status: FeedAvailability; date: string | null } {
  const a = resolveAvailability(variant)
  switch (a.status) {
    case 'in_stock':
    case 'low_stock':
      return { status: 'in_stock', date: null }
    case 'backorder':
      return { status: 'backorder', date: a.restock_eta ?? null }
    case 'preorder':
      return { status: 'preorder', date: a.preorder_release_at || null }
    default:
      return { status: 'out_of_stock', date: null }
  }
}

/** The items of one product (one per variant) and why the rest were left out. */
export function productFeedItems(product: Product, options: FeedOptions): { items: FeedItem[]; skipped: FeedSkipReason[] } {
  const items: FeedItem[] = []
  const skipped: FeedSkipReason[] = []
  const hidden = options.isHidden ?? internalProduct
  if (hidden(product)) return { items, skipped: product.variants.map(() => 'hidden' as const) }

  const base = options.siteUrl.replace(/\/+$/, '')
  const title = truncateText(squash(options.title ? options.title(product) : productTitle(product, { identifiers: true, locale: options.locale, keys: options.keys })), 150)
  const description = truncateText(squash(product.description ?? '') || fromHtml(product.description_html) || title, 5000)
  const brand = product.vendor?.trim() || options.brandFallback?.trim() || null
  const gallery = (product.images.length ? product.images : product.featured_image ? [product.featured_image] : []).map((i) => usableImage(i, base)).filter((u): u is string => !!u)
  const multi = product.variants.length > 1
  // MPN only from the part-number attribute: a merchant SKU is not a manufacturer part number.
  const pnRaw = product.attributes?.[options.keys?.partNumber ?? PART_TITLE_KEYS.partNumber]
  const partNumber = typeof pnRaw === 'string' || typeof pnRaw === 'number' ? String(pnRaw).trim() || null : null

  for (const variant of product.variants) {
    if (!brand) {
      skipped.push('no_brand')
      continue
    }
    if (!positive(variant.price)) {
      skipped.push('no_price')
      continue
    }
    const image = usableImage(variant.image, base) ?? gallery[0] ?? null
    if (!image) {
      skipped.push('no_image')
      continue
    }
    const availability = feedAvailability(variant)
    if (availability.status === 'out_of_stock' && !options.includeOutOfStock) {
      skipped.push('out_of_stock')
      continue
    }
    if (availability.status === 'preorder' && !availability.date) {
      skipped.push('no_date')
      continue
    }
    const link = variantLink(base, product, variant, options.productPath)
    if (!link) {
      skipped.push('no_link')
      continue
    }
    const compare = variant.compare_at_price
    const onSale = positive(compare) && compare.currency_code === variant.price.currency_code && Number(compare.amount) > Number(variant.price.amount)
    const gtin = validGtin(variant.barcode)
    const options_ = Object.fromEntries((variant.selected_options ?? []).filter((o) => o.name && o.value).map((o) => [o.name, o.value]))
    const sku = variant.sku?.trim()
    items.push({
      id: sku && sku.length <= 50 ? sku : variant.id,
      variant_id: variant.id,
      group_id: multi ? product.id : null,
      title: multi && variant.title && !/^(default title|predeterminado|default)$/i.test(variant.title) ? truncateText(`${title} - ${variant.title}`, 150) : title,
      description,
      link,
      image_link: image,
      additional_image_links: gallery.filter((u) => u !== image).slice(0, 10),
      availability: availability.status,
      availability_date: availability.date,
      price: onSale ? compare : variant.price,
      sale_price: onSale ? variant.price : null,
      brand,
      // MPN = the manufacturer part number OPS has (attribute), never guessed from a variant SKU.
      mpn: multi ? null : partNumber,
      gtin,
      // Google: `no` only when there is no GTIN AND no brand + MPN pair.
      identifier_exists: !!gtin || !!(brand && !multi && partNumber),
      condition: 'new',
      product_type: product.category?.title ?? product.product_type ?? null,
      variant_options: multi ? options_ : {},
    })
  }
  return { items, skipped }
}

export type FeedBuild = {
  items: FeedItem[]
  /** Products read from the catalog. */
  products: number
  skipped: Record<FeedSkipReason, number>
  /** `true` when `maxProducts` stopped the walk before the end of the catalog. */
  truncated: boolean
}

/**
 * Walks the catalog page by page (`list(after)` → a `Connection<Product>`, e.g.
 * `(after) => sf.products.list({ first: 100, after, sort: 'newest' })`) and returns every feed item.
 */
export async function collectFeed(list: (after: string | undefined) => Promise<Connection<Product>>, options: FeedOptions & { maxProducts?: number }): Promise<FeedBuild> {
  const max = options.maxProducts ?? 50_000
  const out: FeedBuild = {
    items: [],
    products: 0,
    skipped: { hidden: 0, no_price: 0, no_image: 0, out_of_stock: 0, no_brand: 0, no_date: 0, no_link: 0, duplicate_id: 0 },
    truncated: false,
  }
  const all: FeedItem[] = []
  let after: string | undefined
  do {
    const page = await list(after)
    for (const product of page.nodes) {
      if (out.products >= max) {
        out.truncated = true
        break
      }
      out.products++
      const { items, skipped } = productFeedItems(product, options)
      for (const r of skipped) out.skipped[r]++
      all.push(...items)
    }
    after = !out.truncated && page.page_info.has_next_page ? (page.page_info.end_cursor ?? undefined) : undefined
  } while (after)
  // A SKU shared by two variants would merge them in Merchant Center: EVERY occurrence goes with its OPS id, so the
  // ids do not depend on the order of the walk.
  const uses = new Map<string, number>()
  for (const item of all) uses.set(item.id, (uses.get(item.id) ?? 0) + 1)
  const seen = new Set<string>()
  for (const item of all) {
    const id = (uses.get(item.id) ?? 0) > 1 ? item.variant_id : item.id
    if (seen.has(id)) {
      out.skipped.duplicate_id++
      continue
    }
    seen.add(id)
    out.items.push(id === item.id ? item : { ...item, id })
  }
  return out
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

/** `494.71 MXN` (both channels): OPS's amount with the currency's decimals, no thousands separator, ISO 4217 code. */
export function feedPrice(money: Money): string {
  return `${feedAmount(money) ?? money.amount} ${money.currency_code.toUpperCase()}`
}

const xml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

export type GoogleFeedChannel = { title: string; link: string; description?: string }

const GOOGLE_AVAILABILITY: Record<FeedAvailability, string> = { in_stock: 'in_stock', out_of_stock: 'out_of_stock', preorder: 'preorder', backorder: 'backorder' }

function googleFields(item: FeedItem): [string, string][] {
  const f: [string, string][] = [
    ['id', item.id],
    ['title', item.title],
    ['description', item.description],
    ['link', item.link],
    ['image_link', item.image_link],
    ...item.additional_image_links.map((u): [string, string] => ['additional_image_link', u]),
    ['availability', GOOGLE_AVAILABILITY[item.availability]],
  ]
  if (item.availability_date) f.push(['availability_date', item.availability_date])
  f.push(['price', feedPrice(item.price)])
  if (item.sale_price) f.push(['sale_price', feedPrice(item.sale_price)])
  if (item.brand) f.push(['brand', item.brand])
  if (item.gtin) f.push(['gtin', item.gtin])
  if (item.mpn) f.push(['mpn', item.mpn])
  if (!item.identifier_exists) f.push(['identifier_exists', 'no'])
  f.push(['condition', item.condition])
  if (item.product_type) f.push(['product_type', item.product_type])
  if (item.group_id) f.push(['item_group_id', item.group_id])
  return f
}

/** Google Merchant Center product data feed: RSS 2.0 with the `g:` namespace. */
export function googleFeedXml(items: readonly FeedItem[], channel: GoogleFeedChannel): string {
  const body = items
    .map((item) => `<item>\n${googleFields(item).map(([k, v]) => `  <g:${k}>${xml(v)}</g:${k}>`).join('\n')}\n</item>`)
    .join('\n')
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n<channel>\n' +
    `<title>${xml(channel.title)}</title>\n<link>${xml(channel.link)}</link>\n<description>${xml(channel.description ?? channel.title)}</description>\n` +
    body +
    (body ? '\n' : '') +
    '</channel>\n</rss>\n'
  )
}

const GOOGLE_COLUMNS = ['id', 'title', 'description', 'link', 'image_link', 'additional_image_link', 'availability', 'availability_date', 'price', 'sale_price', 'brand', 'gtin', 'mpn', 'identifier_exists', 'condition', 'product_type', 'item_group_id'] as const

const tsvCell = (s: string) => s.replace(/[\t\r\n]+/g, ' ')

/** The same Google feed as tab-separated text (header + one row per item; several images comma-separated). */
export function googleFeedTsv(items: readonly FeedItem[]): string {
  const rows = items.map((item) => {
    const map = new Map<string, string[]>()
    for (const [k, v] of googleFields(item)) map.set(k, [...(map.get(k) ?? []), v])
    return GOOGLE_COLUMNS.map((c) => tsvCell((map.get(c) ?? []).join(','))).join('\t')
  })
  return [GOOGLE_COLUMNS.join('\t'), ...rows].join('\n') + '\n'
}

export type OpenAiFeedSeller = {
  /** `seller_name`: required on every row. */
  name: string
  url?: string | null
  /** Public pages; only sent when the store has them. `privacy_policy` and `tos` are required for checkout. */
  return_policy_url?: string | null
  privacy_policy_url?: string | null
  tos_url?: string | null
  /** Days to return (from OPS `shop.policies.returns_days`); sent with `accepts_returns=true` only when known. */
  return_days?: number | null
}

const OPENAI_AVAILABILITY: Record<FeedAvailability, string> = { in_stock: 'in_stock', out_of_stock: 'out_of_stock', preorder: 'pre_order', backorder: 'backorder' }

/** One OpenAI Product Feed Spec row (discovery fields; checkout stays off). */
export function openAiFeedRow(item: FeedItem, seller: OpenAiFeedSeller): Record<string, unknown> {
  const row: Record<string, unknown> = {
    item_id: item.id,
    title: item.title,
    description: item.description,
    url: item.link,
    brand: item.brand,
    seller_name: seller.name,
    image_url: item.image_link,
    availability: OPENAI_AVAILABILITY[item.availability],
    price: feedPrice(item.price),
    condition: item.condition,
    is_eligible_search: true,
  }
  if (item.additional_image_links.length) row.additional_image_urls = item.additional_image_links
  if (item.sale_price) row.sale_price = feedPrice(item.sale_price)
  if (item.gtin) row.gtin = item.gtin
  if (item.mpn) row.mpn = item.mpn
  if (item.product_type) row.product_category = item.product_type
  if (item.group_id) {
    row.group_id = item.group_id
    // `variant_dict` needs non-empty keys and values; without options the row is only grouped.
    const dict = Object.fromEntries(Object.entries(item.variant_options).filter(([k, v]) => k.trim() && v.trim()))
    if (Object.keys(dict).length) {
      row.listing_has_variations = true
      row.variant_dict = dict
    }
  }
  if (seller.url) row.seller_url = seller.url
  if (seller.return_policy_url) row.return_policy = seller.return_policy_url
  if (typeof seller.return_days === 'number' && seller.return_days > 0) {
    row.accepts_returns = true
    row.return_deadline_in_days = Math.floor(seller.return_days)
  }
  if (seller.privacy_policy_url) row.seller_privacy_policy = seller.privacy_policy_url
  if (seller.tos_url) row.seller_tos = seller.tos_url
  return row
}

/** OpenAI / ChatGPT Merchants feed as JSON Lines (one product per line, UTF-8). */
export function openAiFeedJsonl(items: readonly FeedItem[], seller: OpenAiFeedSeller): string {
  return items.map((item) => JSON.stringify(openAiFeedRow(item, seller))).join('\n') + (items.length ? '\n' : '')
}

// ---------------------------------------------------------------------------
// robots.txt and site verification
// ---------------------------------------------------------------------------

/** Search, AI-answer and shopping crawlers allowed explicitly (a CDN default must not block them). */
export const SEARCH_AGENTS: string[] = [...WEB_SEARCH_AGENTS, ...AI_SEARCH_AGENTS, ...AI_USER_AGENTS]
/** Crawlers that collect content to TRAIN models (not search): blocked by default; the owner may allow them (`training`). */
export const TRAINING_AGENTS: string[] = [...AI_TRAINING_AGENTS]

export type RobotsOptions = {
  /** Paths no crawler should index (cart, checkout, account, search, filtered listings). */
  disallow?: readonly string[]
  /** Absolute sitemap / feed URLs. */
  sitemaps?: readonly string[]
  /** Agents named explicitly in the open group (default `SEARCH_AGENTS`). */
  allowAgents?: readonly string[]
  /** Agents denied everything (default `TRAINING_AGENTS`; `[]` to block none). */
  blockAgents?: readonly string[]
  /** Per-crawler policy (training allow/block and per-agent overrides). Used when `allowAgents`/`blockAgents` are not given. */
  policy?: CrawlerPolicy
}

/**
 * `robots.txt`: one group shared by the named search/AI-answer agents and `*` (same rules: allow all but `disallow`),
 * then one group that denies the training crawlers. A crawler obeys the most specific group that names it, so the
 * search agents get the same `Disallow` lines as everyone else.
 */
export function robotsTxt(options: RobotsOptions = {}): string {
  const groups = crawlerGroups(options.policy)
  const allow = [...(options.allowAgents ?? groups.allow)]
  const block = (options.blockAgents ?? groups.block).filter((a) => !allow.some((b) => b.toLowerCase() === a.toLowerCase()))
  const lines = [...allow.map((a) => `User-agent: ${a}`), 'User-agent: *', 'Allow: /', ...(options.disallow ?? []).map((p) => `Disallow: ${p}`), '']
  if (block.length) lines.push(...block.map((a) => `User-agent: ${a}`), 'Disallow: /', '')
  for (const s of options.sitemaps ?? []) lines.push(`Sitemap: ${s}`)
  return lines.join('\n').replace(/\n*$/, '\n')
}

/**
 * Site-verification tokens from configuration (comma or space separated), only well-formed ones (letters, digits,
 * `-`, `_`): never a value that could break out of the `<meta content>`.
 */
export function verificationTokens(raw: string | null | undefined): string[] {
  return String(raw ?? '')
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => /^[A-Za-z0-9_-]{8,128}$/.test(t))
}

export * from './seo-kit.js'

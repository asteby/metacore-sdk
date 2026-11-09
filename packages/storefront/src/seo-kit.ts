/**
 * SEO kit shared by every storefront: sitemaps (hreflang + images), crawler policy, `llms.txt`, IndexNow and GA4
 * e-commerce events. Pure functions (no I/O except `submitIndexNow`, which takes the `fetch` to use): the store walks
 * its catalog with its own client and serves the result on its own domain. Nothing here invents data: whatever a
 * builder does not receive is left out.
 */
import type { Money, Product, ProductVariant } from './types.js'

// ---------------------------------------------------------------------------
// Site config (one place for domain, markets and languages)
// ---------------------------------------------------------------------------

export type SeoMarket = { code: string; locale: string; currency?: string }
export type SeoSiteConfig = {
  /** Canonical origin, `https://example.com` (no trailing slash, no `www.`). */
  origin: string
  markets: readonly SeoMarket[]
}

/**
 * Canonical origin from configuration: `configured` when it is https (or http on localhost), without `www.` and
 * trailing slash; otherwise `fallback`. Never derived from the request Host.
 */
export function canonicalOrigin(configured: string | null | undefined, fallback: string): string {
  const raw = configured?.trim()
  if (!raw) return fallback
  try {
    const u = new URL(raw)
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname) || u.hostname.endsWith('.localhost')
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return fallback
    return `${u.protocol}//${u.host.replace(/^www\./i, '')}`
  } catch {
    return fallback
  }
}

// ---------------------------------------------------------------------------
// Sitemaps
// ---------------------------------------------------------------------------

/** Protocol limit: 50 000 URLs per sitemap. */
export const SITEMAP_MAX_URLS = 50_000

export type SitemapAlternate = { hrefLang: string; href: string }
export type SitemapEntry = {
  loc: string
  /** `YYYY-MM-DD` or a full date-time (cut to the day). */
  lastmod?: string | null
  /** Absolute image URLs (≤ 1000 per page by protocol; 10 are written). */
  images?: readonly string[]
}

export function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)
}

/** `urlset` with optional hreflang alternates (`xhtml:link`) and image entries; never more than 50 000 URLs. */
export function renderSitemap(entries: readonly SitemapEntry[], options: { alternatesFor?: (loc: string) => readonly SitemapAlternate[]; isImage?: (url: string) => boolean } = {}): string {
  const isImage = options.isImage ?? ((u: string) => !/\.svg(\?|$)/i.test(u))
  const rows = entries.slice(0, SITEMAP_MAX_URLS).map((e) => {
    const alternates = (options.alternatesFor?.(e.loc) ?? []).map((a) => `<xhtml:link rel="alternate" hreflang="${escapeXml(a.hrefLang)}" href="${escapeXml(a.href)}"/>`).join('')
    const images = (e.images ?? [])
      .filter(isImage)
      .slice(0, 10)
      .map((i) => `<image:image><image:loc>${escapeXml(i)}</image:loc></image:image>`)
      .join('')
    const lastmod = e.lastmod && /^\d{4}-\d{2}-\d{2}/.test(e.lastmod) ? `<lastmod>${escapeXml(e.lastmod.slice(0, 10))}</lastmod>` : ''
    return `  <url><loc>${escapeXml(e.loc)}</loc>${lastmod}${alternates}${images}</url>`
  })
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
    rows.join('\n') +
    '\n</urlset>\n'
  )
}

/** `sitemapindex` pointing at one sitemap per market (or any list of absolute URLs). */
export function renderSitemapIndex(locs: readonly string[]): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + locs.map((l) => `  <sitemap><loc>${escapeXml(l)}</loc></sitemap>`).join('\n') + '\n</sitemapindex>\n'
}

// ---------------------------------------------------------------------------
// Crawler policy (search vs. AI assistants vs. training)
// ---------------------------------------------------------------------------

/** Classic search engines and shopping crawlers. */
export const WEB_SEARCH_AGENTS = ['Googlebot', 'Storebot-Google', 'Googlebot-Image', 'Bingbot', 'Applebot'] as const
/** AI SEARCH / answer engines: they index and cite pages (ChatGPT search, Perplexity, Claude search, Copilot via Bing, DuckDuckGo). */
export const AI_SEARCH_AGENTS = ['OAI-SearchBot', 'PerplexityBot', 'Claude-SearchBot', 'DuckAssistBot'] as const
/** Agents that fetch a page because a person asked an assistant about it (not crawlers). */
export const AI_USER_AGENTS = ['ChatGPT-User', 'Perplexity-User', 'Claude-User'] as const
/**
 * Crawlers that collect content to TRAIN models. `Google-Extended` is a robots token (not a crawler): it governs use for
 * Gemini training/grounding and does NOT affect Google Search or AI Overviews (those follow `Googlebot`).
 */
export const AI_TRAINING_AGENTS = ['GPTBot', 'Google-Extended', 'CCBot', 'ClaudeBot', 'anthropic-ai', 'Applebot-Extended', 'Bytespider', 'meta-externalagent'] as const

export type CrawlerPolicy = {
  /** Training crawlers: `block` (default, owner may change it) or `allow`. */
  training?: 'block' | 'allow'
  /** Per-agent override, case-insensitive: `{ GPTBot: 'allow', CCBot: 'block' }`. Wins over `training`. */
  agents?: Record<string, 'allow' | 'block'>
}

/** Agents to name as allowed and agents to deny, from a policy. Search/answer/user agents are always allowed unless overridden. */
export function crawlerGroups(policy: CrawlerPolicy = {}): { allow: string[]; block: string[] } {
  const override = new Map(Object.entries(policy.agents ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
  const decide = (agent: string, base: 'allow' | 'block') => override.get(agent.toLowerCase()) ?? base
  const allow: string[] = []
  const block: string[] = []
  const place = (agents: readonly string[], base: 'allow' | 'block') => {
    for (const a of agents) (decide(a, base) === 'allow' ? allow : block).push(a)
  }
  place([...WEB_SEARCH_AGENTS, ...AI_SEARCH_AGENTS, ...AI_USER_AGENTS], 'allow')
  place(AI_TRAINING_AGENTS, policy.training === 'allow' ? 'allow' : 'block')
  for (const extra of override.keys()) {
    const known = [...WEB_SEARCH_AGENTS, ...AI_SEARCH_AGENTS, ...AI_USER_AGENTS, ...AI_TRAINING_AGENTS].some((a) => a.toLowerCase() === extra)
    if (!known) (override.get(extra) === 'allow' ? allow : block).push(Object.keys(policy.agents ?? {}).find((k) => k.toLowerCase() === extra)!)
  }
  return { allow, block }
}

// ---------------------------------------------------------------------------
// Operational switches read from the environment (shared by every shop so none copies them)
// ---------------------------------------------------------------------------

const OFF = /^(off|false|0|no)$/i

/**
 * Site-wide indexing switch. Indexed by default; `SEO_INDEXING=off` closes the site by configuration (staging, previews):
 * the shop answers `CLOSED_ROBOTS_TXT`, publishes no sitemaps/llms.txt and sets `CLOSED_X_ROBOTS` on every response.
 */
export function indexingEnabled(env: Record<string, string | undefined> = {}): boolean {
  return !OFF.test((env.SEO_INDEXING ?? '').trim())
}
export const CLOSED_ROBOTS_TXT = 'User-agent: *\nDisallow: /\n'
export const CLOSED_X_ROBOTS = 'noindex, nofollow'

/**
 * Crawler policy from configuration: `AI_TRAINING_CRAWLERS=allow|block` and
 * `CRAWLER_OVERRIDES="GPTBot=allow,CCBot=block"` (per agent; wins over the first). `defaults.training` is the shop's
 * decision when the variable is absent (SDK default: `block`).
 */
export function crawlerPolicyFromEnv(env: Record<string, string | undefined> = {}, defaults: { training?: 'allow' | 'block' } = {}): CrawlerPolicy {
  const agents: Record<string, 'allow' | 'block'> = {}
  for (const part of (env.CRAWLER_OVERRIDES ?? '').split(',')) {
    const [name, value] = part.split('=').map((s) => s.trim())
    if (name && /^[A-Za-z0-9._-]{2,64}$/.test(name) && (value === 'allow' || value === 'block')) agents[name] = value
  }
  const raw = (env.AI_TRAINING_CRAWLERS ?? '').trim().toLowerCase()
  const training = raw === 'allow' || raw === 'block' ? raw : (defaults.training ?? 'block')
  return { training, agents }
}

/** Query parameters that change a listing (filters, order, pagination, search). Campaign ones (utm_*, gclid) do not. */
export const LISTING_PARAMS: readonly string[] = ['orden', 'tras', 'q', 'disponible', 'precio-min', 'precio-max']

/**
 * True when the URL asks for a listing different from the clean one (a `f.*` filter or any of `params`, with a value):
 * that view gets `noindex` and a canonical to the clean listing. Campaign parameters never make it "filtered".
 */
export function isFilteredListingUrl(url: URL | string, params: readonly string[] = LISTING_PARAMS): boolean {
  const { searchParams } = typeof url === 'string' ? new URL(url) : url
  for (const [key, value] of searchParams) if ((key.startsWith('f.') || params.includes(key)) && value !== '') return true
  return false
}

/**
 * Response for the IndexNow key file: `GET|HEAD /<key>.txt` -> `text/plain` with the key, else `null` (let the request
 * continue). Use it from a middleware, not a loader: a loader's raw Response would be wrapped in the shop's HTML document
 * and the verifier would not find the key.
 */
export function indexNowKeyResponse(request: { method: string; url: string }, key: string | null | undefined): Response | null {
  const k = key?.trim()
  if (!k || !isIndexNowKey(k) || (request.method !== 'GET' && request.method !== 'HEAD')) return null
  if (new URL(request.url).pathname !== `/${k}.txt`) return null
  return new Response(request.method === 'HEAD' ? null : k, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}

// ---------------------------------------------------------------------------
// llms.txt / llms-full.txt (https://llmstxt.org)
// ---------------------------------------------------------------------------

export type LlmsLink = { title: string; url: string; note?: string | null }
export type LlmsSection = { title: string; links: readonly LlmsLink[] }
export type LlmsInput = {
  name: string
  /** One-paragraph answer-first summary of the brand (real, approved copy only). */
  summary: string
  /** Free-text blocks before the link lists (e.g. brand facts), as plain Markdown. */
  details?: readonly string[]
  sections: readonly LlmsSection[]
  /** Q&A rendered in the full version only (real FAQ). */
  faq?: readonly { question: string; answer: string }[]
  contact?: { email?: string | null; phone?: string | null; url?: string | null }
  /** Policies as plain statements taken from the store (shipping, returns). */
  policies?: readonly { title: string; text: string }[]
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()
const link = (l: LlmsLink) => `- [${oneLine(l.title)}](${l.url})${l.note ? `: ${oneLine(l.note)}` : ''}`

/** `/llms.txt`: H1 name, blockquote summary, details and link sections (the llms.txt convention). */
export function llmsTxt(input: LlmsInput): string {
  const out = [`# ${oneLine(input.name)}`, '', `> ${oneLine(input.summary)}`, '']
  for (const d of input.details ?? []) out.push(d.trim(), '')
  for (const s of input.sections) {
    if (!s.links.length) continue
    out.push(`## ${oneLine(s.title)}`, '', ...s.links.map(link), '')
  }
  return out.join('\n').replace(/\n+$/, '\n')
}

/** `/llms-full.txt`: the same plus policies, FAQ and contact inline, so a model needs no further fetch. */
export function llmsFullTxt(input: LlmsInput): string {
  const out = [llmsTxt(input).replace(/\n+$/, ''), '']
  if (input.policies?.length) {
    out.push('## Policies', '')
    for (const p of input.policies) out.push(`### ${oneLine(p.title)}`, '', p.text.trim(), '')
  }
  if (input.faq?.length) {
    out.push('## FAQ', '')
    for (const f of input.faq) out.push(`### ${oneLine(f.question)}`, '', f.answer.trim(), '')
  }
  const c = input.contact
  if (c && (c.email || c.phone || c.url)) {
    out.push('## Contact', '')
    if (c.email) out.push(`- Email: ${c.email}`)
    if (c.phone) out.push(`- Phone: ${c.phone}`)
    if (c.url) out.push(`- Web: ${c.url}`)
    out.push('')
  }
  return out.join('\n').replace(/\n+$/, '\n')
}

// ---------------------------------------------------------------------------
// IndexNow (https://www.indexnow.org/documentation)
// ---------------------------------------------------------------------------

/** A valid IndexNow key: 8–128 characters of letters, digits and dashes. */
export function isIndexNowKey(key: string | null | undefined): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9-]{8,128}$/.test(key)
}

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/IndexNow'
export const INDEXNOW_MAX_URLS = 10_000

export type IndexNowResult = { ok: boolean; status: number; submitted: number }

/**
 * Tells IndexNow (Bing, Yandex, Seznam, Naver…) about new/updated URLs. Only URLs on `host` are sent, deduplicated, in
 * batches of ≤10 000; the key file must be served at `keyLocation` (default `https://<host>/<key>.txt`). 200/202 = ok.
 */
export async function submitIndexNow(options: { host: string; key: string; urls: readonly string[]; keyLocation?: string; fetch?: typeof fetch; endpoint?: string }): Promise<IndexNowResult[]> {
  if (!isIndexNowKey(options.key)) throw new Error('invalid IndexNow key')
  const f = options.fetch ?? fetch
  const host = options.host.toLowerCase()
  const urls = [...new Set(options.urls)].filter((u) => {
    try {
      return new URL(u).host.toLowerCase() === host
    } catch {
      return false
    }
  })
  const keyLocation = options.keyLocation ?? `https://${host}/${options.key}.txt`
  const results: IndexNowResult[] = []
  for (let i = 0; i < urls.length; i += INDEXNOW_MAX_URLS) {
    const batch = urls.slice(i, i + INDEXNOW_MAX_URLS)
    const res = await f(options.endpoint ?? INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key: options.key, keyLocation, urlList: batch }),
    })
    results.push({ ok: res.status === 200 || res.status === 202, status: res.status, submitted: batch.length })
  }
  return results
}

// ---------------------------------------------------------------------------
// GA4 e-commerce events (with a market dimension)
// ---------------------------------------------------------------------------

export type Ga4Item = { item_id: string; item_name: string; item_brand?: string; item_category?: string; item_variant?: string; price?: number; quantity?: number }
export type Ga4Event = { event: 'view_item' | 'add_to_cart' | 'begin_checkout' | 'purchase'; params: Record<string, unknown> }

const num = (m: Money | null | undefined) => (m && Number.isFinite(Number(m.amount)) ? Number(m.amount) : undefined)

/** GA4 item from a product (+ variant). Price is the one OPS sent; nothing is computed. */
export function ga4Item(product: Pick<Product, 'id' | 'title' | 'vendor' | 'category'>, variant?: Pick<ProductVariant, 'id' | 'sku' | 'title' | 'price'> | null, quantity = 1): Ga4Item {
  const item: Ga4Item = { item_id: variant?.sku || variant?.id || product.id, item_name: product.title, quantity }
  if (product.vendor) item.item_brand = product.vendor
  if (product.category?.title) item.item_category = product.category.title
  if (variant?.title && variant.title !== 'Default Title') item.item_variant = variant.title
  const price = num(variant?.price)
  if (price !== undefined) item.price = price
  return item
}

function ecommerce(event: Ga4Event['event'], items: readonly Ga4Item[], currency: string, market: string, extra: Record<string, unknown> = {}): Ga4Event {
  const value = items.reduce((sum, i) => sum + (i.price ?? 0) * (i.quantity ?? 1), 0)
  return { event, params: { currency, value: Math.round(value * 100) / 100, items: [...items], market, ...extra } }
}

export const ga4ViewItem = (item: Ga4Item, currency: string, market: string) => ecommerce('view_item', [item], currency, market)
export const ga4AddToCart = (item: Ga4Item, currency: string, market: string) => ecommerce('add_to_cart', [item], currency, market)
export const ga4BeginCheckout = (items: readonly Ga4Item[], currency: string, market: string, total?: Money | null) => {
  const e = ecommerce('begin_checkout', items, currency, market)
  const v = num(total)
  if (v !== undefined) e.params.value = v
  return e
}
/** `purchase`: needs the real order number (`transaction_id`) and the totals OPS charged. */
export const ga4Purchase = (o: { transactionId: string; items: readonly Ga4Item[]; total: Money; tax?: Money | null; shipping?: Money | null; market: string }) => {
  const e = ecommerce('purchase', o.items, o.total.currency_code, o.market, { transaction_id: o.transactionId })
  e.params.value = num(o.total) ?? e.params.value
  const tax = num(o.tax)
  const shipping = num(o.shipping)
  if (tax !== undefined) e.params.tax = tax
  if (shipping !== undefined) e.params.shipping = shipping
  return e
}

/** `gtag` bootstrap for a measurement id (`G-XXXXXXXXXX`); `''` when the id is missing or malformed. Add the loader `<script async src=…gtag/js?id=…>` yourself. */
export function ga4Bootstrap(measurementId: string | null | undefined, market?: string): string {
  if (!measurementId || !/^G-[A-Z0-9]{6,14}$/.test(measurementId)) return ''
  const cfg = market ? `{ market: ${JSON.stringify(market)} }` : '{}'
  return `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(measurementId)},${cfg});`
}

/** Referrer hosts of AI assistants, to segment their traffic in analytics (also `utm_source=chatgpt.com`). */
export const AI_REFERRER_HOSTS = ['chatgpt.com', 'chat.openai.com', 'perplexity.ai', 'gemini.google.com', 'copilot.microsoft.com', 'claude.ai', 'you.com', 'duckduckgo.com/chat'] as const
export function aiReferrer(referrer: string | null | undefined): string | null {
  if (!referrer) return null
  try {
    const u = new URL(referrer)
    const hit = AI_REFERRER_HOSTS.find((h) => (u.host + u.pathname).toLowerCase().startsWith(h) || u.host.toLowerCase() === h || u.host.toLowerCase().endsWith(`.${h}`))
    return hit ?? null
  } catch {
    return null
  }
}

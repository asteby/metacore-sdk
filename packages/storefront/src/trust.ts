// Confianza y transparencia de la tienda: los datos que la ley y Merchant Center
// piden ver (identidad del negocio, garantía, devoluciones, privacidad, formas
// de pago) salen SOLO de OPS (`Shop.legal`, `Shop.policies`,
// `GET /storefront/payment-methods`). Regla única para todas las tiendas: sin
// dato no hay afirmación. Un texto que cita un dato no configurado no se
// muestra (ni un «[por completar]» al público); una página legal que sigue en
// borrador no se sirve.
import { formatMoney } from './money.js'
import type { Page, Product, Section, Shop, ShopLegal } from './types.js'

/** The `{{...}}` fields a page text may use. Any other `{{name}}` is left as is (not ours). */
export const SHOP_MERGE_FIELDS = [
  'shop.name',
  'shop.domain',
  'shop.email',
  'shop.phone',
  'shop.whatsapp',
  'shop.returns_days',
  'shop.free_shipping_min',
  'shop.currency',
  'shop.country',
  // Contract 1.30.0.
  'shop.warranty_months',
  'shop.legal_name',
  'shop.tax_id',
  'shop.fiscal_address',
  'shop.service_address',
  'shop.privacy_officer',
  'shop.privacy_email',
  /** «1 mes» / «6 meses»: the warranty term with its unit (singular-aware). */
  'shop.warranty_term',
] as const

export type ShopMergeField = (typeof SHOP_MERGE_FIELDS)[number]

export type ShopFieldValues = Record<ShopMergeField, string | null>

/**
 * Review markers of a legal draft (storefront_content templates): a text that still has one is not served. The first
 * is the current template notice, the second the one seeded before contract 1.30.0. Detection is tolerant: tags,
 * entities (`&nbsp;`), spacing, case and accents are ignored, and the prefix (`[BORRADOR`, `[REVISAR CON`) is enough.
 */
export const LEGAL_DRAFT_MARKERS = ['[BORRADOR: REVISAR CON ABOGADO]', '[REVISAR CON ASESOR LEGAL]'] as const

const FIELD_RE = /\{\{\s*([a-z0-9_.]+)\s*\}\}/g
/** Names of the `{{…}}` left after substitution (bounded: linear time on any input). */
const LEFTOVER_NAMES_RE = /\{\{([^{}]{0,80})\}\}/g
const PENDING_RE = /\{\{\s*completar/i
/**
 * The review notice, with or without brackets: «BORRADOR: REVISAR…» (current template) or «REVISAR CON (UN) ABOGADO /
 * ASESOR LEGAL» (older one). A bare «[borrador]» is not the notice.
 */
const DRAFT_RE = /\bBORRADOR\s*:\s*REVISAR\b|\bREVISAR\s+CON\s+(?:UN\s+)?(?:ABOGADO|ASESOR\s+LEGAL)\b/
/** An old-template blank: «[RAZÓN SOCIAL]», «[FECHA]», «[DOMICILIO COMPLETO]» (upper case, 4+ chars). Strict pages only. */
const BLANK_RE = /\[[A-Z0-9 ,./:;-]{4,}\]/

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", shy: '', lbrace: '{', rbrace: '}', lcub: '{', rcub: '}' }

function decodeEntity(whole: string, name: string): string {
  const n = name.toLowerCase()
  const code = n.startsWith('#x') ? Number.parseInt(n.slice(2), 16) : n.startsWith('#') ? Number.parseInt(n.slice(1), 10) : NaN
  if (n.startsWith('#')) return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
  return ENTITIES[n] ?? whole
}

/** Text as a reader sees it: no tags, entities decoded, no zero-width marks, spaces collapsed, upper case without accents. */
function readable(text: string): string {
  return text
    .replace(/<[^<>]*>/g, '')
    .replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi, decodeEntity)
    .replace(/[­​-‍⁠﻿]/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

/** Same as `readable` but keeping the case (blanks are told apart by being upper case). */
function plain(text: string): string {
  return text
    .replace(/<[^<>]*>/g, '')
    .replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi, decodeEntity)
    .replace(/[­​-‍⁠﻿]/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** Whether a text still has an old-template blank such as «[RAZÓN SOCIAL]» (used on strict, legal pages). */
export function hasTemplateBlank(text: string): boolean {
  return BLANK_RE.test(plain(text))
}

const SAFE_HREF = /^(?:https?:|mailto:|tel:|\/|#|\?|\.)/i
const HREF_RE = /\bhref\s*=\s*(?:(["'])(.*?)\1|([^\s>"']+))/gi

/** A link whose target is not http(s), mailto, tel or a site path (e.g. `javascript:` from a field value). */
function hasUnsafeHref(html: string): boolean {
  for (const m of html.matchAll(HREF_RE)) {
    const target = decodeHtmlAttr(m[2] ?? m[3] ?? '').replace(/[\u0000- ]/g, '')
    if (target && !SAFE_HREF.test(target)) return true
  }
  return false
}

function decodeHtmlAttr(v: string): string {
  return v.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi, decodeEntity)
}

/** Whether a text still carries a legal review notice (any spelling). */
export function hasLegalDraftNotice(text: string): boolean {
  return DRAFT_RE.test(readable(text))
}

const clean = (v: string | null | undefined): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const wholeNonNeg = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)

/** `Shop.legal` with every field present (`null` when the server is older or the merchant left it empty). */
export function shopLegal(shop: Pick<Shop, 'legal' | 'contact'>): ShopLegal {
  const l = shop.legal ?? null
  return {
    name: clean(l?.name),
    tax_id: clean(l?.tax_id),
    fiscal_address: clean(l?.fiscal_address),
    service_address: clean(l?.service_address),
    privacy_officer: clean(l?.privacy_officer),
    privacy_email: clean(l?.privacy_email) ?? clean(shop.contact?.email),
  }
}

/** Warranty term in months, from the shop policy only (the single source); `null` (also for 0) = claim none. */
export function shopWarrantyMonths(shop: Pick<Shop, 'policies'>): number | null {
  const v = wholeNonNeg(shop.policies?.warranty_months)
  return v && v > 0 ? v : null
}

/** Returns window in days from the shop policy; `null` (also for 0) = no returns policy to show. */
export function shopReturnsDays(shop: Pick<Shop, 'policies'>): number | null {
  const v = wholeNonNeg(shop.policies?.returns_days)
  return v && v > 0 ? v : null
}

/** Value of every merge field; `null` when the shop does not have it. */
export function shopFieldValues(shop: Shop): ShopFieldValues {
  const min = shop.policies?.free_shipping_min
  const legal = shopLegal(shop)
  const returns = shopReturnsDays(shop)
  const warranty = shopWarrantyMonths(shop)
  return {
    'shop.name': clean(shop.name),
    'shop.domain': clean(shop.domain),
    'shop.email': clean(shop.contact?.email),
    'shop.phone': clean(shop.contact?.phone),
    'shop.whatsapp': clean(shop.contact?.whatsapp),
    'shop.returns_days': returns != null ? String(returns) : null,
    'shop.free_shipping_min': min ? formatMoney(min, shop.locale || 'es-MX', { withoutTrailingZeros: true }) : null,
    'shop.currency': clean(shop.currency_code),
    'shop.country': clean(shop.country_code),
    'shop.warranty_months': warranty != null ? String(warranty) : null,
    'shop.legal_name': legal.name,
    'shop.tax_id': legal.tax_id,
    'shop.fiscal_address': legal.fiscal_address,
    'shop.service_address': legal.service_address,
    'shop.privacy_officer': legal.privacy_officer,
    'shop.privacy_email': legal.privacy_email,
    'shop.warranty_term': warranty != null ? `${warranty} ${warranty === 1 ? 'mes' : 'meses'}` : null,
  }
}

export type ResolvedText = {
  /** The text with the fields substituted, or `null` when it must not be shown (see the flags). */
  text: string | null
  /** Known fields it cites that the shop has not configured. */
  missing: ShopMergeField[]
  /** It still has a `{{completar: …}}` marker the merchant has to write. */
  pending: boolean
  /** It still has a legal review notice (`LEGAL_DRAFT_MARKERS`, any spelling). */
  draft: boolean
  /** It has a `{{…}}` that is not a known field (a typo, another system's placeholder): never shown. */
  unknown: string[]
  /** It has an old-template blank («[RAZÓN SOCIAL]»). Only blocks with `strict` (legal pages). */
  blank: boolean
  /** A field value turned a link into something other than http(s)/mailto/tel/a path (`javascript:`): never shown. */
  unsafe: boolean
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * Substitutes the fields of one text. Never invents and never leaks a placeholder: a text that cites a missing field,
 * keeps any `{{…}}` (unknown field, `{{completar…}}`) or a legal review notice — before OR after substitution, so a
 * value that itself carries a marker is caught too — resolves to `text: null`. With `html` the values are escaped;
 * without it they are inserted as plain text, so a caller must not render a non-HTML prop as HTML.
 */
export function resolveShopText(text: string, values: ShopFieldValues, { html = false, strict = false }: { html?: boolean; strict?: boolean } = {}): ResolvedText {
  const missing: ShopMergeField[] = []
  const out = text.includes('{{')
    ? text.replace(FIELD_RE, (whole, name: string) => {
        if (!Object.prototype.hasOwnProperty.call(values, name)) return whole
        const v = values[name as ShopMergeField]
        if (typeof v !== 'string') {
          if (!missing.includes(name as ShopMergeField)) missing.push(name as ShopMergeField)
          return whole
        }
        return html ? escapeHtml(v) : v
      })
    : text
  const draft = hasLegalDraftNotice(text) || hasLegalDraftNotice(out)
  const pending = PENDING_RE.test(text) || PENDING_RE.test(out)
  // Any `{{` left (an unknown field, a typo, an unclosed `{{shop.name}`, a `{{completar…}}` in any spelling) blocks the text.
  // Also as HTML entities (`&#123;&#123;`, `&lbrace;`): a renderer would decode them into a visible placeholder.
  const leftover = out.includes('{{') || out.replace(/<[^<>]*>/g, '').includes('{{') || (out.includes('&') && plain(out).includes('{{'))
  const unknown: string[] = []
  if (leftover) {
    for (const m of out.matchAll(LEFTOVER_NAMES_RE)) {
      const name = m[1]!.trim()
      if (!missing.includes(name as ShopMergeField) && !/^completar/i.test(name) && !unknown.includes(name) && unknown.length < 20) unknown.push(name)
    }
  }
  const blank = hasTemplateBlank(out)
  const unsafe = text.includes('{{') && hasUnsafeHref(out)
  const blocked = draft || pending || missing.length > 0 || leftover || unsafe || (strict && blank)
  return { text: blocked ? null : out, missing, pending, draft, unknown, blank, unsafe }
}

/** Props whose value is HTML (rich text): values are escaped when inserted. */
const HTML_PROPS = new Set(['content', 'html', 'body'])
const LOOKS_LIKE_HTML = /<\/?[a-z][a-z0-9]*(\s[^>]*)?>/i

/** A section or list entry dropped because one of its texts could not be shown. */
export type DroppedContent = {
  section: string
  /** Path of the dropped entry inside the section props (`items.0`, `rows.1.0`); absent when the whole section went. */
  path?: string
  /** Index of the dropped entry in its list (kept for convenience; `path` is unambiguous). */
  item?: number
  missing: ShopMergeField[]
  pending: boolean
  draft: boolean
  unknown: string[]
}

export type MergedSections = {
  /** Sections safe to show: every field substituted, every unshowable text removed with its section or list entry. */
  sections: Section[]
  /** What was removed and why (for a preview banner or a log; never shown to buyers). */
  dropped: DroppedContent[]
}

const DROP = Symbol('drop')
const MAX_DEPTH = 32
type Acc = { missing: Set<ShopMergeField>; pending: boolean; draft: boolean; unknown: Set<string> }
const newAcc = (): Acc => ({ missing: new Set(), pending: false, draft: false, unknown: new Set() })
const report = (section: string, a: Acc, path?: string, item?: number): DroppedContent => ({
  section,
  ...(path != null ? { path } : {}),
  ...(item != null ? { item } : {}),
  missing: [...a.missing],
  pending: a.pending,
  draft: a.draft,
  unknown: [...a.unknown],
})

function mergeValue(
  value: unknown,
  values: ShopFieldValues,
  html: boolean,
  acc: Acc,
  path: string,
  onItemDrop: (path: string, i: number, a: Acc) => void,
  inList = false,
  strict = false,
  depth = 0,
): unknown {
  // Props nested deeper than any real section are not content: drop rather than recurse without bound.
  if (depth > MAX_DEPTH) return DROP
  if (typeof value === 'string') {
    const r = resolveShopText(value, values, { html: html || LOOKS_LIKE_HTML.test(value), strict })
    if (r.text != null) return r.text
    r.missing.forEach((m) => acc.missing.add(m))
    r.unknown.forEach((u) => acc.unknown.add(u))
    acc.pending ||= r.pending
    acc.draft ||= r.draft
    return DROP
  }
  if (Array.isArray(value)) {
    // A list inside a list is a row (a table): a cell that cannot be shown takes the whole row with it (never a label
    // without its value).
    if (inList) {
      const row: unknown[] = []
      for (const v of value) {
        const merged = mergeValue(v, values, html, acc, path, onItemDrop, true, strict, depth + 1)
        if (merged === DROP) return DROP
        row.push(merged)
      }
      return row
    }
    const out: unknown[] = []
    value.forEach((v, i) => {
      // A list entry (FAQ answer, warranty card…) that cannot be shown goes away alone; the rest of the section stays.
      const itemAcc = newAcc()
      const at = path ? `${path}.${i}` : String(i)
      const merged = mergeValue(v, values, html, itemAcc, at, onItemDrop, true, strict, depth + 1)
      if (merged === DROP) {
        onItemDrop(at, i, itemAcc)
        // A draft notice anywhere taints the whole page, even inside a list.
        acc.draft ||= itemAcc.draft
      } else out.push(merged)
    })
    // A list that had entries and lost them all leaves an empty shell (a heading with nothing under it): drop it.
    if (value.length > 0 && out.length === 0) return DROP
    return out
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      const merged = mergeValue(v, values, HTML_PROPS.has(k), acc, path ? `${path}.${k}` : k, onItemDrop, false, strict, depth + 1)
      if (merged === DROP) return DROP
      // Own data property even for `__proto__`: a prop never changes the prototype of the output.
      Object.defineProperty(out, k, { value: merged, enumerable: true, writable: true, configurable: true })
    }
    return out
  }
  return value
}

/**
 * Resolves the fields in every prop of the sections (does not mutate the input). A list entry whose text cannot be
 * shown is removed from its list; a list left empty, or a section whose own text cannot be shown, removes the whole
 * section. Nothing reaches the buyer with a placeholder or a made-up value.
 */
export function mergeShopSections(sections: Section[], shop: Shop, { strict = false }: { strict?: boolean } = {}): MergedSections {
  const values = shopFieldValues(shop)
  const dropped: DroppedContent[] = []
  const out: Section[] = []
  for (const s of sections) {
    const acc = newAcc()
    const props = mergeValue(s.props, values, false, acc, '', (path, item, a) => dropped.push(report(s.id, a, path, item)), false, strict)
    if (props === DROP) {
      dropped.push(report(s.id, acc))
      continue
    }
    out.push({ ...s, props: props as Section['props'] })
  }
  return { sections: out, dropped }
}

/** Resolves a loose text (title, SEO description); `null` when it is empty or cannot be shown. */
export function mergeShopText(text: string | null | undefined, shop: Shop): string | null {
  if (!text) return null
  return resolveShopText(text, shopFieldValues(shop)).text
}

export type PublishableOptions = {
  /**
   * Legal page (privacy notice, terms, returns, warranty…): ANY dropped text — a missing field, a pending marker —
   * makes the whole page unpublishable, so an incomplete notice is never served with a hole in it.
   */
  strict?: boolean
}

/**
 * Whether a content page can be served to buyers: it has something left to show after `mergeShopSections`, nothing
 * anywhere in it is a legal draft and, with `strict` (legal pages), nothing was dropped at all.
 */
export function pagePublishable(merged: MergedSections, { strict = false }: PublishableOptions = {}): boolean {
  if (merged.sections.length === 0) return false
  if (merged.dropped.some((d) => d.draft)) return false
  return !strict || merged.dropped.length === 0
}

/**
 * Legal / policy pages, published only when complete (`strict`): the storefront_content templates and the usual
 * handles of a hand-made one. Anything else (FAQ, about, shipping info…) keeps the per-entry rule.
 */
const LEGAL_HANDLES = new Set([
  'aviso-de-privacidad', 'privacidad', 'privacy', 'privacy-policy', 'datos-personales', 'derechos-arco',
  'terminos-y-condiciones', 'terminos', 'tyc', 'terms', 'terms-of-service',
  'politica-de-devoluciones', 'devoluciones', 'returns', 'refund-policy',
  'politica-de-garantia', 'garantia', 'warranty',
  'politica-de-envios', 'politica-de-cookies', 'cookies', 'aviso-legal', 'legal',
])

/** Words that make a hand-made handle legal (`aviso-privacidad`, `nuestros-terminos`, `politica-garantia`…). */
const LEGAL_WORDS = /(?:^|-)(?:privacidad|privacy|terminos|condiciones|terms|devoluciones|reembolsos|refunds?|garantia|warranty|cookies|arco|legal)(?:-|$)/

/**
 * Whether a page handle is a legal or policy page (published only when complete): the known handles, any `politica-*`
 * or `aviso-*`, or a handle with a legal word as a whole segment. Errs on the safe side: a strict page only needs to
 * be complete to be served.
 */
export function isLegalHandle(handle: string): boolean {
  const h = handle.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  return LEGAL_HANDLES.has(h) || h.startsWith('politica-') || h.startsWith('aviso-') || LEGAL_WORDS.test(h)
}

export type MergedPage<P extends Pick<Page, 'handle' | 'title' | 'seo' | 'sections'>> = {
  page: P
  publishable: boolean
  dropped: DroppedContent[]
}

/**
 * The whole page in one call: sections, title and SEO resolved; `publishable` is `pagePublishable` (strict for legal
 * handles, see `isLegalHandle`) and also false when the title itself carries a draft notice or a placeholder. A SEO
 * title or description that cannot be shown only becomes `null` (the page falls back to its title); it never blocks.
 */
export function mergeShopPage<P extends Pick<Page, 'handle' | 'title' | 'seo' | 'sections'>>(page: P, shop: Shop, options: PublishableOptions = {}): MergedPage<P> {
  const strict = options.strict ?? isLegalHandle(page.handle)
  // Legal pages also refuse old-template blanks («[RAZÓN SOCIAL]», «[FECHA]»…).
  const merged = mergeShopSections(page.sections, shop, { strict })
  const values = shopFieldValues(shop)
  const loose = (t: string | null | undefined) => (t ? resolveShopText(t, values, { strict }).text : null)
  const title = loose(page.title)
  const titleBad = !!page.title && title == null
  return {
    page: {
      ...page,
      title: title ?? shop.name,
      seo: { ...page.seo, title: loose(page.seo?.title), description: loose(page.seo?.description) },
      sections: merged.sections,
    },
    publishable: !titleBad && pagePublishable(merged, { strict }),
    dropped: merged.dropped,
  }
}

// ---------------------------------------------------------------------------
// Business identity (contact page, footer)
// ---------------------------------------------------------------------------

export type BusinessIdentityRow = { key: 'legal_name' | 'tax_id' | 'fiscal_address' | 'service_address' | 'phone' | 'email' | 'whatsapp'; value: string }

/**
 * The identity rows the shop really has, in display order (legal name, tax id, registered and service address,
 * phone, email, WhatsApp). Empty fields are left out; nothing is guessed.
 */
export function businessIdentity(shop: Pick<Shop, 'legal' | 'contact'>): BusinessIdentityRow[] {
  const l = shopLegal(shop)
  const rows: [BusinessIdentityRow['key'], string | null][] = [
    ['legal_name', l.name],
    ['tax_id', l.tax_id],
    ['fiscal_address', l.fiscal_address],
    ['service_address', l.service_address !== l.fiscal_address ? l.service_address : null],
    ['phone', clean(shop.contact?.phone)],
    ['email', clean(shop.contact?.email)],
    ['whatsapp', clean(shop.contact?.whatsapp)],
  ]
  return rows.filter((r): r is [BusinessIdentityRow['key'], string] => r[1] != null).map(([key, value]) => ({ key, value }))
}

/**
 * A contact / identity page needs the legal name, the tax id, the registered address and one contact channel (what
 * Merchant Center and Profeco look for); with any of them missing it is not published.
 */
export function identityComplete(shop: Pick<Shop, 'legal' | 'contact'>): boolean {
  const l = shopLegal(shop)
  return !!(l.name && l.tax_id && l.fiscal_address && (clean(shop.contact?.email) || clean(shop.contact?.phone)))
}

// ---------------------------------------------------------------------------
// Internal products (QA)
// ---------------------------------------------------------------------------

const INTERNAL_TAGS = new Set(['qa', 'interno'])
const TEST_SKU = /^TEST-/i

type ProductLike = Pick<Product, 'tags'> & { variants?: readonly { sku?: string | null }[] | null }

/**
 * Internal products (payment / shipping QA): tag `qa` or `interno`, or every variant with a `TEST-` SKU. They can be
 * bought by their direct URL but must not reach listings, search, sitemaps, feeds nor structured data.
 */
export function isInternalProduct(p: ProductLike | null | undefined): boolean {
  if (!p) return false
  if ((p.tags ?? []).some((t) => INTERNAL_TAGS.has(t.trim().toLowerCase()))) return true
  const skus = (p.variants ?? []).map((v) => v.sku ?? '').filter(Boolean)
  return skus.length > 0 && skus.every((s) => TEST_SKU.test(s))
}

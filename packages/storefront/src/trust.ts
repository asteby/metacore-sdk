// Confianza y transparencia de la tienda: los datos que la ley y Merchant Center
// piden ver (identidad del negocio, garantía, devoluciones, privacidad, formas
// de pago) salen SOLO de OPS (`Shop.legal`, `Shop.policies`,
// `GET /storefront/payment-methods`). Regla única para todas las tiendas: sin
// dato no hay afirmación. Un texto que cita un dato no configurado no se
// muestra (ni un «[por completar]» al público); una página legal que sigue en
// borrador no se sirve.
import { formatMoney } from './money.js'
import type { Product, Section, Shop, ShopLegal } from './types.js'

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
] as const

export type ShopMergeField = (typeof SHOP_MERGE_FIELDS)[number]

export type ShopFieldValues = Record<ShopMergeField, string | null>

/**
 * Review markers of a legal draft (storefront_content templates): a text that still has one is not served. The first
 * is the current template notice, the second the one seeded before contract 1.30.0.
 */
export const LEGAL_DRAFT_MARKERS = ['[BORRADOR: REVISAR CON ABOGADO]', '[REVISAR CON ASESOR LEGAL]'] as const

const FIELD_RE = /\{\{\s*([a-z0-9_.]+)\s*\}\}/g
const PENDING_RE = /\{\{\s*completar:[^{}]*\}\}/i

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

/** Warranty term in months, from the shop policy only (the single source); `null` = claim none. */
export function shopWarrantyMonths(shop: Pick<Shop, 'policies'>): number | null {
  return wholeNonNeg(shop.policies?.warranty_months)
}

/** Returns window in days from the shop policy; `null` = no returns policy to show. */
export function shopReturnsDays(shop: Pick<Shop, 'policies'>): number | null {
  return wholeNonNeg(shop.policies?.returns_days)
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
    'shop.warranty_months': warranty != null && warranty > 0 ? String(warranty) : null,
    'shop.legal_name': legal.name,
    'shop.tax_id': legal.tax_id,
    'shop.fiscal_address': legal.fiscal_address,
    'shop.service_address': legal.service_address,
    'shop.privacy_officer': legal.privacy_officer,
    'shop.privacy_email': legal.privacy_email,
  }
}

export type ResolvedText = {
  /** The text with the fields substituted, or `null` when it must not be shown (see `missing`, `pending`, `draft`). */
  text: string | null
  /** Fields it cites that the shop has not configured. */
  missing: ShopMergeField[]
  /** It still has a `{{completar: …}}` marker the merchant has to write. */
  pending: boolean
  /** It still has a legal review notice (`LEGAL_DRAFT_MARKERS`). */
  draft: boolean
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * Substitutes the fields of one text. Never invents: a text that cites a missing field, keeps a `{{completar: …}}`
 * marker or a legal review notice resolves to `text: null`. With `html` the values are escaped.
 */
export function resolveShopText(text: string, values: ShopFieldValues, { html = false }: { html?: boolean } = {}): ResolvedText {
  const draft = LEGAL_DRAFT_MARKERS.some((m) => text.includes(m))
  const pending = PENDING_RE.test(text)
  const missing: ShopMergeField[] = []
  const out = text.includes('{{')
    ? text.replace(FIELD_RE, (whole, name: string) => {
        if (!(name in values)) return whole
        const v = values[name as ShopMergeField]
        if (v == null) {
          if (!missing.includes(name as ShopMergeField)) missing.push(name as ShopMergeField)
          return whole
        }
        return html ? escapeHtml(v) : v
      })
    : text
  return { text: draft || pending || missing.length ? null : out, missing, pending, draft }
}

/** Props whose value is HTML (rich text): values are escaped when inserted. */
const HTML_PROPS = new Set(['content', 'html', 'body'])
const LOOKS_LIKE_HTML = /<\/?[a-z][a-z0-9]*(\s[^>]*)?>/i

/** A section or list entry dropped because one of its texts could not be shown. */
export type DroppedContent = { section: string; item?: number; missing: ShopMergeField[]; pending: boolean; draft: boolean }

export type MergedSections = {
  /** Sections safe to show: every field substituted, every unshowable text removed with its section or list entry. */
  sections: Section[]
  /** What was removed and why (for a preview banner or a log; never shown to buyers). */
  dropped: DroppedContent[]
}

const DROP = Symbol('drop')
type Acc = { missing: Set<ShopMergeField>; pending: boolean; draft: boolean }

function mergeValue(value: unknown, values: ShopFieldValues, html: boolean, acc: Acc, onItemDrop: (i: number, a: Acc) => void): unknown {
  if (typeof value === 'string') {
    const r = resolveShopText(value, values, { html: html || LOOKS_LIKE_HTML.test(value) })
    if (r.text != null) return r.text
    r.missing.forEach((m) => acc.missing.add(m))
    acc.pending ||= r.pending
    acc.draft ||= r.draft
    return DROP
  }
  if (Array.isArray(value)) {
    const out: unknown[] = []
    value.forEach((v, i) => {
      // A list entry (FAQ answer, warranty card…) that cannot be shown goes away alone; the rest of the section stays.
      const itemAcc: Acc = { missing: new Set(), pending: false, draft: false }
      const merged = mergeValue(v, values, html, itemAcc, onItemDrop)
      if (merged === DROP) onItemDrop(i, itemAcc)
      else out.push(merged)
    })
    return out
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      const merged = mergeValue(v, values, HTML_PROPS.has(k), acc, onItemDrop)
      if (merged === DROP) return DROP
      out[k] = merged
    }
    return out
  }
  return value
}

/**
 * Resolves the fields in every prop of the sections (does not mutate the input). A list entry whose text cannot be
 * shown is removed from its list; a section whose own text cannot be shown is removed whole. Nothing reaches the
 * buyer with a placeholder or a made-up value.
 */
export function mergeShopSections(sections: Section[], shop: Shop): MergedSections {
  const values = shopFieldValues(shop)
  const dropped: DroppedContent[] = []
  const out: Section[] = []
  for (const s of sections) {
    const acc: Acc = { missing: new Set(), pending: false, draft: false }
    const props = mergeValue(s.props, values, false, acc, (item, a) =>
      dropped.push({ section: s.id, item, missing: [...a.missing], pending: a.pending, draft: a.draft }),
    )
    if (props === DROP) {
      dropped.push({ section: s.id, missing: [...acc.missing], pending: acc.pending, draft: acc.draft })
      continue
    }
    out.push({ ...s, props: props as Section['props'] })
  }
  return { sections: out, dropped }
}

/** Resolves a loose text (title, SEO description); `null` when it cannot be shown. */
export function mergeShopText(text: string | null | undefined, shop: Shop): string | null {
  if (!text) return text ?? null
  return resolveShopText(text, shopFieldValues(shop)).text
}

/**
 * Whether a content page can be served to buyers: it has something left to show after `mergeShopSections` and none of
 * its sections was dropped for being a legal draft. A legal page with a single missing field is dropped whole (its
 * only section goes), so it 404s instead of publishing an incomplete notice.
 */
export function pagePublishable(merged: MergedSections): boolean {
  return merged.sections.length > 0 && !merged.dropped.some((d) => d.draft && d.item == null)
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

/** A contact / identity page needs at least the legal name and the registered address (what Merchant Center checks). */
export function identityComplete(shop: Pick<Shop, 'legal' | 'contact'>): boolean {
  const l = shopLegal(shop)
  return !!(l.name && l.fiscal_address && (clean(shop.contact?.email) || clean(shop.contact?.phone)))
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

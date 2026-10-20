/**
 * Availability presentation: the single source of the texts and states a
 * storefront shows for stock. Pure functions, no DOM: safe in loaders, SSR and
 * edge runtimes.
 *
 * The server decides the state (`Availability.status`, already filtered by the
 * shop's `show_stock`); this module only turns it into labels. Shops may
 * override texts by key (`messages`) but never the logic. Numbers shown here
 * ("Quedan 3") come from `availability.quantity`, which the server sends only
 * when the shop allows it and past its own threshold: there is no threshold in
 * this code.
 */
import type { Availability, AvailabilityStatus, CartLineProblem, InsufficientStockLine, Product, ProductVariant } from './types.js'

export type AvailabilityTone = 'success' | 'warning' | 'danger' | 'info'

export type AvailabilityLocale = 'es' | 'en'

/** Text keys, overridable per shop. `{n}` and `{date}` are replaced. */
export type AvailabilityMessageKey =
  | 'status.in_stock'
  | 'status.low_stock'
  | 'status.low_stock_n'
  | 'status.out_of_stock'
  | 'status.backorder'
  | 'status.preorder'
  | 'sub.backorder_eta'
  | 'sub.preorder_date'
  | 'cta.add'
  | 'cta.out_of_stock'
  | 'cta.backorder'
  | 'cta.preorder'
  | 'sr.in_stock'
  | 'sr.low_stock'
  | 'sr.low_stock_n'
  | 'sr.out_of_stock'
  | 'sr.backorder'
  | 'sr.preorder'
  | 'option.sold_out'
  | 'option.backorder'
  | 'option.preorder'
  | 'max_per_order'
  | 'notify.title'
  | 'notify.email'
  | 'notify.phone'
  | 'notify.consent'
  | 'notify.submit'
  | 'notify.done'
  | 'notify.error'
  | 'problem.out_of_stock'
  | 'problem.insufficient_stock'
  | 'problem.insufficient_stock_n'
  | 'problem.adjust'
  | 'problem.remove'
  | 'conflict.title'
  | 'conflict.body'
  | 'conflict.dismiss'

export type AvailabilityMessages = Record<AvailabilityMessageKey, string>

const ES: AvailabilityMessages = {
  'status.in_stock': 'Disponible',
  'status.low_stock': 'Pocas piezas',
  'status.low_stock_n': 'Quedan {n}',
  'status.out_of_stock': 'Agotado',
  'status.backorder': 'Bajo pedido',
  'status.preorder': 'Preventa',
  'sub.backorder_eta': 'Se envía a partir del {date}',
  'sub.preorder_date': 'Sale a la venta el {date}',
  'cta.add': 'Agregar al carrito',
  'cta.out_of_stock': 'Agotado',
  'cta.backorder': 'Pedir bajo pedido',
  'cta.preorder': 'Apartar en preventa',
  'sr.in_stock': 'Disponible',
  'sr.low_stock': 'Quedan pocas piezas',
  'sr.low_stock_n': 'Quedan solo {n} piezas',
  'sr.out_of_stock': 'Producto agotado',
  'sr.backorder': 'Disponible bajo pedido',
  'sr.preorder': 'Disponible en preventa',
  'option.sold_out': 'agotado',
  'option.backorder': 'bajo pedido',
  'option.preorder': 'preventa',
  max_per_order: 'Máximo {n} por pedido',
  'notify.title': 'Avísame cuando vuelva',
  'notify.email': 'Correo electrónico',
  'notify.phone': 'WhatsApp o teléfono',
  'notify.consent': 'Acepto recibir un aviso cuando vuelva a estar disponible',
  'notify.submit': 'Avísame',
  'notify.done': 'Listo. Te avisaremos cuando vuelva a estar disponible.',
  'notify.error': 'No pudimos guardar tu aviso. Revisa tus datos e inténtalo de nuevo.',
  'problem.out_of_stock': 'Ya no hay existencias',
  'problem.insufficient_stock': 'No hay suficientes piezas para esta cantidad',
  'problem.insufficient_stock_n': 'Solo puedes llevar {n}',
  'problem.adjust': 'Ajustar a {n}',
  'problem.remove': 'Quitar',
  'conflict.title': 'Algunos productos cambiaron de existencias',
  'conflict.body': 'Revisa las líneas marcadas. Tu carrito y tus datos se conservaron; ajusta o quita lo que ya no está disponible y continúa.',
  'conflict.dismiss': 'Entendido',
}

const EN: AvailabilityMessages = {
  'status.in_stock': 'In stock',
  'status.low_stock': 'Low stock',
  'status.low_stock_n': 'Only {n} left',
  'status.out_of_stock': 'Sold out',
  'status.backorder': 'Made to order',
  'status.preorder': 'Pre-order',
  'sub.backorder_eta': 'Ships from {date}',
  'sub.preorder_date': 'Available on {date}',
  'cta.add': 'Add to cart',
  'cta.out_of_stock': 'Sold out',
  'cta.backorder': 'Order now, ships later',
  'cta.preorder': 'Pre-order',
  'sr.in_stock': 'In stock',
  'sr.low_stock': 'Low stock',
  'sr.low_stock_n': 'Only {n} left in stock',
  'sr.out_of_stock': 'Sold out',
  'sr.backorder': 'Available to order, ships later',
  'sr.preorder': 'Available for pre-order',
  'option.sold_out': 'sold out',
  'option.backorder': 'made to order',
  'option.preorder': 'pre-order',
  max_per_order: 'Maximum {n} per order',
  'notify.title': 'Notify me when it is back',
  'notify.email': 'Email',
  'notify.phone': 'WhatsApp or phone',
  'notify.consent': 'I agree to receive a notice when it is back in stock',
  'notify.submit': 'Notify me',
  'notify.done': 'Done. We will let you know when it is back in stock.',
  'notify.error': 'We could not save your request. Check your details and try again.',
  'problem.out_of_stock': 'No longer in stock',
  'problem.insufficient_stock': 'Not enough stock for this quantity',
  'problem.insufficient_stock_n': 'You can take up to {n}',
  'problem.adjust': 'Adjust to {n}',
  'problem.remove': 'Remove',
  'conflict.title': 'Some items changed stock',
  'conflict.body': 'Review the marked lines. Your cart and your details were kept; adjust or remove what is no longer available and continue.',
  'conflict.dismiss': 'Got it',
}

const CATALOG: Record<AvailabilityLocale, AvailabilityMessages> = { es: ES, en: EN }

/** `es-MX` -> `es`, `en-US` -> `en`; anything else falls back to Spanish. */
export function availabilityLocale(locale: string | null | undefined): AvailabilityLocale {
  return (locale ?? '').toLowerCase().startsWith('en') ? 'en' : 'es'
}

/** Catalog for a locale with the shop's per-key overrides applied. */
export function availabilityMessages(locale: string | null | undefined, overrides?: Partial<AvailabilityMessages> | null): AvailabilityMessages {
  const base = CATALOG[availabilityLocale(locale)]
  if (!overrides) return base
  const out = { ...base }
  for (const [k, v] of Object.entries(overrides)) if (typeof v === 'string' && k in base) out[k as AvailabilityMessageKey] = v
  return out
}

/** Replaces `{name}` placeholders. */
export function formatAvailabilityMessage(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m))
}

function formatDate(value: string | null | undefined, locale: string | null | undefined): string | null {
  if (!value) return null
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  try {
    // UTC keeps server and client renders identical (no hydration mismatch).
    return new Intl.DateTimeFormat(locale || 'es', { dateStyle: 'long', timeZone: 'UTC' }).format(d)
  } catch {
    return value.slice(0, 10)
  }
}

export type ResolveAvailabilityOptions = {
  /**
   * Polyfill only: shop-level "low stock" threshold to derive `low_stock` from
   * `quantity_available` on servers older than contract 1.1. Without it the
   * polyfill never reports `low_stock`. Ignored when the server sends `availability`.
   */
  lowStockThreshold?: number | null
}

type AvailabilitySource = Pick<Product | ProductVariant, 'available_for_sale'> & {
  availability?: Availability | null
  quantity_available?: number | null
}

/**
 * The `Availability` of a variant or product. Uses the server's `availability`
 * when present; otherwise derives `in_stock | low_stock | out_of_stock` from
 * `available_for_sale` / `quantity_available` so storefronts can migrate before
 * the backend does. A malformed `availability` falls back to the polyfill.
 */
export function resolveAvailability(source: AvailabilitySource, options: ResolveAvailabilityOptions = {}): Availability {
  const a = source.availability
  if (a && typeof a === 'object' && typeof a.status === 'string') return a
  const qty = typeof source.quantity_available === 'number' ? source.quantity_available : null
  const sellable = source.available_for_sale && (qty === null || qty > 0)
  const threshold = options.lowStockThreshold
  const low = sellable && qty !== null && typeof threshold === 'number' && threshold > 0 && qty <= threshold
  const status: AvailabilityStatus = !sellable ? 'out_of_stock' : low ? 'low_stock' : 'in_stock'
  return {
    status,
    quantity: sellable ? qty : null,
    max_per_order: sellable ? qty : null,
    restock_eta: null,
    preorder_release_at: null,
    // Old servers have no subscription route: never offer a form that cannot work.
    notify_available: false,
  }
}

export type AvailabilityView = {
  status: AvailabilityStatus
  tone: AvailabilityTone
  /** Short badge text: "Agotado", "Quedan 3", "Bajo pedido"... Never empty. */
  label: string
  /** ETA / release date text, or `null`. */
  sublabel: string | null
  /** Primary button text. */
  ctaLabel: string
  /** The primary button may be pressed (backorder/preorder are purchasable). */
  ctaEnabled: boolean
  /** Offer the "Notify me when it is back" form. */
  showNotify: boolean
  /** Full sentence for screen readers. */
  srText: string
  /** Units to cap the quantity picker at, or `null`. */
  maxPerOrder: number | null
  /** Show a badge on listing cards (everything but plain `in_stock`: do not clutter). */
  showOnCard: boolean
}

export type AvailabilityViewOptions = {
  messages?: Partial<AvailabilityMessages> | null
}

const TONES: Record<AvailabilityStatus, AvailabilityTone> = {
  in_stock: 'success',
  low_stock: 'warning',
  out_of_stock: 'danger',
  backorder: 'info',
  preorder: 'info',
}

/**
 * Texts and flags for one availability. `availability` accepts anything with an
 * unknown `status` (a future server): it is treated as `out_of_stock`.
 */
export function availabilityView(availability: Availability, locale: string | null | undefined, options: AvailabilityViewOptions = {}): AvailabilityView {
  const m = availabilityMessages(locale, options.messages)
  const known = (['in_stock', 'low_stock', 'out_of_stock', 'backorder', 'preorder'] as const).includes(availability.status)
  const status: AvailabilityStatus = known ? availability.status : 'out_of_stock'
  const qty = typeof availability.quantity === 'number' && availability.quantity > 0 ? availability.quantity : null
  const f = formatAvailabilityMessage

  let label: string
  let sr: string
  let cta: string
  let sublabel: string | null = null
  let enabled = true
  switch (status) {
    case 'in_stock':
      label = m['status.in_stock']
      sr = m['sr.in_stock']
      cta = m['cta.add']
      break
    case 'low_stock':
      // Without a visible quantity the server still says "low": no number is invented.
      label = qty !== null ? f(m['status.low_stock_n'], { n: qty }) : m['status.low_stock']
      sr = qty !== null ? f(m['sr.low_stock_n'], { n: qty }) : m['sr.low_stock']
      cta = m['cta.add']
      break
    case 'backorder': {
      label = m['status.backorder']
      sr = m['sr.backorder']
      cta = m['cta.backorder']
      const date = formatDate(availability.restock_eta, locale)
      if (date) sublabel = f(m['sub.backorder_eta'], { date })
      break
    }
    case 'preorder': {
      label = m['status.preorder']
      sr = m['sr.preorder']
      cta = m['cta.preorder']
      const date = formatDate(availability.preorder_release_at ?? availability.restock_eta, locale)
      if (date) sublabel = f(m['sub.preorder_date'], { date })
      break
    }
    default:
      label = m['status.out_of_stock']
      sr = m['sr.out_of_stock']
      cta = m['cta.out_of_stock']
      enabled = false
  }
  return {
    status,
    tone: TONES[status],
    label,
    sublabel,
    ctaLabel: cta,
    ctaEnabled: enabled,
    showNotify: status === 'out_of_stock' && availability.notify_available === true,
    srText: sublabel ? `${sr}. ${sublabel}` : sr,
    maxPerOrder: typeof availability.max_per_order === 'number' && availability.max_per_order > 0 ? availability.max_per_order : null,
    showOnCard: status !== 'in_stock',
  }
}

export type CartLineProblemView = {
  code: CartLineProblem['code']
  /** "Ya no hay existencias" / "Solo puedes llevar 2". */
  message: string
  /** Quantity to adjust the line to, or `null` (remove only). */
  adjustTo: number | null
  adjustLabel: string | null
  removeLabel: string
}

/** Texts and actions for a cart line problem. Offers "Adjust to N" only when `max_quantity` is a positive number different from the line quantity (a refused change leaves the cart at its old quantity). */
export function cartLineProblemView(
  problem: CartLineProblem | InsufficientStockLine,
  locale: string | null | undefined,
  options: AvailabilityViewOptions & { lineQuantity?: number } = {},
): CartLineProblemView {
  const m = availabilityMessages(locale, options.messages)
  const code: CartLineProblem['code'] = 'code' in problem ? problem.code : problem.status === 'out_of_stock' ? 'out_of_stock' : 'insufficient_stock'
  const max = typeof problem.max_quantity === 'number' && problem.max_quantity >= 0 ? problem.max_quantity : null
  const canAdjust = max !== null && max > 0 && (options.lineQuantity === undefined || max !== options.lineQuantity)
  const message =
    code === 'out_of_stock' || max === 0
      ? m['problem.out_of_stock']
      : max !== null
        ? formatAvailabilityMessage(m['problem.insufficient_stock_n'], { n: max })
        : m['problem.insufficient_stock']
  return {
    code,
    message,
    adjustTo: canAdjust ? max : null,
    adjustLabel: canAdjust ? formatAvailabilityMessage(m['problem.adjust'], { n: max }) : null,
    removeLabel: m['problem.remove'],
  }
}

const SCHEMA_AVAILABILITY: Record<AvailabilityStatus, string> = {
  in_stock: 'https://schema.org/InStock',
  low_stock: 'https://schema.org/LimitedAvailability',
  out_of_stock: 'https://schema.org/OutOfStock',
  backorder: 'https://schema.org/BackOrder',
  preorder: 'https://schema.org/PreOrder',
}

/** schema.org `ItemAvailability` URL for a status (unknown -> `OutOfStock`). */
export function schemaAvailability(status: AvailabilityStatus | string): string {
  return SCHEMA_AVAILABILITY[status as AvailabilityStatus] ?? SCHEMA_AVAILABILITY.out_of_stock
}

/** Best state among variants for a product summary (when the server sends none). */
export function productAvailability(product: Pick<Product, 'variants' | 'available_for_sale' | 'availability'>, options: ResolveAvailabilityOptions = {}): Availability {
  if (product.availability) return product.availability
  const all = product.variants.map((v) => resolveAvailability(v, options))
  const rank: AvailabilityStatus[] = ['in_stock', 'low_stock', 'backorder', 'preorder', 'out_of_stock']
  const best = all.slice().sort((a, b) => rank.indexOf(a.status) - rank.indexOf(b.status))[0]
  return best ?? resolveAvailability(product, options)
}

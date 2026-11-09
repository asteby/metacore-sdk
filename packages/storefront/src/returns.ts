/**
 * Returns ("Solicitar devolución") over an `Order`: which lines can come back, and whether the order is still inside
 * the return window. Pure functions, no DOM, no network: safe in loaders, SSR and edge runtimes.
 *
 * Rules:
 * - The server has the last word (`customer.requestReturn` answers 409/422). These helpers only decide what to OFFER.
 * - The delivery date is READ, never invented. It comes from the order, in this order: the `delivered` step of
 *   `order.progress` (`at`), the latest `delivered_at` of the live (non-return, non-sandbox) shipments, then
 *   `order.pickup.delivered_at`. When none exists (e.g. an older server, or progress derived from `status`) the order is
 *   eligible with no `deadline`: the window cannot be checked on the client, the server enforces it.
 * - A window is only enforced when the store passes `returnsDays` / `warrantyDays`; the SDK has no default policy.
 * - Quantities already requested in earlier returns are NOT subtracted: `order.returns` carries no lines. The server
 *   rejects a quantity beyond what is left.
 */
import { availabilityLocale, formatAvailabilityMessage } from './availability.js'
import { isTestShipment, orderProgress, orderShipments } from './order-progress.js'
import type { Order, ReturnReason } from './types.js'

/** Reasons the API accepts (`ReturnRequestInput.reason`). `not_wanted` is the server's default. */
export const RETURN_REASONS: readonly ReturnReason[] = ['defective', 'not_wanted', 'wrong_item', 'warranty']
export const DEFAULT_RETURN_REASON: ReturnReason = 'not_wanted'
/** Longest `notes` the API accepts. */
export const RETURN_NOTES_MAX = 500

export function isReturnReason(value: unknown): value is ReturnReason {
  return typeof value === 'string' && (RETURN_REASONS as readonly string[]).includes(value)
}

export type ReturnableLine = {
  sku: string
  title: string
  variantTitle: string | null
  /** Most units the buyer can send back: the quantity bought (lines with the same SKU are added up). */
  maxQuantity: number
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * The lines of the order that can be named in a return: those with a `sku` (the API identifies a line by SKU) and a
 * whole quantity of at least 1. Lines with the same SKU are merged. Malformed lines are skipped. Order is preserved.
 */
export function returnableLines(order: Pick<Order, 'lines'> | null | undefined): ReturnableLine[] {
  const lines: unknown[] = Array.isArray(order?.lines) ? order!.lines : []
  const out = new Map<string, ReturnableLine>()
  for (const raw of lines) {
    if (!isRecord(raw)) continue
    const sku = typeof raw.sku === 'string' ? raw.sku.trim() : ''
    const qty = raw.quantity
    if (!sku || typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1) continue
    const seen = out.get(sku)
    if (seen) {
      seen.maxQuantity += qty
      continue
    }
    const title = typeof raw.title === 'string' ? raw.title.trim() : ''
    const variant = typeof raw.variant_title === 'string' ? raw.variant_title.trim() : ''
    out.set(sku, { sku, title, variantTitle: variant && !/^default( title)?$/i.test(variant) ? variant : null, maxQuantity: qty })
  }
  return [...out.values()]
}

export type ReturnIneligibleReason =
  /** Not delivered yet (pending payment, preparing, in transit, partial delivery...). */
  | 'not_delivered'
  | 'cancelled'
  | 'refunded'
  /** Delivered, but past `returnsDays` (and `warrantyDays`, when given). */
  | 'window_expired'
  /** Nothing in the order can be named in a return. */
  | 'no_lines'

export type ReturnEligibility =
  | {
      eligible: true
      /** ISO instant the window closes. Absent when no delivery date is known or no window was given. */
      deadline?: string
      /** The order is past the return window but inside the warranty: only `reason: 'warranty'` makes sense. */
      warrantyOnly?: boolean
    }
  | {
      eligible: false
      reason: ReturnIneligibleReason
      /** When the window closed (`window_expired`). */
      deadline?: string
    }

export type ReturnEligibilityOptions = {
  /** Days after delivery the buyer can return for any reason. Unset: no limit is checked here. */
  returnsDays?: number | null
  /** Days after delivery a warranty claim is accepted (longer than `returnsDays`). Unset: none. */
  warrantyDays?: number | null
  /** Clock, for tests. Default `new Date()`. */
  now?: Date | number
}

const DAY_MS = 86_400_000

const ts = (iso: unknown): number => (typeof iso === 'string' && iso ? Date.parse(iso) : NaN)

/** When the order was delivered, as epoch ms, or `null` when the contract does not say. */
export function orderDeliveredAt(order: Order): number | null {
  const step = orderProgress(order).steps.find((s) => s.key === 'delivered' && s.state === 'done')
  const fromStep = ts(step?.at)
  if (!Number.isNaN(fromStep)) return fromStep
  const shipped = orderShipments(order)
    .filter((s) => s.kind !== 'return' && !isTestShipment(s))
    .map((s) => ts(s.delivered_at))
    .filter((t) => !Number.isNaN(t))
  if (shipped.length) return Math.max(...shipped)
  const pickup = ts(order.pickup?.delivered_at)
  return Number.isNaN(pickup) ? null : pickup
}

const days = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null)

/**
 * Whether to offer "Solicitar devolución" for this order. `{ eligible: false, reason }` says why not; an eligible order
 * with `deadline` is inside its window until then. See the module notes for where the delivery date comes from.
 */
export function returnEligibility(order: Order, options: ReturnEligibilityOptions = {}): ReturnEligibility {
  const stage = orderProgress(order).stage
  if (stage === 'cancelled') return { eligible: false, reason: 'cancelled' }
  if (stage === 'refunded') return { eligible: false, reason: 'refunded' }
  if (stage !== 'delivered') return { eligible: false, reason: 'not_delivered' }
  if (returnableLines(order).length === 0) return { eligible: false, reason: 'no_lines' }

  const returns = days(options.returnsDays)
  const warranty = days(options.warrantyDays)
  const delivered = orderDeliveredAt(order)
  if (delivered === null || (returns === null && warranty === null)) return { eligible: true }

  const now = options.now instanceof Date ? options.now.getTime() : (options.now ?? Date.now())
  const returnEnd = returns === null ? null : delivered + returns * DAY_MS
  const warrantyEnd = warranty === null ? null : delivered + warranty * DAY_MS
  if (returnEnd !== null && now <= returnEnd) return { eligible: true, deadline: new Date(returnEnd).toISOString() }
  if (warrantyEnd !== null && now <= warrantyEnd) {
    return { eligible: true, deadline: new Date(warrantyEnd).toISOString(), ...(returnEnd !== null ? { warrantyOnly: true } : {}) }
  }
  const closed = Math.max(returnEnd ?? -Infinity, warrantyEnd ?? -Infinity)
  return { eligible: false, reason: 'window_expired', deadline: new Date(closed).toISOString() }
}

// ---- messages --------------------------------------------------------------------------------------------------------

export type ReturnLocale = 'es' | 'en'

const ES = {
  'reason.defective': 'Producto defectuoso o dañado',
  'reason.not_wanted': 'Ya no lo quiero',
  'reason.wrong_item': 'Recibí un producto equivocado',
  'reason.warranty': 'Garantía',
  'eligibility.not_delivered': 'Podrás solicitar una devolución cuando el pedido sea entregado.',
  'eligibility.cancelled': 'Este pedido fue cancelado; no hay nada que devolver.',
  'eligibility.refunded': 'Este pedido ya fue reembolsado.',
  'eligibility.window_expired': 'El plazo para solicitar una devolución de este pedido terminó.',
  'eligibility.no_lines': 'Este pedido no tiene artículos que se puedan devolver.',
  'eligibility.deadline': 'Puedes solicitarla hasta el {date}.',
  'form.title': 'Solicitar devolución',
  'form.lines': 'Artículos a devolver',
  'form.select': 'Devolver {title}',
  'form.quantity': 'Cantidad de {title}',
  'form.maxQuantity': 'de {max}',
  'form.reason': 'Motivo',
  'form.notes': 'Notas',
  'form.notesHint': 'Opcional. Cuéntanos más sobre el problema.',
  'form.notesCount': '{count} de {max}',
  'form.submit': 'Solicitar devolución',
  'form.success': 'Recibimos tu solicitud de devolución. Te avisaremos por correo.',
  'error.lines_required': 'Elige al menos un artículo.',
  'error.invalid_quantity': 'Indica una cantidad válida (entero entre 1 y {max}).',
  'error.invalid_reason': 'Elige un motivo de la lista.',
  'error.notes_too_long': 'Las notas admiten hasta {max} caracteres.',
  'error.unauthorized': 'Inicia sesión para solicitar la devolución.',
  'error.not_found': 'No encontramos este pedido.',
  'error.not_returnable': 'Este pedido ya no admite devoluciones.',
  'error.rate_limited': 'Demasiados intentos. Espera un momento y vuelve a intentarlo.',
  'error.store_misconfigured': 'La tienda no puede recibir devoluciones por ahora. Contáctala.',
  'error.unavailable': 'No pudimos enviar tu solicitud. Inténtalo de nuevo.',
  'error.validation': 'Revisa los datos marcados.',
} as const

export type ReturnMessageKey = keyof typeof ES
export type ReturnMessages = Record<ReturnMessageKey, string>

const EN: ReturnMessages = {
  'reason.defective': 'Defective or damaged',
  'reason.not_wanted': 'I no longer want it',
  'reason.wrong_item': 'I received the wrong item',
  'reason.warranty': 'Warranty',
  'eligibility.not_delivered': 'You can request a return once the order is delivered.',
  'eligibility.cancelled': 'This order was cancelled; there is nothing to return.',
  'eligibility.refunded': 'This order has already been refunded.',
  'eligibility.window_expired': 'The period to request a return for this order has ended.',
  'eligibility.no_lines': 'This order has no items that can be returned.',
  'eligibility.deadline': 'You can request it until {date}.',
  'form.title': 'Request a return',
  'form.lines': 'Items to return',
  'form.select': 'Return {title}',
  'form.quantity': 'Quantity of {title}',
  'form.maxQuantity': 'of {max}',
  'form.reason': 'Reason',
  'form.notes': 'Notes',
  'form.notesHint': 'Optional. Tell us more about the problem.',
  'form.notesCount': '{count} of {max}',
  'form.submit': 'Request return',
  'form.success': 'We received your return request. We will email you.',
  'error.lines_required': 'Choose at least one item.',
  'error.invalid_quantity': 'Enter a valid quantity (a whole number from 1 to {max}).',
  'error.invalid_reason': 'Choose a reason from the list.',
  'error.notes_too_long': 'Notes can be up to {max} characters.',
  'error.unauthorized': 'Sign in to request the return.',
  'error.not_found': 'We could not find this order.',
  'error.not_returnable': 'This order no longer accepts returns.',
  'error.rate_limited': 'Too many attempts. Wait a moment and try again.',
  'error.store_misconfigured': 'The store cannot take returns right now. Contact them.',
  'error.unavailable': 'We could not send your request. Please try again.',
  'error.validation': 'Check the marked fields.',
}

const CATALOG: Record<ReturnLocale, ReturnMessages> = { es: ES, en: EN }

/** Catalog for a locale (`es-MX` -> es, `en-US` -> en) with the shop's per-key overrides applied. */
export function returnMessages(locale: string | null | undefined, overrides?: Partial<ReturnMessages> | null): ReturnMessages {
  const base = CATALOG[availabilityLocale(locale)]
  if (!overrides) return base
  const out = { ...base }
  for (const [k, v] of Object.entries(overrides)) if (typeof v === 'string' && k in base) out[k as ReturnMessageKey] = v
  return out
}

/** Replaces `{name}` placeholders in a return message. */
export const fillReturnMessage = formatAvailabilityMessage

/** Text for why an order cannot be returned. */
export function returnIneligibleMessage(reason: ReturnIneligibleReason, locale?: string | null, overrides?: Partial<ReturnMessages> | null): string {
  return returnMessages(locale, overrides)[`eligibility.${reason}`]
}

/** Text for a reason code; an unknown code reads as the default reason, never as the raw code. */
export function returnReasonLabel(reason: string, locale?: string | null, overrides?: Partial<ReturnMessages> | null): string {
  const key: ReturnMessageKey = `reason.${isReturnReason(reason) ? reason : DEFAULT_RETURN_REASON}`
  return returnMessages(locale, overrides)[key]
}

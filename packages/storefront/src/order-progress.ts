/**
 * Pure helpers over an `Order` (contract 1.8): the unified progress, the one next action, shipment ordering and the
 * "test" rules. They READ what the server sent and only derive what an older server (no `progress` / `next_action`)
 * did not. Every enum is open: an unknown stage, step state or shipment status never throws, it is kept as is and the
 * UI shows its safe fallback.
 */
import { safeHttpsUrl } from './payments.js'
import type {
  InvoiceDoc,
  NextAction,
  Order,
  OrderProblem,
  OrderProgress,
  OrderProgressStep,
  OrderStage,
  OrderStepKey,
  Shipment,
  ShipmentEvent,
  ShipmentStatus,
} from './types.js'

/** Steps of an order that ships, in order. */
export const SHIPPING_STEPS = ['paid', 'preparing', 'shipped', 'in_transit', 'delivered'] as const
/** Steps of an order the buyer picks up. */
export const PICKUP_STEPS = ['paid', 'preparing', 'ready_for_pickup', 'delivered'] as const

/** Shipment statuses that mean the package is not where it should be. */
const SHIPMENT_PROBLEMS: Record<string, string> = { exception: 'delivery_exception', returned: 'returned', lost: 'lost' }

const RANK: Record<string, number> = { pending: 0, label_created: 1, in_transit: 2, out_for_delivery: 3, delivered: 4 }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A shipment the buyer can be told about as real: not a sandbox one. */
export function isTestShipment(s: Pick<Shipment, 'test_mode' | 'environment'> | null | undefined): boolean {
  return !!s && (s.test_mode === true || s.environment === 'sandbox')
}

/** An invoice or credit note from a sandbox PAC. */
export function isTestInvoice(d: Pick<InvoiceDoc, 'test_mode' | 'environment'> | null | undefined): boolean {
  return !!d && (d.test_mode === true || d.environment === 'sandbox')
}

/** `https` URL with no credentials, or `null`. The only kind of link a tracking or voucher button may carry. */
export function safeTrackingUrl(value: unknown): string | null {
  return safeHttpsUrl(value)
}

function time(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? -Infinity : t
}

/** Newest first, invalid dates last, ties keep the server's order; at most `limit` (default 50, the contract's cap). */
export function sortTrackingEvents(events: readonly ShipmentEvent[] | null | undefined, limit = 50): ShipmentEvent[] {
  if (!Array.isArray(events)) return []
  return events
    .filter(isRecord as (e: unknown) => e is ShipmentEvent)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => time(b.e.occurred_at) - time(a.e.occurred_at) || a.i - b.i)
    .slice(0, Math.max(0, limit))
    .map((x) => x.e)
}

/** The shipments of the order that count: outbound/pickup/local first, returns after; stable otherwise. */
export function orderShipments(order: Pick<Order, 'shipments'> | null | undefined): Shipment[] {
  const list = Array.isArray(order?.shipments) ? order!.shipments!.filter(isRecord as (s: unknown) => s is Shipment) : []
  return [...list.filter((s) => s.kind !== 'return'), ...list.filter((s) => s.kind === 'return')]
}

function validProgress(p: unknown): p is OrderProgress {
  return isRecord(p) && typeof p.stage === 'string' && Array.isArray(p.steps)
}

/** The stage of an order from its legacy `status` / `payment_status` and its shipments (servers before contract 1.8). */
function legacyStage(order: Order, shipments: Shipment[]): OrderStage {
  const status = (order.status ?? '').toLowerCase()
  if (status === 'cancelled' || status === 'canceled') return 'cancelled'
  if (status === 'refunded') return 'refunded'
  if (status === 'pending_payment' || order.payment_status === 'pending') return 'pending_payment'
  if (status === 'delivered' || status === 'fulfilled') return 'delivered'
  const live = shipments.filter((s) => s.kind !== 'return' && !isTestShipment(s))
  const best = live.reduce<string | null>((acc, s) => (acc === null || (RANK[s.status] ?? -1) > (RANK[acc] ?? -1) ? s.status : acc), null)
  if (best === 'delivered') return 'delivered'
  if (best === 'out_for_delivery') return 'out_for_delivery'
  if (best === 'in_transit') return 'in_transit'
  if (status === 'ready_for_pickup') return 'ready_for_pickup'
  if (status === 'shipped' || best === 'label_created') return 'shipped'
  if (status === 'fulfilling' || status === 'accepted') return 'preparing'
  return 'paid'
}

const STAGE_TO_STEP: Record<string, OrderStepKey> = {
  paid: 'paid',
  preparing: 'preparing',
  ready_for_pickup: 'ready_for_pickup',
  shipped: 'shipped',
  in_transit: 'in_transit',
  out_for_delivery: 'in_transit',
  delivered: 'delivered',
}

/**
 * The unified progress. The server's `order.progress` wins when it is well formed; otherwise it is derived, so a store
 * on an older OPS still gets a timeline. Pending payment, cancelled and refunded orders have no steps to walk: `steps`
 * lists them as `pending` (or `[]` when cancelled/refunded) and the stage says why.
 */
export function orderProgress(order: Order): OrderProgress {
  if (validProgress(order.progress)) return order.progress
  const shipments = orderShipments(order)
  const stage = legacyStage(order, shipments)
  const keys: readonly string[] = order.delivery_method === 'pickup' ? PICKUP_STEPS : SHIPPING_STEPS
  const dead = stage === 'cancelled' || stage === 'refunded'
  const awaiting = stage === 'pending_payment'
  const current = STAGE_TO_STEP[stage] ?? 'paid'
  const at = keys.indexOf(current)
  const failed = shipments.find((s) => SHIPMENT_PROBLEMS[s.status] && s.kind !== 'return' && !isTestShipment(s))
  const problem: OrderProblem | null = failed
    ? { code: SHIPMENT_PROBLEMS[failed.status]!, at: failed.events[0]?.occurred_at ?? null }
    : order.payment_status === 'failed'
      ? { code: 'payment_failed' }
      : null
  const steps: OrderProgressStep[] = dead
    ? []
    : keys.map((key, i) => {
        if (awaiting) return { key, state: 'pending', at: null }
        const state = i < at || stage === 'delivered' ? 'done' : i === at ? (problem && i >= keys.indexOf('shipped') ? 'problem' : 'current') : 'pending'
        return { key, state, at: key === 'paid' && state === 'done' ? order.created_at : null }
      })
  return { stage, problem, steps }
}

/**
 * The action to put first. The server's `next_action` wins (its `href` is re-checked: only `https`); an older server
 * gets one derived from the order and its invoice. Never `null`: `{ kind: 'none' }` means "nothing to offer".
 */
export function nextAction(order: Order): NextAction {
  if (isRecord(order.next_action) && typeof order.next_action.kind === 'string') {
    const href = safeTrackingUrl(order.next_action.href)
    return { kind: order.next_action.kind, href, ref: typeof order.next_action.ref === 'string' ? order.next_action.ref : null }
  }
  const progress = orderProgress(order)
  if (progress.stage === 'pending_payment') return { kind: 'pay', href: null, ref: null }
  if (progress.stage === 'cancelled' || progress.stage === 'refunded') return { kind: 'none', href: null, ref: null }
  const live = orderShipments(order).find((s) => s.kind !== 'return' && !isTestShipment(s) && s.status !== 'delivered' && s.status !== 'cancelled')
  const trackUrl = safeTrackingUrl(live?.tracking_url)
  if (live && trackUrl) return { kind: 'track', href: trackUrl, ref: live.id }
  if (progress.stage === 'ready_for_pickup') return { kind: 'pickup', href: null, ref: null }
  const inv = order.invoice
  if (inv?.action === 'download' || inv?.stage === 'issued') return { kind: 'download_invoice', href: null, ref: order.invoices?.find((d) => d.kind === 'invoice')?.id ?? null }
  if (inv?.action === 'correct_data') return { kind: 'correct_invoice_data', href: null, ref: null }
  if (inv?.action === 'contact_store') return { kind: 'contact_store', href: null, ref: null }
  if (inv?.can_request === true && inv.stage !== 'requested') return { kind: 'request_invoice', href: null, ref: null }
  return { kind: 'none', href: null, ref: null }
}

/** Latest known status among the live (non-sandbox, non-return) shipments, or `null`. */
export function shipmentsStatus(order: Order): ShipmentStatus | null {
  if (order.shipments_summary && typeof order.shipments_summary.status === 'string') return order.shipments_summary.status
  const live = orderShipments(order).filter((s) => s.kind !== 'return' && !isTestShipment(s))
  return live.length ? live[0]!.status : null
}

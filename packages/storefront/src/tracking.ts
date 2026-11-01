/**
 * The public tracking answer (`POST /storefront/customer/track`, contract `TrackingView`) made safe to render: one shape
 * for the order-level view the server sends and for the flat single-parcel shape older SDKs assumed.
 */
import { isTestShipment } from './order-progress.js'
import type { LegacyTrackingView, Shipment, ShipmentStatus, TrackingView } from './types.js'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/**
 * The tracking view in the contract shape, or `null` when the body is not a tracking answer at all.
 *
 * - `{ order_number, status, shipments: [] }` (the contract) is kept as is; entries that are not objects are dropped (a shipment without `events` gets `[]`), and
 *   `shipments: []` stays a valid answer ("confirmed, no guide yet").
 * - The deprecated flat shape (`{ status, carrier, tracking_number, events: [] }`) becomes one shipment, so a store,
 *   a fixture or a mock built before 0.32 keeps rendering.
 */
export function normalizeTrackingView(raw: unknown): TrackingView | null {
  if (!isRecord(raw)) return null
  if (Array.isArray(raw.shipments)) {
    const shipments = raw.shipments.filter((s): s is Shipment => isRecord(s)).map((s) => (Array.isArray(s.events) ? s : { ...s, events: [] }))
    return {
      order_number: strOrNull(raw.order_number),
      status: typeof raw.status === 'string' ? (raw.status as ShipmentStatus) : null,
      shipments,
    }
  }
  if (Array.isArray(raw.events)) {
    const legacy = raw as LegacyTrackingView
    const status: ShipmentStatus = typeof legacy.status === 'string' ? legacy.status : 'pending'
    const shipment: Shipment & Pick<LegacyTrackingView, 'eta' | 'updated_at'> = {
      ...(legacy as object),
      id: strOrNull((raw as { id?: unknown }).id) ?? strOrNull(legacy.tracking_number) ?? 'tracking',
      kind: 'outbound',
      status,
      events: legacy.events.filter(isRecord) as Shipment['events'],
      label_url: null,
    }
    return { order_number: null, status, shipments: [shipment] }
  }
  return null
}

/** The shipments a buyer may see: never a sandbox (`test_mode`) one, even if a server sent it. */
export function visibleTrackingShipments(view: Pick<TrackingView, 'shipments'> | null | undefined): Shipment[] {
  return Array.isArray(view?.shipments) ? view!.shipments.filter((s) => isRecord(s) && !isTestShipment(s)) : []
}

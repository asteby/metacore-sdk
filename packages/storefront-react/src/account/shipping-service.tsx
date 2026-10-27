/**
 * The delivery the buyer chose at checkout, as they saw it: carrier mark, service name and estimated business days.
 * It reads `order.shipping_service` (contract 1.11), so it shows before any guide or tracking exists and next to a
 * sandbox shipment. Any carrier: the mark comes from the `renderCarrierMark` slot (e.g. `<BrandMark brand=... />` from
 * `/checkout`, kept out of this bundle on purpose) and, when the store passes none or the carrier is unknown to it, the
 * name is the only identity. Older servers (no `shipping_service`) fall back to the text of `shipping_method`
 * (`shipping:<service>`); nothing renders when there is nothing to say. Headless: `data-sf-shipping-service-*`.
 */
import type { Order, OrderShippingService } from '@asteby/storefront'
import type { ReactNode } from 'react'
import { fill } from './orders-messages.js'
import { str, useAccountText, type AccountTextProps } from './orders-ui.js'

export type ShippingServiceCardClassNames = Partial<Record<'root' | 'header' | 'title' | 'carrier' | 'eta' | 'note', string>>

export type ShippingServiceCardProps = AccountTextProps & {
  /** The order (its `shipping_service`, else `shipping_method`) ... */
  order?: Pick<Order, 'shipping_service' | 'shipping_method' | 'delivery_method'> | null
  /** ... or the service itself. */
  service?: OrderShippingService | null
  /** Carrier logo/brand mark; called with the logo key (else the carrier text). */
  renderCarrierMark?: (service: OrderShippingService) => ReactNode
  /** Say that the guide comes later (use while the order has no live shipment yet). */
  pending?: boolean
  headingLevel?: 2 | 3 | 4 | 5
  classNames?: ShippingServiceCardClassNames
}

const days = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 365 ? v : null)

/** «Llega en 1 a 3 días hábiles», or `null` without an estimate. */
export function shippingServiceEta(service: Pick<OrderShippingService, 'eta_days_min' | 'eta_days_max'>, m: Record<string, string>): string | null {
  let min = days(service.eta_days_min)
  let max = days(service.eta_days_max)
  if (min != null && max != null && min > max) [min, max] = [max, min]
  if (min != null && max != null) {
    if (max === 0) return m['shippingService.etaSameDay'] ?? null
    if (min === max) return max === 1 ? m['shippingService.etaOne']! : fill(m['shippingService.etaMany']!, { n: max })
    return fill(m['shippingService.etaRange']!, { min, max })
  }
  if (max != null) return max === 1 ? m['shippingService.etaOne']! : fill(m['shippingService.etaUpTo']!, { max })
  if (min != null) return min === 1 ? m['shippingService.etaOne']! : fill(m['shippingService.etaFrom']!, { min })
  return null
}

/** The service to show: the server's `shipping_service`, else the name inside `shipping_method` (`shipping:<name>`). */
export function orderShippingService(order: ShippingServiceCardProps['order']): OrderShippingService | null {
  if (!order || typeof order !== 'object' || order.delivery_method === 'pickup') return null
  const s = order.shipping_service
  if (s && typeof s === 'object' && (str(s.title) || str(s.carrier) || days(s.eta_days_min) != null || days(s.eta_days_max) != null)) return s
  const method = str(order.shipping_method)
  const m = method && /^shipping\s*:\s*(.+)$/i.exec(method)
  return m ? { title: m[1]!.trim() } : null
}

const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export function ShippingServiceCard({ order, service, renderCarrierMark, pending = false, headingLevel = 3, classNames: cx = {}, ...text }: ShippingServiceCardProps) {
  const { m } = useAccountText(text)
  const svc = service ?? orderShippingService(order)
  if (!svc || typeof svc !== 'object') return null
  const carrier = str(svc.carrier)
  const name = str(svc.title) ?? (carrier ? (carrier === carrier.toLowerCase() ? titleCase(carrier) : carrier) : null)
  const eta = shippingServiceEta(svc, m)
  if (!name && !eta) return null
  const Heading = `h${headingLevel}` as 'h3'
  return (
    <div className={cx.root} data-sf-shipping-service {...(carrier ? { 'data-sf-shipping-carrier': carrier } : {})}>
      <div className={cx.header} data-sf-shipping-service-header>
        {renderCarrierMark && (carrier || str(svc.carrier_logo_key)) ? <span data-sf-shipping-service-mark>{renderCarrierMark(svc)}</span> : null}
        <Heading className={cx.title} data-sf-shipping-service-title>
          {name ?? m['shippingService.title']}
        </Heading>
      </div>
      {eta ? (
        <p className={cx.eta} data-sf-shipping-service-eta>
          {eta}
        </p>
      ) : null}
      {pending ? (
        <p className={cx.note} data-sf-shipping-service-pending>
          {m['shippingService.pending']}
        </p>
      ) : null}
    </div>
  )
}

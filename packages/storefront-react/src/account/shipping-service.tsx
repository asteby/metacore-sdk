/**
 * The delivery the buyer chose at checkout, as they saw it: carrier mark, service name and estimated business days.
 * It reads `order.shipping_service` (contract 1.11), so it shows before any guide or tracking exists and next to a
 * sandbox shipment. Any carrier: the mark comes from the `renderCarrierMark` slot (e.g. `<BrandMark brand=... />` from
 * `/checkout`, kept out of this bundle on purpose) and, when the store passes none or the carrier is unknown to it, the
 * name is the only identity. Older servers (no `shipping_service`) fall back to the text of `shipping_method`
 * (`shipping:<service>`); nothing renders when there is nothing to say. Headless: `data-sf-shipping-service-*`.
 */
import type { Order, OrderProgress as OrderProgressData, OrderShippingService, Shipment } from '@asteby/storefront'
import { isTestShipment, orderProgress as deriveProgress, orderShipments, safeTrackingUrl } from '@asteby/storefront'
import { useId, useState, type ReactNode } from 'react'
import { fill } from './orders-messages.js'
import { CopyButton, Hidden, addressLines, str, useAccountText, type AccountTextProps } from './orders-ui.js'
import { OrderProgress } from './progress.js'

export type ShippingServiceCardClassNames = Partial<
  Record<'root' | 'header' | 'title' | 'carrier' | 'eta' | 'note' | 'toggle' | 'detail' | 'list' | 'row' | 'term' | 'value' | 'address' | 'timeline' | 'guide' | 'link' | 'copy', string>
>

/** Steps of the shipping timeline (the payment step belongs to the order, not to the delivery). */
const DELIVERY_STEPS = new Set(['preparing', 'shipped', 'in_transit', 'delivered'])

export type ShippingServiceCardProps = AccountTextProps & {
  /** The order (its `shipping_service`, else `shipping_method`) ... */
  order?: (Pick<Order, 'shipping_service' | 'shipping_method' | 'delivery_method'> & Partial<Pick<Order, 'shipping_address' | 'shipments' | 'progress'>>) | null
  /** ... or the service itself. */
  service?: OrderShippingService | null
  /** Carrier logo/brand mark; called with the logo key (else the carrier text). */
  renderCarrierMark?: (service: OrderShippingService) => ReactNode
  /** Say that the guide comes later (use while the order has no live shipment yet). */
  pending?: boolean
  headingLevel?: 2 | 3 | 4 | 5
  /**
   * Makes the card openable («Ver detalle del envío»): carrier and service, estimate, the delivery address, the shipping
   * timeline (preparing, shipped, on its way, delivered) and, when a live shipment has one, the tracking number with its
   * `https` tracking link; without a guide yet, a clear «we will show it here when your package leaves». Default off:
   * the card stays the summary it always was.
   */
  detail?: boolean
  /** Start open (default closed). */
  defaultOpen?: boolean
  /** Delivery address; default `order.shipping_address`. */
  address?: Record<string, unknown> | null
  /** Shipments of the order; default `order.shipments`. Sandbox shipments never print a guide or a link. */
  shipments?: readonly Shipment[] | null
  /** Progress; default `order.progress`, else derived from the order when it is a full `Order`. */
  progress?: OrderProgressData | null
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

export function ShippingServiceCard({ order, service, renderCarrierMark, pending = false, headingLevel = 3, detail = false, defaultOpen = false, address, shipments, progress, classNames: cx = {}, ...text }: ShippingServiceCardProps) {
  const { m } = useAccountText(text)
  const [open, setOpen] = useState(defaultOpen)
  const regionId = `sf-shp-detail-${useId().replace(/:/g, '')}`
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
      {detail ? (
        <>
          <button type="button" className={cx.toggle} aria-expanded={open} aria-controls={regionId} onClick={() => setOpen((v) => !v)} data-sf-shipping-service-toggle>
            {open ? m['shippingService.hide'] : m['shippingService.view']}
          </button>
          <div id={regionId} hidden={!open} className={cx.detail} data-sf-shipping-service-detail>
            {open ? renderDetail() : null}
          </div>
        </>
      ) : null}
    </div>
  )

  function renderDetail() {
    const lines = addressLines(address ?? order?.shipping_address)
    const live = orderShipments({ shipments: (shipments ?? order?.shipments ?? undefined) as Shipment[] | undefined }).filter((s) => s.kind !== 'return')
    const real = live.filter((s) => !isTestShipment(s))
    const onlyTest = live.length > 0 && real.length === 0
    const prog = progress ?? order?.progress ?? (order && typeof order === 'object' && 'status' in order && 'id' in order ? deriveProgress(order as Order) : null)
    const delivery = prog && Array.isArray(prog.steps) ? { ...prog, steps: prog.steps.filter((s) => s && DELIVERY_STEPS.has(s.key)) } : null
    const SubHeading = `h${Math.min(headingLevel + 1, 6)}` as 'h4'
    const row = (key: string, term: string, value: ReactNode) =>
      value ? (
        <div key={key} className={cx.row} data-sf-shipping-field={key}>
          <dt className={cx.term}>{term}</dt>
          <dd className={cx.value}>{value}</dd>
        </div>
      ) : null
    return (
      <>
        <dl className={cx.list}>
          {row('carrier', m['shippingService.carrier'], carrier && name && carrier.toLowerCase() !== name.toLowerCase() ? (carrier === carrier.toLowerCase() ? titleCase(carrier) : carrier) : null)}
          {row('service', m['shippingService.service'], name)}
          {row('eta', m['shippingService.eta'], eta)}
          {row('address', m['shippingService.address'], lines.length ? (
            <address className={cx.address} data-sf-shipping-address>
              {lines.map((l, i) => (
                <span key={i}>
                  {l}
                  {i < lines.length - 1 ? <br /> : null}
                </span>
              ))}
            </address>
          ) : null)}
        </dl>
        {lines.length === 0 ? (
          <p className={cx.note} data-sf-shipping-no-address>
            {m['shippingService.noAddress']}
          </p>
        ) : null}
        {delivery && delivery.steps.length > 0 && delivery.stage !== 'cancelled' && delivery.stage !== 'refunded' && delivery.stage !== 'pending_payment' ? (
          <div className={cx.timeline} data-sf-shipping-timeline>
            <SubHeading>{m['shippingService.timeline']}</SubHeading>
            <OrderProgress progress={delivery} {...text} />
          </div>
        ) : null}
        {real.length > 0 ? (
          real.map((s) => {
            const number = str(s.tracking_number)
            const url = safeTrackingUrl(s.tracking_url)
            return number || url ? (
              <div key={s.id} className={cx.guide} data-sf-shipping-guide>
                {number ? (
                  <p>
                    <span>{m['shippingService.guide']}: </span>
                    <code>{number}</code>{' '}
                    <CopyButton value={number} label={m['shipment.copy']} copiedLabel={m['shipment.copied']} failedLabel={m['shipment.copyFailed']} ariaLabel={`${m['shipment.copy']} ${m['shippingService.guide']}`} className={cx.copy} data-sf-copy="tracking" />
                  </p>
                ) : null}
                {url ? (
                  <p>
                    <a href={url} target="_blank" rel="noopener noreferrer" className={cx.link} data-sf-shipping-track>
                      {m['shippingService.track']}
                      <Hidden> {m['action.newTab']}</Hidden>
                    </a>
                  </p>
                ) : null}
              </div>
            ) : null
          })
        ) : (
          <p className={cx.note} data-sf-shipping-no-guide>
            {onlyTest ? m['shippingService.testGuide'] : m['shippingService.noGuide']}
          </p>
        )}
      </>
    )
  }
}

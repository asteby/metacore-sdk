/**
 * The full shipping page of an order (`/cuenta/pedidos/:id/envio`): carrier and service, estimate, the delivery address,
 * the shipping timeline with its dates, then — per real package — the tracking number (copy), the `https` tracking link,
 * the map (slot) and the carrier's movements, and a help block (slot). It is the ONLY place that prints these; the order
 * shows `ShipmentSummaryCard`. A sandbox shipment never prints a guide or a link, and it does not repeat the sandbox
 * notice: the page shows `OrderSandboxNotice` once. Headless (`data-sf-shipment-detail*`, `classNames`).
 */
import type { Order, OrderProgress as OrderProgressData, OrderShippingService, Shipment } from '@asteby/storefront'
import { isTestShipment, orderProgress as deriveProgress, orderShipments, safeTrackingUrl, sortTrackingEvents } from '@asteby/storefront'
import { useId, type ReactNode } from 'react'
import { enumText } from './orders-messages.js'
import { OrderProgress } from './progress.js'
import type { ShipmentMapSlotProps } from './shipment.js'
import { orderShippingService, shippingServiceEta } from './shipping-service.js'
import { CopyButton, Hidden, Time, addressLines, str, useAccountText, type AccountTextProps } from './orders-ui.js'

export type ShipmentDetailClassNames = Partial<
  Record<'root' | 'section' | 'title' | 'mark' | 'list' | 'row' | 'term' | 'value' | 'address' | 'note' | 'guide' | 'copy' | 'link' | 'events' | 'event' | 'map' | 'help' | 'error' | 'retry' | 'empty', string>
>

export type ShipmentDetailProps = AccountTextProps & {
  order: Pick<Order, 'delivery_method' | 'shipping_service' | 'shipping_method'> & Partial<Pick<Order, 'shipping_address' | 'shipments' | 'progress'>> & { id?: string; status?: string }
  shipments?: readonly Shipment[] | null
  progress?: OrderProgressData | null
  renderCarrierMark?: (service: OrderShippingService) => ReactNode
  renderMap?: (props: ShipmentMapSlotProps) => ReactNode
  /** Help block content (e.g. a link to contact the store). The block is omitted without it. */
  help?: ReactNode
  /** The server could not read the shipments (`order.degraded`). */
  degraded?: boolean
  onRetry?: () => void
  headingLevel?: 2 | 3
  classNames?: ShipmentDetailClassNames
}

const DELIVERY_STEPS = new Set(['preparing', 'shipped', 'in_transit', 'delivered'])
const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export function ShipmentDetail({ order, shipments, progress, renderCarrierMark, renderMap, help, degraded, onRetry, headingLevel = 2, classNames: cx = {}, ...text }: ShipmentDetailProps) {
  const { m, t, date } = useAccountText(text)
  const uid = useId().replace(/:/g, '')
  const H = `h${headingLevel}` as 'h2'
  const Sub = `h${headingLevel + 1}` as 'h3'
  const svc = orderShippingService(order)
  const all = orderShipments({ shipments: (shipments ?? order.shipments ?? undefined) as Shipment[] | undefined }).filter((s) => s.kind !== 'return')
  const real = all.filter((s) => !isTestShipment(s))

  if (order.delivery_method === 'pickup' || (!svc && all.length === 0 && !degraded)) {
    return (
      <div className={cx.root} data-sf-shipment-detail data-sf-shipment-detail-state="none">
        <p className={cx.empty}>{m['shipmentPage.none']}</p>
      </div>
    )
  }

  const carrier = str(svc?.carrier) ?? str(all[0]?.carrier)
  const name = str(svc?.title) ?? (carrier ? (carrier === carrier.toLowerCase() ? titleCase(carrier) : carrier) : null)
  const carrierText = carrier ? (carrier === carrier.toLowerCase() ? titleCase(carrier) : carrier) : null
  const eta = svc ? shippingServiceEta(svc, m as unknown as Record<string, string>) : null
  const lines = addressLines(order.shipping_address)
  const prog = progress ?? order.progress ?? (order.id && order.status ? deriveProgress(order as Order) : null)
  const delivery = prog && Array.isArray(prog.steps) ? { ...prog, steps: prog.steps.filter((s) => s && DELIVERY_STEPS.has(s.key)) } : null
  const showTimeline = !!delivery && delivery.steps.length > 0 && !['cancelled', 'refunded', 'pending_payment'].includes(delivery.stage)
  const row = (key: string, term: string, value: ReactNode) =>
    value ? (
      <div key={key} className={cx.row} data-sf-shipping-field={key}>
        <dt className={cx.term}>{term}</dt>
        <dd className={cx.value}>{value}</dd>
      </div>
    ) : null

  return (
    <div className={cx.root} data-sf-shipment-detail data-sf-shipment-detail-state="ready">
      {degraded ? (
        <div className={cx.error} role="alert" data-sf-section-error="shipments">
          <p>{m['shipmentPage.error']}</p>
          {onRetry ? (
            <button type="button" className={cx.retry} onClick={onRetry} data-sf-retry>
              {m['section.retry']}
            </button>
          ) : null}
        </div>
      ) : null}

      <section className={cx.section} aria-labelledby={`${uid}-delivery`} data-sf-shipment-section="delivery">
        <H id={`${uid}-delivery`} className={cx.title}>
          {m['shipmentPage.delivery']}
        </H>
        <dl className={cx.list}>
          {row('carrier', m['shippingService.carrier'], carrierText ? (
            <span className={cx.mark}>
              {svc && renderCarrierMark ? renderCarrierMark(svc) : null} {carrierText}
            </span>
          ) : null)}
          {row('service', m['shippingService.service'], name && name !== carrierText ? name : null)}
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
        {lines.length === 0 ? <p className={cx.note} data-sf-shipping-no-address>{m['shippingService.noAddress']}</p> : null}
      </section>

      {showTimeline ? (
        <section className={cx.section} aria-labelledby={`${uid}-timeline`} data-sf-shipment-section="timeline">
          <H id={`${uid}-timeline`} className={cx.title}>
            {m['shipmentPage.timeline']}
          </H>
          <OrderProgress progress={delivery!} {...text} />
        </section>
      ) : null}

      {real.length === 0 ? (
        <section className={cx.section} aria-labelledby={`${uid}-tracking`} data-sf-shipment-section="tracking">
          <H id={`${uid}-tracking`} className={cx.title}>
            {m['shipmentPage.tracking']}
          </H>
          <p className={cx.note} data-sf-shipping-no-guide>
            {all.length > 0 ? m['shippingService.noGuide'] : m['shipmentPage.preparingBody']}
          </p>
        </section>
      ) : (
        real.map((s, i) => {
          const number = str(s.tracking_number)
          const url = safeTrackingUrl(s.tracking_url)
          const events = sortTrackingEvents(s.events)
          const promised = s.status !== 'delivered' ? date(s.promised_by) : null
          const delivered = date(s.delivered_at)
          const shipped = date(s.shipped_at)
          const id = `${uid}-pkg-${i}`
          return (
            <section key={s.id} className={cx.section} aria-labelledby={id} data-sf-shipment-section="package" data-sf-shipment-status={typeof s.status === 'string' ? s.status : 'unknown'}>
              <H id={id} className={cx.title}>
                {real.length > 1 ? t('shipmentPage.package', { n: i + 1, total: real.length }) : m['shipmentPage.tracking']}
                {real.length > 1 ? (
                  <>
                    {' · '}
                    <span data-sf-shipment-state>{enumText(m, 'shipment.status', s.status)}</span>
                  </>
                ) : null}
              </H>
              <dl className={cx.list}>
                {row('number', m['shippingService.guide'], number ? (
                  <span className={cx.guide} data-sf-shipping-guide>
                    <code>{number}</code>{' '}
                    <CopyButton value={number} label={m['shipment.copy']} copiedLabel={m['shipment.copied']} failedLabel={m['shipment.copyFailed']} ariaLabel={`${m['shipment.copy']} ${m['shippingService.guide']}`} className={cx.copy} data-sf-copy="tracking" />
                  </span>
                ) : null)}
                {row('dates', m['shipmentPage.delivery'], delivered ? <Time value={s.delivered_at} text={t('shipment.delivered', { date: delivered })} /> : promised ? <Time value={s.promised_by} text={t('shipment.promised', { date: promised })} /> : shipped ? <Time value={s.shipped_at} text={t('shipmentPage.shippedOn', { date: shipped })} /> : null)}
              </dl>
              {url ? (
                <p>
                  <a href={url} target="_blank" rel="noopener noreferrer" className={cx.link} data-sf-shipping-track>
                    {carrier ? t('shipment.track', { carrier }) : m['shippingService.track']}
                    <Hidden> {m['action.newTab']}</Hidden>
                  </a>
                </p>
              ) : null}
              {renderMap && s.map ? (
                <div className={cx.map} data-sf-shipment-map-slot>
                  {renderMap({ shipment: s, map: s.map })}
                </div>
              ) : null}
              <Sub>{m['shipmentPage.events']}</Sub>
              {events.length === 0 ? (
                <p className={cx.note} data-sf-shipment-empty>
                  {m['shipment.noEvents']}
                </p>
              ) : (
                <ol className={cx.events} data-sf-shipment-events>
                  {events.map((e, k) => {
                    const description = str(e.description)
                    const location = str(e.location)
                    return (
                      <li key={`${str(e.id) ?? ''}-${k}`} className={cx.event} data-sf-event-status={typeof e.status === 'string' ? e.status : 'unknown'}>
                        <span data-sf-event-state>{enumText(m, 'shipment.status', e.status)}</span>
                        {description ? <span> · {description}</span> : null}
                        {location ? <span> · {location}</span> : null} <Time value={e.occurred_at} text={date(e.occurred_at, 'datetime')} />
                      </li>
                    )
                  })}
                </ol>
              )}
            </section>
          )
        })
      )}

      {help ? (
        <section className={cx.help} aria-labelledby={`${uid}-help`} data-sf-shipment-section="help">
          <H id={`${uid}-help`} className={cx.title}>
            {m['shipmentPage.helpTitle']}
          </H>
          <p className={cx.note}>{m['shipmentPage.helpBody']}</p>
          {help}
        </section>
      ) : null}
    </div>
  )
}

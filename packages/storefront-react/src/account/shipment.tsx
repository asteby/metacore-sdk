/**
 * One shipment as the buyer sees it: carrier, status in words, tracking number (copy) and `https` link, promised date
 * and the carrier's events newest first. Headless (`data-sf-shipment-*`, `classNames`). Privacy rules enforced here
 * too, not only on the server: only a RETURN shipment may show its label link, a sandbox (`test_mode`) shipment is
 * hidden or marked "test" (never shown with a tracking number or link as if it were real), links must be `https`.
 *
 * The map is NOT here: `renderMap` is the slot the map component fills (it receives the approximate points; the event
 * list below is always rendered and is the text equivalent of the map).
 */
import type { Shipment, ShipmentMap } from '@asteby/storefront'
import { isTestShipment, safeTrackingUrl, sortTrackingEvents } from '@asteby/storefront'
import { useId, useState, type ReactNode } from 'react'
import { enumText } from './orders-messages.js'
import { TrackingEventList } from '../tracking/timeline.js'
import { CopyButton, Hidden, Time, str, useAccountText, type AccountTextProps } from './orders-ui.js'

export type ShipmentCardClassNames = Partial<
  Record<'root' | 'header' | 'carrier' | 'status' | 'meta' | 'number' | 'actions' | 'link' | 'copy' | 'events' | 'event' | 'toggle' | 'empty' | 'test' | 'map' | 'detail', string>
>

/** What `renderMap` receives. */
export type ShipmentMapSlotProps = { shipment: Shipment; map: ShipmentMap }

export type ShipmentCardProps = AccountTextProps & {
  shipment: Shipment
  /** A sandbox shipment: `hide` (default) renders nothing; `mark` shows it labelled "test", without number or link. */
  testMode?: 'hide' | 'mark'
  /** How many events show before "Show all". Default 3. */
  eventsPreview?: number
  /** The carrier's logo/brand mark (e.g. `<BrandMark brand={shipment.carrier_logo_key} />` from `/checkout`); kept out of this bundle on purpose. */
  renderCarrierMark?: (shipment: Shipment) => ReactNode
  /** Slot for the map (F7). Called only when the shipment has a `map`. */
  renderMap?: (props: ShipmentMapSlotProps) => ReactNode
  /**
   * Makes the card openable: the carrier, status, guide and dates stay visible and the map and the carrier's events
   * (the detail) open with «Ver detalle del envío». Default off: everything shows, as before.
   */
  collapsible?: boolean
  /** Start open when `collapsible` (default closed). */
  defaultOpen?: boolean
  /** Heading level of the title (default 3). */
  headingLevel?: 2 | 3 | 4 | 5
  classNames?: ShipmentCardClassNames
}

export function ShipmentCard({ shipment, testMode = 'hide', eventsPreview = 3, renderCarrierMark, renderMap, collapsible = false, defaultOpen = false, headingLevel = 3, classNames: cx = {}, ...text }: ShipmentCardProps) {
  const { m, t, date } = useAccountText(text)
  const [open, setOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(defaultOpen)
  const id = useId().replace(/:/g, '')
  if (!shipment || typeof shipment !== 'object') return null
  const test = isTestShipment(shipment)
  if (test && testMode === 'hide') return null

  const isReturn = shipment.kind === 'return'
  const Heading = `h${headingLevel}` as 'h3'
  const SubHeading = `h${headingLevel + 1}` as 'h4'
  const carrier = str(shipment.carrier)
  const service = test ? null : str(shipment.service)
  const number = test ? null : str(shipment.tracking_number)
  const trackUrl = test ? null : safeTrackingUrl(shipment.tracking_url)
  const labelUrl = isReturn && !test ? safeTrackingUrl(shipment.label_url) : null
  const events = test ? [] : sortTrackingEvents(shipment.events)
  const shown = open ? events : events.slice(0, Math.max(1, eventsPreview))
  const status = test ? m['shipment.preparing'] : enumText(m, 'shipment.status', shipment.status)
  const promised = !test && shipment.status !== 'delivered' ? date(shipment.promised_by) : null
  const delivered = !test ? date(shipment.delivered_at) : null
  const shipped = !test && !delivered ? date(shipment.shipped_at) : null
  const titleId = `sf-shp-${id}`
  const eventsId = `sf-shp-ev-${id}`
  const detailId = `sf-shp-detail-${id}`

  return (
    <article className={cx.root} aria-labelledby={titleId} data-sf-shipment data-sf-shipment-status={test ? 'test' : typeof shipment.status === 'string' ? shipment.status : 'unknown'} data-sf-shipment-kind={isReturn ? 'return' : 'outbound'} {...(test ? { 'data-sf-test': '' } : {})}>
      <header className={cx.header} data-sf-shipment-header>
        {renderCarrierMark && !test ? <span data-sf-shipment-mark>{renderCarrierMark(shipment)}</span> : null}
        <Heading id={titleId} className={cx.carrier} data-sf-shipment-title>
          {carrier && !test ? (
            <span data-sf-shipment-eyebrow>
              {m['shipment.carrier']}
              <Hidden>: </Hidden>
            </span>
          ) : null}
          {isReturn ? m['shipment.return'] : (carrier ?? m['shipment.title'])}
          {isReturn && carrier ? <> · {carrier}</> : null}
        </Heading>
        <span className={cx.status} data-sf-shipment-state>
          {status}
        </span>
        {test ? (
          <span className={cx.test} data-sf-shipment-test>
            {m['shipment.test']}
          </span>
        ) : null}
      </header>
      {test ? (
        <p className={cx.meta} data-sf-shipment-test-note>
          {m['shipment.testNote']}
        </p>
      ) : null}
      {service ? (
        <p className={cx.meta} data-sf-shipment-service>
          {m['shipment.service']}: {service}
        </p>
      ) : null}
      {number ? (
        <p className={cx.number} data-sf-shipment-number>
          <span>{m['shipment.number']}: </span>
          <code>{number}</code>{' '}
          <CopyButton value={number} label={m['shipment.copy']} copiedLabel={m['shipment.copied']} failedLabel={m['shipment.copyFailed']} ariaLabel={`${m['shipment.copy']} ${m['shipment.number']}`} className={cx.copy} data-sf-copy="tracking" />
        </p>
      ) : null}
      {promised || delivered || shipped ? (
        <p className={cx.meta} data-sf-shipment-dates>
          {delivered ? (
            <Time value={shipment.delivered_at} text={t('shipment.delivered', { date: delivered })} />
          ) : promised ? (
            <Time value={shipment.promised_by} text={t('shipment.promised', { date: promised })} />
          ) : (
            <Time value={shipment.shipped_at} text={t('shipment.shipped', { date: shipped ?? '' })} />
          )}
        </p>
      ) : null}
      {trackUrl || labelUrl ? (
        <p className={cx.actions} data-sf-shipment-actions>
          {trackUrl ? (
            <a href={trackUrl} target="_blank" rel="noopener noreferrer" className={cx.link} data-sf-shipment-track>
              {carrier ? t('shipment.track', { carrier }) : m['shipment.trackGeneric']}
              <Hidden> {m['action.newTab']}</Hidden>
            </a>
          ) : null}
          {labelUrl ? (
            <a href={labelUrl} target="_blank" rel="noopener noreferrer" className={cx.link} data-sf-shipment-label>
              {m['shipment.returnLabel']}
              <Hidden> {m['action.newTab']}</Hidden>
            </a>
          ) : null}
        </p>
      ) : null}
      {collapsible && !test && (shipment.map || events.length > 0) ? (
        <button type="button" className={cx.toggle} aria-expanded={detailOpen} aria-controls={detailId} onClick={() => setDetailOpen((v) => !v)} data-sf-shipment-detail-toggle>
          {detailOpen ? m['shippingService.hide'] : m['shippingService.view']}
        </button>
      ) : null}
      <div id={detailId} className={cx.detail} {...(collapsible && !test && !detailOpen ? { hidden: true } : {})} data-sf-shipment-detail>
      {renderMap && !test && shipment.map ? (
          <div className={cx.map} data-sf-shipment-map-slot>
            {renderMap({ shipment, map: shipment.map })}
          </div>
        ) : null}
        {!test ? (
          events.length === 0 ? (
            <p className={cx.empty} data-sf-shipment-empty>
              {m['shipment.noEvents']}
            </p>
          ) : (
            <div data-sf-shipment-events-wrap>
              <SubHeading className={cx.meta} data-sf-shipment-events-title>
                {m['shipment.events']}
              </SubHeading>
              <TrackingEventList events={shown} m={m} date={date} id={eventsId} className={cx.events} itemClassName={cx.event} />
              {events.length > Math.max(1, eventsPreview) ? (
                <button type="button" className={cx.toggle} aria-expanded={open} aria-controls={eventsId} onClick={() => setOpen((v) => !v)} data-sf-shipment-toggle>
                  {open ? m['shipment.showLess'] : t('shipment.showAll', { count: events.length })}
                </button>
              ) : null}
            </div>
          )
        ) : null}
      </div>
    </article>
  )
}

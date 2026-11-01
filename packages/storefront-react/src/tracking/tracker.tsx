/**
 * Where is my parcel: status, carrier, the guide (copy) and its `https` tracking link, the estimated arrival, the scans
 * and, optionally, a map. Independent of the carrier (Skydropx, Emissary, 99minutos, Envía…) and of the store: it renders
 * one `Shipment` (of an order or of the public lookup) and nothing else. Given the whole public `TrackingView`
 * (`{ order_number, status, shipments[] }`) it renders `TrackingResult`: every visible shipment, or the "confirmed, no
 * guide yet" state. Loading, empty, error and exception states are part of the component; an exception is announced as a
 * status, not as a failure. No `StorefrontProvider` needed. Headless: `data-sf-tracker*` hooks and `classNames`. Never
 * prints a `label_url`.
 */
import type { LegacyTrackingView, Shipment, TrackingView } from '@asteby/storefront'
import { normalizeTrackingView, safeTrackingUrl, visibleTrackingShipments } from '@asteby/storefront'
import { useId, type ReactNode } from 'react'
import { enumText } from '../account/orders-messages.js'
import { CopyButton, Hidden, str } from '../account/orders-ui.js'
import { TrackingMap, type TrackingMapsLoader } from './map.js'
import { useTrackingPoints, type TrackingGeocoder } from './points.js'
import { useTrackingText, type TrackingTextProps } from './text.js'
import { TrackingTimeline } from './timeline.js'

export type TrackerState = 'loading' | 'empty' | 'error' | 'ready'

export type ShipmentTrackerClassNames = Partial<
  Record<'root' | 'header' | 'title' | 'mark' | 'carrier' | 'exception' | 'list' | 'row' | 'term' | 'value' | 'guide' | 'copy' | 'link' | 'map' | 'timeline' | 'empty' | 'error' | 'retry' | 'loading', string>
>

/** One parcel: a `Shipment`, or the deprecated flat tracking shape. */
type Parcel = Shipment | LegacyTrackingView

export type ShipmentTrackerProps = TrackingTextProps & {
  /**
   * The shipment of an order, or the whole public lookup result (`TrackingView`, rendered with `TrackingResult`). The
   * deprecated flat shape (`LegacyTrackingView`) still renders as one shipment.
   */
  tracking?: TrackingView | Shipment | LegacyTrackingView | null
  /** Forced state; derived from `tracking` when omitted (nothing → `empty`, scans or a guide → `ready`). */
  state?: TrackerState
  onRetry?: () => void
  renderCarrierMark?: (tracking: Parcel) => ReactNode
  /** Replaces the whole map block (your own map). Called only with at least one point. */
  renderMap?: (props: { tracking: Parcel; points: ReturnType<typeof useTrackingPoints> }) => ReactNode
  /** `() => import('@asteby/metacore-maps')`: draws the route when the scans carry coordinates (or `geocode` finds them). Omit for no map. */
  loadMaps?: TrackingMapsLoader
  /** Turns a place text into a point so a carrier that reports only city names can still be drawn. */
  geocode?: TrackingGeocoder
  mapHeight?: number | string
  headingLevel?: 2 | 3 | 4 | 5 | 6
  /** Text before the status in the title (`TrackingResult` passes "Envío 1 de 2" when an order travels in several). */
  label?: string
  classNames?: ShipmentTrackerClassNames
}

const PROBLEM = new Set(['exception', 'lost', 'returned'])
const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

function deriveState(t: Parcel | null | undefined): TrackerState {
  if (!t) return 'empty'
  const hasEvents = Array.isArray(t.events) && t.events.length > 0
  return hasEvents || str(t.tracking_number) ? 'ready' : 'empty'
}

const isTrackingView = (t: unknown): t is TrackingView => typeof t === 'object' && t !== null && Array.isArray((t as TrackingView).shipments)

export function ShipmentTracker(props: ShipmentTrackerProps) {
  const { tracking, state } = props
  if (isTrackingView(tracking) && state !== 'loading' && state !== 'error') {
    const { tracking: _t, state: _s, label: _l, headingLevel, classNames: _c, locale, timeZone, messages, ...rest } = props
    return (
      <TrackingResult
        tracking={tracking}
        {...(headingLevel ? { headingLevel } : {})}
        {...(locale ? { locale } : {})}
        {...(timeZone ? { timeZone } : {})}
        {...(messages ? { messages } : {})}
        trackerProps={{ ...rest, ...(props.classNames ? { classNames: props.classNames } : {}) }}
      />
    )
  }
  return <ParcelTracker {...props} tracking={isTrackingView(tracking) ? null : tracking} />
}

export type TrackingResultClassNames = Partial<Record<'root' | 'title' | 'pending' | 'count' | 'list' | 'item', string>>

export type TrackingResultProps = TrackingTextProps & {
  /** What `tracking.lookup` found (the deprecated flat shape is folded into one shipment). */
  tracking: TrackingView | LegacyTrackingView
  /** Level of the order title (`Pedido SO-1`); each shipment's title goes one level below it. */
  headingLevel?: 2 | 3 | 4 | 5 | 6
  /** Props of every shipment's `ShipmentTracker` (map loader, geocoder, carrier mark, classNames…). */
  trackerProps?: Omit<ShipmentTrackerProps, 'tracking' | 'locale' | 'messages' | 'timeZone' | 'headingLevel' | 'label'>
  classNames?: TrackingResultClassNames
}

/**
 * The answer of the public lookup: the order number, then each shipment the buyer may see (its own status, guide,
 * map and timeline), or — when the order is confirmed but has no parcel yet — a plain "no guide yet" status instead of
 * an empty tracker. A sandbox (`test_mode`) shipment is never shown. `data-sf-tracking-order-state` is `pending`,
 * `cancelled` or `shipments`.
 */
export function TrackingResult({ tracking, headingLevel = 2, trackerProps, classNames: cx = {}, ...text }: TrackingResultProps) {
  const { tm, tt } = useTrackingText(text)
  const view = normalizeTrackingView(tracking)
  const ships = visibleTrackingShipments(view)
  const number = view?.order_number ?? null
  const H = `h${headingLevel}` as 'h2'
  const sub = (number ? Math.min(headingLevel + 1, 6) : headingLevel) as 2 | 3 | 4 | 5 | 6
  const state = ships.length ? 'shipments' : view?.status === 'cancelled' ? 'cancelled' : 'pending'
  const shared = { ...trackerProps, ...(text.locale ? { locale: text.locale } : {}), ...(text.timeZone ? { timeZone: text.timeZone } : {}), ...(text.messages ? { messages: text.messages } : {}) }
  return (
    <div className={cx.root} data-sf-tracking-order data-sf-tracking-order-state={state} data-sf-tracking-shipments={ships.length}>
      {number ? (
        <H className={cx.title} data-sf-tracking-order-title>
          {tt('result.order', { number })}
        </H>
      ) : null}
      {ships.length === 0 ? (
        <p className={cx.pending} role="status" data-sf-tracking-pending={state}>
          {state === 'cancelled' ? tm['result.cancelled'] : tm['result.pending']}
        </p>
      ) : ships.length === 1 ? (
        <ParcelTracker {...shared} tracking={ships[0]!} headingLevel={sub} />
      ) : (
        <>
          <p className={cx.count} data-sf-tracking-count>
            {tt('result.count', { count: ships.length })}
          </p>
          <ol className={cx.list} data-sf-tracking-list>
            {ships.map((s, i) => (
              <li key={s.id || i} className={cx.item} data-sf-tracking-item>
                <ParcelTracker {...shared} tracking={s} headingLevel={sub} label={tt('result.shipment', { index: i + 1, count: ships.length })} />
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}

function ParcelTracker({ tracking, state, onRetry, renderCarrierMark, renderMap, loadMaps, geocode, mapHeight, headingLevel = 2, label, classNames: cx = {}, ...text }: Omit<ShipmentTrackerProps, 'tracking'> & { tracking?: Parcel | null | undefined }) {
  const { m, tm, tt, locale, date } = useTrackingText(text)
  const uid = useId().replace(/:/g, '')
  const H = `h${headingLevel}` as 'h2'
  const points = useTrackingPoints(tracking, geocode)
  const current = state ?? deriveState(tracking)
  const root = { className: cx.root, 'data-sf-tracker': '', 'data-sf-tracker-state': current }

  if (current === 'loading') {
    return (
      <div {...root} aria-busy="true">
        <p className={cx.loading} role="status" data-sf-tracker-loading>
          {tm['tracker.loading']}
        </p>
      </div>
    )
  }
  if (current === 'error') {
    return (
      <div {...root}>
        <div className={cx.error} role="alert" data-sf-tracker-error>
          <p>{tm['tracker.error']}</p>
          {onRetry ? (
            <button type="button" className={cx.retry} onClick={onRetry} data-sf-tracker-retry>
              {tm['tracker.retry']}
            </button>
          ) : null}
        </div>
      </div>
    )
  }
  if (current === 'empty' || !tracking) {
    return (
      <div {...root}>
        {label ? <p data-sf-tracker-label>{label}</p> : null}
        <p className={cx.empty} data-sf-tracker-empty>
          {tm['tracker.empty']}
        </p>
      </div>
    )
  }

  const status = typeof tracking.status === 'string' ? tracking.status : 'unknown'
  const problem = PROBLEM.has(status)
  const carrierRaw = str(tracking.carrier)
  const carrier = carrierRaw ? (carrierRaw === carrierRaw.toLowerCase() ? titleCase(carrierRaw) : carrierRaw) : null
  const guide = str(tracking.tracking_number)
  const url = safeTrackingUrl(tracking.tracking_url)
  const eta = 'eta' in tracking ? str((tracking as LegacyTrackingView).eta) : str((tracking as Shipment).promised_by)
  const etaText = status === 'delivered' ? null : date(eta)
  const updated = 'updated_at' in tracking ? date(str((tracking as LegacyTrackingView).updated_at), 'datetime') : null
  const titleId = `sf-trk-${uid}`

  return (
    <section {...root} aria-labelledby={titleId} data-sf-tracker-status={status}>
      <header className={cx.header} data-sf-tracker-header>
        {renderCarrierMark ? (
          <span className={cx.mark} data-sf-tracker-mark>
            {renderCarrierMark(tracking)}
          </span>
        ) : null}
        <H id={titleId} className={cx.title} data-sf-tracker-title>
          {label ? <span data-sf-tracker-label>{label}: </span> : null}
          {enumText(m, 'shipment.status', status)}
        </H>
      </header>
      {problem ? (
        <p className={cx.exception} role="status" data-sf-tracker-exception>
          {tm['tracker.exception']}
        </p>
      ) : null}
      <dl className={cx.list} data-sf-tracker-list>
        {carrier ? (
          <div className={cx.row}>
            <dt className={cx.term}>{tm['tracker.carrier']}</dt>
            <dd className={cx.value} data-sf-tracker-carrier>
              {carrier}
            </dd>
          </div>
        ) : null}
        {guide ? (
          <div className={cx.row}>
            <dt className={cx.term}>{tm['tracker.guide']}</dt>
            <dd className={cx.value}>
              <span className={cx.guide} data-sf-tracker-guide>
                {guide}
              </span>{' '}
              <CopyButton value={guide} label={tm['tracker.copy']} copiedLabel={tm['tracker.copied']} failedLabel={tm['tracker.copyFailed']} ariaLabel={`${tm['tracker.copy']} ${tm['tracker.guide']} ${guide}`} className={cx.copy} />
            </dd>
          </div>
        ) : null}
        {etaText ? (
          <div className={cx.row}>
            <dt className={cx.term}>{tm['tracker.eta']}</dt>
            <dd className={cx.value} data-sf-tracker-eta>
              {etaText}
            </dd>
          </div>
        ) : null}
        {updated ? (
          <div className={cx.row}>
            <dt className={cx.term}>{tm['tracker.updated']}</dt>
            <dd className={cx.value}>{updated}</dd>
          </div>
        ) : null}
      </dl>
      {url ? (
        <p>
          <a className={cx.link} href={url} target="_blank" rel="noopener noreferrer" data-sf-tracker-link>
            {carrier ? tt('tracker.track', { carrier }) : tm['tracker.trackGeneric']}
            <Hidden> ↗</Hidden>
          </a>
        </p>
      ) : null}
      {points.length > 0 ? (
        renderMap ? (
          renderMap({ tracking, points })
        ) : loadMaps ? (
          <TrackingMap points={points} loadMaps={loadMaps} label={tm['tracker.map']} loadingLabel={tm['tracker.mapLoading']} locale={locale} {...(mapHeight !== undefined ? { height: mapHeight } : {})} {...(cx.map ? { className: cx.map } : {})} />
        ) : null
      ) : null}
      <div className={cx.timeline} data-sf-tracker-timeline>
        <TrackingTimeline events={Array.isArray(tracking.events) ? tracking.events : []} locale={locale} {...(text.timeZone ? { timeZone: text.timeZone } : {})} {...(text.messages ? { messages: text.messages } : {})} />
      </div>
    </section>
  )
}

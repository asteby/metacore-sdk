/**
 * Where is my parcel: status, carrier, the guide (copy) and its `https` tracking link, the estimated arrival, the scans
 * and, optionally, a map. Independent of the carrier (Skydropx, Emissary, 99minutos, Envía…) and of the store: it renders
 * a `TrackingView` (or the `Shipment` an order carries) and nothing else. Loading, empty, error and exception states are
 * part of the component; an exception is announced as a status, not as a failure. No `StorefrontProvider` needed.
 * Headless: `data-sf-tracker*` hooks and `classNames`. Never prints a `label_url`.
 */
import type { Shipment, TrackingView } from '@asteby/storefront'
import { safeTrackingUrl } from '@asteby/storefront'
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

export type ShipmentTrackerProps = TrackingTextProps & {
  /** A public lookup result, or the shipment of an order (`Shipment` is a `TrackingView` plus ids). */
  tracking?: TrackingView | Shipment | null
  /** Forced state; derived from `tracking` when omitted (nothing → `empty`, scans or a guide → `ready`). */
  state?: TrackerState
  onRetry?: () => void
  renderCarrierMark?: (tracking: TrackingView | Shipment) => ReactNode
  /** Replaces the whole map block (your own map). Called only with at least one point. */
  renderMap?: (props: { tracking: TrackingView | Shipment; points: ReturnType<typeof useTrackingPoints> }) => ReactNode
  /** `() => import('@asteby/metacore-maps')`: draws the route when the scans carry coordinates (or `geocode` finds them). Omit for no map. */
  loadMaps?: TrackingMapsLoader
  /** Turns a place text into a point so a carrier that reports only city names can still be drawn. */
  geocode?: TrackingGeocoder
  mapHeight?: number | string
  headingLevel?: 2 | 3 | 4
  classNames?: ShipmentTrackerClassNames
}

const PROBLEM = new Set(['exception', 'lost', 'returned'])
const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

function deriveState(t: TrackingView | Shipment | null | undefined): TrackerState {
  if (!t) return 'empty'
  const hasEvents = Array.isArray(t.events) && t.events.length > 0
  return hasEvents || str(t.tracking_number) ? 'ready' : 'empty'
}

export function ShipmentTracker({ tracking, state, onRetry, renderCarrierMark, renderMap, loadMaps, geocode, mapHeight, headingLevel = 2, classNames: cx = {}, ...text }: ShipmentTrackerProps) {
  const { m, tm, tt, locale, date } = useTrackingText(text)
  const uid = useId().replace(/:/g, '')
  const H = `h${headingLevel}` as 'h2'
  const points = useTrackingPoints(tracking as TrackingView | null | undefined, geocode)
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
  const eta = 'eta' in tracking ? str((tracking as TrackingView).eta) : str((tracking as Shipment).promised_by)
  const etaText = status === 'delivered' ? null : date(eta)
  const updated = 'updated_at' in tracking ? date(str((tracking as TrackingView).updated_at), 'datetime') : null
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
        <TrackingTimeline events={tracking.events} locale={locale} {...(text.timeZone ? { timeZone: text.timeZone } : {})} {...(text.messages ? { messages: text.messages } : {})} />
      </div>
    </section>
  )
}

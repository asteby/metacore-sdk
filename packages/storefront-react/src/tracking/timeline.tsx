/**
 * The movements of a shipment, newest first. `TrackingEventList` is the one list the order cards (`ShipmentCard`,
 * `ShipmentDetail`) and the public tracker share, so a carrier's scans look and read the same everywhere.
 * `TrackingTimeline` is the standalone component: it resolves its own texts and dates, marks the current step with
 * `aria-current="step"` and draws a marker per step. Headless (`data-sf-*`, `classNames`), carrier-agnostic.
 */
import type { ShipmentEvent, ShipmentStatus } from '@asteby/storefront'
import { sortTrackingEvents } from '@asteby/storefront'
import type { ReactNode } from 'react'
import { enumText, type AccountMessages } from '../account/orders-messages.js'
import { Time, str } from '../account/orders-ui.js'
import { useTrackingText, type TrackingTextProps } from './text.js'

type Dater = (iso: string | null | undefined, style?: 'date' | 'datetime') => string | null

/** The classic list of scans (no markers). Same markup the shipment cards always had. */
export function TrackingEventList({
  events,
  m,
  date,
  id,
  className,
  itemClassName,
  markers,
  renderIcon,
  currentLabel,
}: {
  events: readonly ShipmentEvent[]
  m: AccountMessages
  date: Dater
  id?: string
  className?: string | undefined
  itemClassName?: string | undefined
  /** Draw a marker per step and flag the first one as the current step. */
  markers?: boolean
  renderIcon?: (status: ShipmentStatus) => ReactNode
  currentLabel?: string
}) {
  return (
    <ol className={className} id={id} data-sf-shipment-events {...(markers ? { 'data-sf-tracking-timeline': '' } : {})}>
      {events.map((e, i) => {
        const description = str(e.description)
        const location = str(e.location)
        return (
          <li
            key={`${str(e.id) ?? ''}-${i}`}
            className={itemClassName}
            data-sf-event-status={typeof e.status === 'string' ? e.status : 'unknown'}
            {...(markers && i === 0 ? { 'aria-current': 'step' as const } : {})}
          >
            {markers ? (
              <span aria-hidden="true" data-sf-tracking-marker>
                {renderIcon ? renderIcon(e.status) : i === 0 ? '●' : '○'}
              </span>
            ) : null}
            <span data-sf-event-state>{enumText(m, 'shipment.status', e.status)}</span>
            {markers && i === 0 && currentLabel ? <span style={SR_ONLY}> ({currentLabel})</span> : null}
            {description ? <span data-sf-event-description> · {description}</span> : null}
            {location ? <span data-sf-event-location> · {location}</span> : null}{' '}
            <Time value={e.occurred_at} text={date(e.occurred_at, 'datetime')} />
          </li>
        )
      })}
    </ol>
  )
}

const SR_ONLY = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const

export type TrackingTimelineClassNames = Partial<Record<'root' | 'item' | 'empty', string>>

export type TrackingTimelineProps = TrackingTextProps & {
  events: readonly ShipmentEvent[] | null | undefined
  /** How many scans to show (default 50, the server's cap). */
  limit?: number
  /** A marker per step; default `●` for the current step and `○` for the older ones. */
  renderIcon?: (status: ShipmentStatus) => ReactNode
  /** Accessible name of the list. */
  ariaLabel?: string
  classNames?: TrackingTimelineClassNames
}

export function TrackingTimeline({ events, limit = 50, renderIcon, ariaLabel, classNames: cx = {}, ...text }: TrackingTimelineProps) {
  const { m, tm, date } = useTrackingText(text)
  const sorted = sortTrackingEvents(events, limit)
  if (sorted.length === 0) {
    return (
      <p className={cx.empty} data-sf-tracking-empty>
        {tm['timeline.empty']}
      </p>
    )
  }
  return (
    <div className={cx.root} data-sf-tracking-timeline-wrap role="group" aria-label={ariaLabel ?? tm['timeline.label']}>
      <TrackingEventList events={sorted} m={m} date={date} itemClassName={cx.item} markers {...(renderIcon ? { renderIcon } : {})} currentLabel={tm['timeline.current']} />
    </div>
  )
}

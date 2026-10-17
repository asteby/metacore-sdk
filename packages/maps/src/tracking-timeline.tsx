import * as React from 'react'
import { isValidPoint } from '@asteby/storefront/geo'
import { openInMapHref } from './dom'

export type TrackingTone = 'done' | 'current' | 'pending' | 'problem'

export interface TrackingEvent {
    id?: string
    /** Status text as the server sent it ("En tránsito", "Entregado"…). */
    status: string
    at?: string | number | Date | null
    description?: string
    location?: string | { label?: string; lat?: number | null; lng?: number | null }
    /** Visual/semantic state; inferred (newest = current, older = done) when omitted. */
    tone?: TrackingTone
}

export interface TrackingTimelineLabels {
    empty: string
    openInMap: string
    tones: Record<TrackingTone, string>
}

export const DEFAULT_TIMELINE_LABELS: TrackingTimelineLabels = {
    empty: 'Aún no hay eventos de seguimiento.',
    openInMap: 'Ver en mapa',
    tones: { done: 'Completado', current: 'Estado actual', pending: 'Pendiente', problem: 'Incidencia' },
}

export interface TrackingTimelineProps {
    events: TrackingEvent[]
    /** `desc` = newest first (default), `asc` = chronological. */
    order?: 'asc' | 'desc'
    locale?: string
    timeZone?: string
    labels?: Partial<Omit<TrackingTimelineLabels, 'tones'>> & { tones?: Partial<TrackingTimelineLabels['tones']> }
    ariaLabel?: string
    className?: string
    onSelect?: (event: TrackingEvent) => void
}

const GLYPH: Record<TrackingTone, string> = { done: '✓', current: '●', pending: '○', problem: '!' }
const COLOR: Record<TrackingTone, string> = { done: '#007A5A', current: '#0072B2', pending: '#6B7280', problem: '#B34700' }
const SR_ONLY: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }

function toDate(v: TrackingEvent['at']): Date | null {
    if (v === null || v === undefined || v === '') return null
    const d = v instanceof Date ? v : new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
}

/** Pure: events sorted by time (events without a date go last, keeping their order). */
export function sortTrackingEvents(events: TrackingEvent[], order: 'asc' | 'desc' = 'desc'): TrackingEvent[] {
    const k = order === 'desc' ? -1 : 1
    return events
        .map((e, i) => ({ e, i, t: toDate(e.at)?.getTime() ?? null }))
        .sort((a, b) => {
            if (a.t === null || b.t === null) return a.t === b.t ? a.i - b.i : a.t === null ? 1 : -1
            return a.t === b.t ? a.i - b.i : (a.t - b.t) * k
        })
        .map((x) => x.e)
}

export interface TrackingFieldMap {
    status: string
    at: string
    description?: string
    location?: string
    lat?: string
    lng?: string
}

const num = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
    return Number.isFinite(n) ? n : null
}

/** Pure: server rows (a relation's rows or a capability's `events`) → events. */
export function toTrackingEvents(rows: Array<Record<string, unknown>>, f: TrackingFieldMap): TrackingEvent[] {
    return rows.map((r, i) => {
        const lat = f.lat ? num(r[f.lat]) : null
        const lng = f.lng ? num(r[f.lng]) : null
        const label = f.location ? String(r[f.location] ?? '') : ''
        return {
            id: String(r.id ?? i),
            status: String(r[f.status] ?? ''),
            at: (r[f.at] as TrackingEvent['at']) ?? null,
            description: f.description ? String(r[f.description] ?? '') || undefined : undefined,
            location: lat !== null && lng !== null ? { label: label || undefined, lat, lng } : label || undefined,
        }
    })
}

/** Shipment-style event timeline: status, time and place. No map required. */
export function TrackingTimeline({ events, order = 'desc', locale = 'es-MX', timeZone, labels, ariaLabel, className, onSelect }: TrackingTimelineProps): React.ReactElement {
    const L = { ...DEFAULT_TIMELINE_LABELS, ...labels, tones: { ...DEFAULT_TIMELINE_LABELS.tones, ...labels?.tones } }
    const fmt = React.useMemo(() => {
        try {
            return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone })
        } catch {
            return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
        }
    }, [locale, timeZone])
    if (events.length === 0) {
        return (
            <p role="status" data-testid="tracking-empty" style={{ opacity: 0.7, fontSize: 14 }}>
                {L.empty}
            </p>
        )
    }
    const sorted = sortTrackingEvents(events, order)
    const newest = sortTrackingEvents(events, 'desc')[0]
    return (
        <ol aria-label={ariaLabel} className={className} data-testid="tracking-timeline" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {sorted.map((e, i) => {
                const tone: TrackingTone = e.tone ?? (e === newest ? 'current' : 'done')
                const at = toDate(e.at)
                const loc = typeof e.location === 'string' ? { label: e.location } : e.location
                const point = loc && 'lat' in loc && isValidPoint(loc) ? { lat: loc.lat as number, lng: loc.lng as number } : null
                const body = (
                    <>
                        <span style={{ fontWeight: 600 }}>{e.status}</span>
                        <span style={SR_ONLY}> ({L.tones[tone]})</span>
                        {at ? (
                            <time dateTime={at.toISOString()} style={{ display: 'block', fontSize: 12, opacity: 0.75 }}>
                                {fmt.format(at)}
                            </time>
                        ) : null}
                        {e.description ? <span style={{ display: 'block', fontSize: 13 }}>{e.description}</span> : null}
                    </>
                )
                return (
                    <li key={e.id ?? i} aria-current={tone === 'current' ? 'step' : undefined} data-tone={tone} style={{ display: 'flex', gap: 12, paddingBottom: 16 }}>
                        <span aria-hidden style={{ flex: '0 0 auto', width: 22, height: 22, borderRadius: '50%', background: COLOR[tone], color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>
                            {GLYPH[tone]}
                        </span>
                        <div style={{ minWidth: 0 }}>
                            {onSelect ? (
                                <button type="button" onClick={() => onSelect(e)} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
                                    {body}
                                </button>
                            ) : (
                                body
                            )}
                            {loc?.label || point ? (
                                <span style={{ display: 'block', fontSize: 12 }}>
                                    {loc?.label ?? ''}
                                    {point ? (
                                        <>
                                            {loc?.label ? ' · ' : ''}
                                            <a href={openInMapHref(point.lat, point.lng)} target="_blank" rel="noopener noreferrer">
                                                {L.openInMap}
                                            </a>
                                        </>
                                    ) : null}
                                </span>
                            ) : null}
                        </div>
                    </li>
                )
            })}
        </ol>
    )
}

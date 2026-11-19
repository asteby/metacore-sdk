import * as React from 'react'
import { distanceKm, formatDistance, type GeoPoint } from '@asteby/storefront/geo'
import { Avatar, isBranded } from './avatar'
import { openInMapHref } from './dom'
import { pointColor } from './geometry'
import type { MapLabels, MapPointItem } from './types'

export interface MapListProps {
    items: MapPointItem[]
    labels: MapLabels
    selectedKey?: string | null
    /** Show the distance from here next to each item. */
    origin?: GeoPoint | null
    locale?: string
    onSelect?: (item: MapPointItem) => void
    id?: string
    /** Status key → colour (the avatar ring), as the map draws it. */
    colors?: Record<string, string>
}

/**
 * The accessible equivalent of the map: every point as a keyboard-reachable
 * list item with its status written out and an "open in map" link. It is the
 * only view when WebGL or MapLibre are unavailable.
 */
export function MapList({ items, labels, selectedKey, origin, locale, onSelect, id, colors }: MapListProps): React.ReactElement {
    if (items.length === 0) {
        return (
            <p id={id} role="status" data-testid="map-empty" style={{ padding: '16px 0', textAlign: 'center', opacity: 0.7 }}>
                {labels.empty}
            </p>
        )
    }
    // Avatars only when the list has branding to show (logos or brand colours); otherwise rows stay as before.
    const avatars = items.some(isBranded)
    return (
        <ul id={id} aria-label={labels.list} data-testid="map-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {items.map((it) => {
                const sub = [
                    it.statusLabel ?? it.status,
                    ...(it.details ?? []).map((d) => (d.label ? `${d.label}: ${d.value}` : d.value)),
                    origin ? formatDistance(distanceKm(origin, it), locale) : '',
                ].filter(Boolean)
                return (
                    <li key={it.key} data-selected={selectedKey === it.key || undefined} style={{ display: 'flex', alignItems: avatars ? 'center' : undefined, gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(128,128,128,.25)' }}>
                        {avatars ? <Avatar label={it.label} image={it.image} accent={it.accent} ring={pointColor(it, colors)} size={36} decorative /> : null}
                        <div style={{ minWidth: 0, flex: 1 }}>
                            {onSelect ? (
                                <button type="button" aria-pressed={selectedKey === it.key} onClick={() => onSelect(it)} style={{ all: 'unset', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                                    {it.label}
                                </button>
                            ) : (
                                <strong>{it.label}</strong>
                            )}
                            {it.subtitle ? <div style={{ fontSize: 12, opacity: 0.75 }}>{it.subtitle}</div> : null}
                            {sub.length > 0 ? <div style={{ fontSize: 12, opacity: 0.75 }}>{sub.join(' · ')}</div> : null}
                        </div>
                        <a href={openInMapHref(it.lat, it.lng)} target="_blank" rel="noopener noreferrer" aria-label={`${labels.openInMap}: ${it.label}`} style={{ fontSize: 12, flexShrink: 0 }}>
                            {labels.openInMap}
                        </a>
                    </li>
                )
            })}
        </ul>
    )
}

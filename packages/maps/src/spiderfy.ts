// Spiderfy: members that share one location fan out around it (circle, then
// spiral) with leader lines, each a focusable pin. One DOM marker anchored at
// the shared point; pins sit at fixed pixel offsets, so no zoom is needed.
import type * as ML from 'maplibre-gl'
import type { MapLibreModule } from './config'
import { spiderNode } from './dom'
import { isBranded } from './avatar'
import { pointColor, SPIDER_FOOT_AVATAR, spiderOffsets } from './geometry'
import type { MapPointItem } from './types'

/** Most members fanned out at once; more are listed instead. */
export const SPIDER_MAX = 24
/** Zooming out this much below the opening zoom folds the fan back. */
const FOLD_ZOOM_DELTA = 0.75

export interface SpiderOptions {
    center: [number, number]
    members: MapPointItem[]
    colors?: Record<string, string>
    /** A pin was activated; `offset` is its pixel offset from the anchor (to place its popup). */
    onPick: (item: MapPointItem, offset: [number, number]) => void
    /** The fan closed itself (Esc, click outside, zoom out). */
    onClose?: () => void
}

export interface Spider {
    close: () => void
}

/** Fan `members` out around `center`. Closes with Esc, a click outside, or zooming out; the first pin takes focus. */
export function openSpider(map: ML.Map, ml: MapLibreModule, { center, members, colors, onPick, onClose }: SpiderOptions): Spider {
    const offsets = spiderOffsets(members.length, members.some(isBranded) ? SPIDER_FOOT_AVATAR : undefined)
    const { root, pins } = spiderNode(
        members.map((m, i) => ({
            label: m.label,
            status: m.statusLabel ?? m.status,
            color: pointColor(m, colors),
            image: m.image,
            accent: m.accent,
            onPick: () => onPick(m, offsets[i] as [number, number]),
        })),
        offsets,
    )
    const marker = new ml.Marker({ element: root, anchor: 'center' }).setLngLat(center).addTo(map)
    const openZoom = map.getZoom()
    // The click that opened the fan is still travelling through the map's own listeners.
    let settling = true
    const settle = setTimeout(() => (settling = false), 0)
    let open = true
    const close = () => {
        if (!open) return
        open = false
        clearTimeout(settle)
        document.removeEventListener('keydown', onKey)
        map.off('click', onMapClick)
        map.off('zoom', onZoom)
        marker.remove()
    }
    const closeAndNotify = () => {
        close()
        onClose?.()
    }
    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeAndNotify()
    }
    const onMapClick = () => {
        if (!settling) closeAndNotify()
    }
    const onZoom = () => {
        if (map.getZoom() < openZoom - FOLD_ZOOM_DELTA) closeAndNotify()
    }
    document.addEventListener('keydown', onKey)
    map.on('click', onMapClick)
    map.on('zoom', onZoom)
    pins[0]?.focus()
    return { close }
}

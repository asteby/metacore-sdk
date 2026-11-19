// Logos over the WebGL points layer.
//
// Decision (rendering strategy). Circle layers cannot paint an <img>, so a brand
// avatar on a clustered map has two options:
//   (a) `symbol` layers with `map.addImage` per logo: needs every logo fetched
//       and rasterised up front (an async queue, a cache with eviction, ImageData
//       that makes CORS mandatory), no initials fallback, no focus ring, no
//       accessible name per point;
//   (b) DOM markers (`ml.Marker`) over the circles, only for what is on screen.
// We take (b): a real <img> (lazy, referrerPolicy, no CORS needed), initials
// fallback, keyboard focus and an aria-label for free. Its cost is one DOM node per
// mark, so it is capped: at most `LOGO_MARKER_MAX` (50) marks of each kind per view.
// Above the cap the circles stay (and the list / popups still show logos): a crowded
// view is already unreadable as individual faces. Nothing is drawn twice: the circle
// under a logo is hidden with a layer filter.
//
// Three kinds of marks, each capped on its own:
//   - single points   -> avatar (logo, else initials in the brand colour);
//   - clusters        -> up to 3 member logos stacked + the count (leaves are
//                        fetched once per cluster and cached);
//   - area bubbles    -> the same mosaic (country / city precision).
import type * as ML from 'maplibre-gl'
import type { MapLibreModule } from './config'
import { avatarNode, isBranded } from './avatar'
import { areaGroups, areaTone, pointColor } from './geometry'
import { readableOn } from './palette'
import type { MapPointItem } from './types'

/** Most marks of each kind drawn as DOM per view. */
export const LOGO_MARKER_MAX = 50
/** Logos stacked in a cluster / area mosaic. */
export const MOSAIC_MAX = 3
/** Cluster membership cache entries kept (one per cluster id + size). */
const LEAVES_CACHE_MAX = 200
/** Leaves read per cluster to find up to MOSAIC_MAX branded members. */
const LEAVES_READ = 12

export interface LogoOverlayOptions {
    map: ML.Map
    ml: MapLibreModule
    /** Layer ids of the points layer set (see ClusterLayer). */
    ids: { source: string; points: string; halo: string; clusters: string; count: string; area: string; areaHalo: string; areaCount: string }
    state: () => { points: MapPointItem[]; colors?: Record<string, string>; selectedKey?: string | null; clusterText: (n: number) => string }
    onPoint: (item: MapPointItem) => void
    onCluster: (feature: { properties: Record<string, unknown>; geometry: { coordinates: [number, number] } }) => void
    onArea: (feature: { properties: Record<string, unknown>; geometry: { coordinates: [number, number] } }) => void
}

export interface LogoOverlay {
    /** Re-read what is on screen and redraw the marks (cheap; also runs on every `idle`). */
    refresh: () => void
    destroy: () => void
}

interface Mark {
    marker: ML.Marker
    sig: string
}

const BASE = {
    points: ['!', ['has', 'point_count']],
    clusters: ['has', 'point_count'],
}

/** `hide` ids from a layer filter: `base` stays when there is nothing to hide. */
function setHidden(map: ML.Map, layers: string[], base: unknown, prop: string, ids: ReadonlyArray<string | number>): void {
    if (typeof map.setFilter !== 'function') return
    const filter = ids.length ? ['all', ...(base ? [base] : []), ['!', ['in', ['get', prop], ['literal', [...ids]]]]] : (base ?? null)
    for (const l of layers) if (map.getLayer(l)) map.setFilter(l, filter as never)
}

/**
 * Up to MOSAIC_MAX stacked avatars plus a badge. A cluster's badge is its total; an area's (`overflow`) is "+N" for the
 * members not drawn (none, no badge), tinted by the dominant status (`tone`).
 */
function mosaicNode(members: MapPointItem[], total: number, text: string, area?: { tone?: string; colors?: Record<string, string> }): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'mcm-mosaic'
    b.setAttribute('aria-label', text)
    const shown = members.slice(0, MOSAIC_MAX)
    for (const m of shown) b.appendChild(avatarNode({ label: m.label, image: m.image, accent: m.accent, ring: area ? pointColor(m, area.colors) : undefined, size: 30, decorative: true }))
    const label = area ? (total > shown.length ? `+${total - shown.length}` : '') : String(total)
    if (label) {
        const n = document.createElement('span')
        n.className = 'mcm-mosaic-n'
        n.textContent = label
        if (area?.tone) {
            n.style.background = area.tone
            n.style.color = readableOn(area.tone)
        }
        b.appendChild(n)
    }
    return b
}

export function mountLogoOverlay(o: LogoOverlayOptions): LogoOverlay {
    const { map, ml, ids } = o
    const marks = new Map<string, Mark>()
    const leaves = new Map<string, string[]>()
    let seq = 0
    let alive = true

    const put = (key: string, sig: string, lng: number, lat: number, make: () => HTMLElement) => {
        const prev = marks.get(key)
        if (prev && prev.sig === sig) {
            prev.marker.setLngLat([lng, lat])
            return
        }
        prev?.marker.remove()
        marks.set(key, { marker: new ml.Marker({ element: make(), anchor: 'center' }).setLngLat([lng, lat]).addTo(map), sig })
    }
    const prune = (keep: Set<string>) => {
        for (const [k, m] of marks) {
            if (!keep.has(k)) {
                m.marker.remove()
                marks.delete(k)
            }
        }
    }
    const coords = (f: ML.GeoJSONFeature) => (f.geometry as unknown as { coordinates: [number, number] }).coordinates
    // What is on screen comes from the SOURCE (not from the layers): a hidden circle must not
    // vanish from the query, or its logo would flicker in and out on every idle.
    const onScreen = (): { singles: ML.GeoJSONFeature[]; clusters: ML.GeoJSONFeature[] } => {
        if (typeof map.querySourceFeatures !== 'function' || !map.getSource(ids.source)) return { singles: [], clusters: [] }
        const bounds = map.getBounds()
        const singles = new Map<string, ML.GeoJSONFeature>()
        const clusters = new Map<number, ML.GeoJSONFeature>()
        for (const f of map.querySourceFeatures(ids.source)) {
            const [lng, lat] = coords(f)
            if (!bounds.contains([lng, lat])) continue
            if (f.properties?.cluster_id !== undefined) clusters.set(Number(f.properties.cluster_id), f)
            else singles.set(String(f.properties?.key ?? ''), f)
        }
        return { singles: [...singles.values()], clusters: [...clusters.values()] }
    }

    const refresh = async () => {
        if (!alive) return
        const my = ++seq
        const { points, colors, selectedKey, clusterText } = o.state()
        const byKey = new Map(points.map((p) => [p.key, p]))
        const keep = new Set<string>()

        // 1. Single points on screen.
        const visible = onScreen()
        // The overlay only exists on a map with some logo or brand colour: every single point is an avatar (initials for the rest).
        const singles = visible.singles.flatMap((f) => byKey.get(String(f.properties?.key ?? '')) ?? [])
        const shownPoints = singles.length <= LOGO_MARKER_MAX ? singles : []
        for (const p of shownPoints) {
            const k = `p:${p.key}`
            keep.add(k)
            const status = p.statusLabel ?? p.status
            const name = status ? `${p.label}, ${status}` : p.label
            put(k, [p.label, p.image, p.accent, pointColor(p, colors), name, selectedKey === p.key].join('|'), p.lng, p.lat, () => {
                const b = document.createElement('button')
                b.type = 'button'
                b.className = 'mcm-marker mcm-marker--avatar'
                b.setAttribute('aria-label', name)
                b.setAttribute('aria-pressed', selectedKey === p.key ? 'true' : 'false')
                b.appendChild(avatarNode({ label: p.label, image: p.image, accent: p.accent, ring: pointColor(p, colors), size: 34, decorative: true }))
                b.addEventListener('click', (e) => {
                    e.stopPropagation()
                    o.onPoint(p)
                })
                return b
            })
        }
        setHidden(map, [ids.points, ids.halo], BASE.points, 'key', shownPoints.map((p) => p.key))

        // 2. Area bubbles (country / city): a mosaic of the logos inside.
        const areas = [...areaGroups(points)].filter(([, members]) => members.some(isBranded))
        const shownAreas = areas.length <= LOGO_MARKER_MAX ? areas : []
        for (const [gid, members] of shownAreas) {
            const k = `a:${gid}`
            keep.add(k)
            const branded = members.filter(isBranded)
            const first = members[0] as MapPointItem
            const area = members.find((m) => m.area)?.area
            const text = area ? `${area} · ${clusterText(members.length)}` : clusterText(members.length)
            put(k, [gid, members.length, areaTone(members, colors), branded.slice(0, MOSAIC_MAX).map((m) => `${m.key}:${m.image}:${m.accent}`).join(',')].join('|'), first.lng, first.lat, () => {
                const b = mosaicNode(branded, members.length, text, { tone: areaTone(members, colors), colors })
                b.addEventListener('click', (e) => {
                    e.stopPropagation()
                    o.onArea({ properties: { gid }, geometry: { coordinates: [first.lng, first.lat] } })
                })
                return b
            })
        }
        setHidden(map, [ids.areaHalo, ids.area, ids.areaCount], null, 'gid', shownAreas.map(([gid]) => gid))

        // 3. Clusters on screen: logos of up to MOSAIC_MAX members (leaves are async).
        const clusterFeatures = visible.clusters
        const src = map.getSource(ids.source) as ML.GeoJSONSource | undefined
        const shownClusters: number[] = []
        if (src && clusterFeatures.length <= LOGO_MARKER_MAX) {
            const rows = await Promise.all(
                clusterFeatures.map(async (f) => {
                    const cid = Number(f.properties?.cluster_id)
                    const count = Number(f.properties?.point_count) || 0
                    const ck = `${ids.source}:${cid}:${count}`
                    let keys = leaves.get(ck)
                    if (!keys) {
                        try {
                            const ls = await src.getClusterLeaves(cid, LEAVES_READ, 0)
                            keys = ls.map((l) => String(l.properties?.key ?? ''))
                        } catch {
                            keys = []
                        }
                        if (leaves.size >= LEAVES_CACHE_MAX) leaves.delete(leaves.keys().next().value as string)
                        leaves.set(ck, keys)
                    }
                    return { f, cid, count, keys }
                }),
            )
            if (!alive || my !== seq) return
            for (const { f, cid, count, keys } of rows) {
                const branded = keys.flatMap((key) => byKey.get(key) ?? []).filter(isBranded).slice(0, MOSAIC_MAX)
                if (!branded.length) continue
                const k = `c:${cid}`
                keep.add(k)
                shownClusters.push(cid)
                const [lng, lat] = coords(f)
                put(k, [cid, count, branded.map((m) => `${m.key}:${m.image}:${m.accent}`).join(',')].join('|'), lng, lat, () => {
                    const b = mosaicNode(branded, count, clusterText(count))
                    b.addEventListener('click', (e) => {
                        e.stopPropagation()
                        o.onCluster({ properties: f.properties as Record<string, unknown>, geometry: { coordinates: [lng, lat] } })
                    })
                    return b
                })
            }
        }
        setHidden(map, [ids.clusters, ids.count], BASE.clusters, 'cluster_id', shownClusters)
        prune(keep)
    }

    const run = () => void refresh()
    map.on('idle', run)
    run()
    return {
        refresh: run,
        destroy: () => {
            alive = false
            map.off('idle', run)
            for (const m of marks.values()) m.marker.remove()
            marks.clear()
            leaves.clear()
        },
    }
}

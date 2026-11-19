// Pure geometry helpers (no MapLibre, no DOM): GeoJSON building, bounds and
// circle polygons. Distances and point validation come from the single geo
// module shared with the storefronts (`@asteby/storefront/geo`).
import { isValidPoint, type GeoPoint } from '@asteby/storefront/geo'
import { colorFor, readableOn, safeColor } from './palette'
import type { MapPointItem, MapPrecision, PolygonCoords, ZoneItem } from './types'

export type LngLatBounds = [[number, number], [number, number]]

export interface FeatureCollection {
    type: 'FeatureCollection'
    features: Array<{
        type: 'Feature'
        id?: number | string
        properties: Record<string, unknown>
        geometry: { type: string; coordinates: unknown }
    }>
}

/** `[[west, south], [east, north]]` of the valid points, or null. */
export function boundsOf(points: ReadonlyArray<GeoPoint | null | undefined>): LngLatBounds | null {
    let w = Infinity
    let s = Infinity
    let e = -Infinity
    let n = -Infinity
    for (const p of points) {
        if (!isValidPoint(p)) continue
        w = Math.min(w, p.lng)
        e = Math.max(e, p.lng)
        s = Math.min(s, p.lat)
        n = Math.max(n, p.lat)
    }
    return Number.isFinite(w) ? [[w, s], [e, n]] : null
}

/** Colour of a point: explicit (safe) colour, else the stable colour of its status. */
export function pointColor(p: Pick<MapPointItem, 'color' | 'status'>, colors?: Record<string, string>): string {
    return safeColor(p.color) ?? colorFor(p.status, colors)
}

/** Points → GeoJSON with the colour resolved per feature. */
export function pointsToGeoJSON(points: MapPointItem[], colors?: Record<string, string>): FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: points
            .filter((p) => isValidPoint(p))
            .map((p) => ({
                type: 'Feature' as const,
                properties: {
                    key: p.key,
                    label: p.label,
                    status: p.status ?? '',
                    color: pointColor(p, colors),
                },
                geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
            })),
    }
}

export function lineToGeoJSON(path: GeoPoint[]): FeatureCollection {
    const coordinates = path.filter((p) => isValidPoint(p)).map((p) => [p.lng, p.lat])
    return {
        type: 'FeatureCollection',
        features: coordinates.length < 2 ? [] : [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }],
    }
}

const EARTH_M = 6371008.8

/** Regular polygon approximating a geodesic circle (ring closed, `[lng, lat]`). */
export function circlePolygon(center: GeoPoint, radiusM: number, steps = 64): PolygonCoords {
    const lat = (center.lat * Math.PI) / 180
    const lng = (center.lng * Math.PI) / 180
    const d = radiusM / EARTH_M
    const ring: number[][] = []
    for (let i = 0; i <= steps; i++) {
        const brg = (2 * Math.PI * (i % steps)) / steps
        const lat2 = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(brg))
        const lng2 = lng + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(lat2))
        ring.push([(((lng2 * 180) / Math.PI + 540) % 360) - 180, (lat2 * 180) / Math.PI])
    }
    return [ring]
}

export function zonesToGeoJSON(zones: ZoneItem[]): FeatureCollection {
    const features: FeatureCollection['features'] = []
    for (const z of zones) {
        const coords =
            z.polygon && z.polygon.length > 0
                ? z.polygon
                : z.center && isValidPoint(z.center) && (z.radiusM ?? 0) > 0
                  ? circlePolygon(z.center, z.radiusM as number)
                  : null
        if (!coords) continue
        features.push({
            type: 'Feature',
            properties: { key: z.key, label: z.label ?? '', color: safeColor(z.color) ?? colorFor(z.key) },
            geometry: { type: 'Polygon', coordinates: coords },
        })
    }
    return { type: 'FeatureCollection', features }
}

/** All vertices of the zones (for fitting the viewport). */
export function zonePoints(zones: ZoneItem[]): GeoPoint[] {
    const out: GeoPoint[] = []
    for (const f of zonesToGeoJSON(zones).features) {
        for (const ring of f.geometry.coordinates as number[][][]) {
            for (const c of ring) out.push({ lng: c[0] as number, lat: c[1] as number })
        }
    }
    return out
}

/** Same place to ~1 m: approximate locations (country centroids) land on exactly the same coordinates. */
export function sameSpot(a: GeoPoint, b: GeoPoint): boolean {
    return Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lng - b.lng) < 1e-5
}

/** True when every point sits on the first one (zooming in can never separate them). */
export function allCoincident(points: ReadonlyArray<GeoPoint>): boolean {
    const [first, ...rest] = points
    return !!first && rest.every((p) => sameSpot(first, p))
}

// --- Precision ------------------------------------------------------------

/** Highest zoom a selection / fit reaches per approximate precision (a centroid has nothing to show closer). */
export const DEFAULT_PRECISION_ZOOM: Readonly<Record<Exclude<MapPrecision, 'exact'>, number>> = { country: 5, city: 10 }

export const isApproximate = (p: Pick<MapPointItem, 'precision'>): boolean => p.precision === 'city' || p.precision === 'country'

/** Zoom cap of an approximate point, or undefined for an exact one. */
export function precisionCap(p: Pick<MapPointItem, 'precision'>, caps?: Partial<Record<MapPrecision, number>>): number | undefined {
    return p.precision === 'city' || p.precision === 'country' ? (caps?.[p.precision] ?? DEFAULT_PRECISION_ZOOM[p.precision]) : undefined
}

/**
 * Zoom after selecting `item`. Never zooms out. Approximate points stop at their
 * precision cap; exact ones go to `selectZoom`, unless others share their spot
 * (then only centre: more zoom would not separate them).
 */
export function selectZoomFor(item: MapPointItem, all: ReadonlyArray<MapPointItem>, current: number, selectZoom: number, caps?: Partial<Record<MapPrecision, number>>): number {
    const cap = precisionCap(item, caps)
    if (cap !== undefined) return Math.max(current, Math.min(selectZoom, cap))
    if (all.some((p) => p.key !== item.key && sameSpot(p, item))) return current
    return Math.max(current, selectZoom)
}

/** Max zoom for fitting `points`: when all are approximate, the loosest of their caps. */
export function fitMaxZoom(points: ReadonlyArray<MapPointItem>, caps?: Partial<Record<MapPrecision, number>>, base = 15): number {
    const cs = points.map((p) => precisionCap(p, caps))
    return points.length > 0 && cs.every((c) => c !== undefined) ? Math.min(base, Math.max(...(cs as number[]))) : base
}

/** Approximate points grouped by exact location (one entry per bubble), keyed by `"lat,lng"`. */
export function areaGroups(points: ReadonlyArray<MapPointItem>): Map<string, MapPointItem[]> {
    const out = new Map<string, MapPointItem[]>()
    for (const p of points) {
        if (!isApproximate(p) || !isValidPoint(p)) continue
        const k = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`
        out.set(k, [...(out.get(k) ?? []), p])
    }
    return out
}

/**
 * Colour of an area bubble: the colour of its dominant status (most members; ties go to the first seen), or the
 * explicit colour of the members. Undefined when no member carries a status or colour (the bubble keeps the theme hue).
 */
export function areaTone(members: ReadonlyArray<MapPointItem>, colors?: Record<string, string>): string | undefined {
    const counts = new Map<string, number>()
    for (const m of members) {
        if (!m.color && !m.status) continue
        const c = pointColor(m, colors)
        counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    let best: string | undefined
    let max = 0
    for (const [c, n] of counts) {
        if (n > max) {
            best = c
            max = n
        }
    }
    return best
}

/** One bubble feature per location: `text` ("CA · 8"), `r` (radius px, grows with the square root of the count), `color` / `tc` (dominant tone and its readable text colour, when known). */
export function pointsToAreas(points: ReadonlyArray<MapPointItem>, colors?: Record<string, string>): FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: [...areaGroups(points)].map(([gid, members]) => {
            const first = members[0] as MapPointItem
            const count = members.length
            const area = members.find((m) => m.area)?.area
            const tone = areaTone(members, colors)
            return {
                type: 'Feature' as const,
                properties: {
                    gid,
                    count,
                    area: area ?? '',
                    text: area ? `${area} · ${count}` : String(count),
                    r: Math.min(44, Math.round(14 + 6 * Math.sqrt(count))),
                    ...(tone ? { color: tone, tc: readableOn(tone) } : {}),
                },
                geometry: { type: 'Point', coordinates: [first.lng, first.lat] },
            }
        }),
    }
}

// --- Spiderfy -------------------------------------------------------------

const SPIDER_FOOT = 34
/** Spacing of the fan when its pins are avatars (bigger than numbered pins). */
export const SPIDER_FOOT_AVATAR = 46

/** Pixel offsets `[dx, dy]` of `n` members around their shared point: a circle up to 8, an outward spiral beyond. `foot` is the distance between neighbours. */
export function spiderOffsets(n: number, foot = SPIDER_FOOT): Array<[number, number]> {
    const round = (v: number) => Math.round(v * 10) / 10
    if (n <= 0) return []
    if (n <= 8) {
        const r = Math.max(52 * (foot / SPIDER_FOOT), (foot * n) / (2 * Math.PI))
        return Array.from({ length: n }, (_, i) => {
            const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
            return [round(r * Math.cos(a)), round(r * Math.sin(a))]
        })
    }
    const out: Array<[number, number]> = []
    let a = 0
    const r0 = 56 * (foot / SPIDER_FOOT)
    let r = r0
    for (let i = 0; i < n; i++) {
        out.push([round(r * Math.cos(a - Math.PI / 2)), round(r * Math.sin(a - Math.PI / 2))])
        a += foot / r
        r = r0 + 5.5 * (foot / SPIDER_FOOT) * a
    }
    return out
}

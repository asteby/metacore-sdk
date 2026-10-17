// Pure geometry helpers (no MapLibre, no DOM): GeoJSON building, bounds and
// circle polygons. Distances and point validation come from the single geo
// module shared with the storefronts (`@asteby/storefront/geo`).
import { isValidPoint, type GeoPoint } from '@asteby/storefront/geo'
import { colorFor, safeColor } from './palette'
import type { MapPointItem, PolygonCoords, ZoneItem } from './types'

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
                    color: safeColor(p.color) ?? colorFor(p.status, colors),
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

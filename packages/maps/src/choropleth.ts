// Choropleth data model: geometry arrives from the host through a lazy loader
// (the SDK ships no country/region shapes), values are keyed per region and
// binned onto a sequential ramp derived from the shared palette.
import { DEFAULT_COLOR, safeColor } from './palette'

export interface RegionFeature {
    type: 'Feature'
    id?: string | number
    properties?: Record<string, unknown> | null
    geometry: { type: string; coordinates?: unknown; geometries?: unknown[] } | null
}
export interface RegionCollection {
    type: 'FeatureCollection'
    features: RegionFeature[]
}
interface Topology {
    type: 'Topology'
    arcs: number[][][]
    transform?: { scale: [number, number]; translate: [number, number] }
    objects: Record<string, { type: string; geometries?: TopoGeometry[] } & TopoGeometry>
}
interface TopoGeometry {
    type: string
    id?: string | number
    properties?: Record<string, unknown> | null
    arcs?: any
    coordinates?: unknown
}

/** What a host/region loader may resolve to: GeoJSON or TopoJSON. */
export type ChoroplethGeometry = RegionCollection | Topology
export type ChoroplethLoader = () => Promise<ChoroplethGeometry | { default: ChoroplethGeometry }>

export interface ChoroplethRegion {
    key: string
    label: string
    /** `undefined` when `values` has no entry for the region. */
    value: number | undefined
    color: string
    /** Index of the legend step, -1 without value. */
    step: number
}
export interface ChoroplethStep {
    from: number
    to: number
    color: string
}

export const NO_DATA_COLOR = '#D1D5DB'

function decodeArcs(topo: Topology): number[][][] {
    const t = topo.transform
    return topo.arcs.map((arc) => {
        let x = 0
        let y = 0
        return arc.map(([dx, dy]) => {
            if (!t) return [dx as number, dy as number]
            x += dx as number
            y += dy as number
            return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]]
        })
    })
}

function ring(arcs: number[][][], idx: number[]): number[][] {
    const out: number[][] = []
    for (const i of idx) {
        const pts = i < 0 ? [...(arcs[~i] ?? [])].reverse() : (arcs[i] ?? [])
        out.push(...(out.length ? pts.slice(1) : pts))
    }
    return out
}

function topoGeometry(g: TopoGeometry, arcs: number[][][]): RegionFeature['geometry'] {
    if (g.type === 'Polygon') return { type: 'Polygon', coordinates: (g.arcs as number[][]).map((r) => ring(arcs, r)) }
    if (g.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: (g.arcs as number[][][]).map((p) => p.map((r) => ring(arcs, r))) }
    return null
}

/** Normalise GeoJSON or TopoJSON (first object, or `object`) to a FeatureCollection of polygons. */
export function toRegionCollection(input: ChoroplethGeometry | { default: ChoroplethGeometry }, object?: string): RegionCollection {
    const g = ('default' in input && input.default ? input.default : input) as ChoroplethGeometry
    if (g.type === 'FeatureCollection') return g
    if (g.type !== 'Topology') throw new Error('@asteby/metacore-maps: the choropleth loader must return GeoJSON or TopoJSON')
    const obj = g.objects[object ?? Object.keys(g.objects)[0] ?? '']
    if (!obj) throw new Error(`@asteby/metacore-maps: TopoJSON object "${object ?? ''}" not found`)
    const arcs = decodeArcs(g)
    const geoms = obj.type === 'GeometryCollection' ? (obj.geometries ?? []) : [obj]
    return {
        type: 'FeatureCollection',
        features: geoms.map((x) => ({ type: 'Feature', id: x.id, properties: x.properties ?? {}, geometry: topoGeometry(x, arcs) })),
    }
}

function hexRgb(c: string): [number, number, number] | null {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c)
    if (!m) return null
    const h = m[1]!.length === 3 ? m[1]!.replace(/./g, (d) => d + d) : m[1]!
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4), 16)]
}

/** `n` colours from a light tint to `base` (a hex colour; other formats fall back to the palette blue). */
export function sequentialRamp(base: string | undefined, n: number): string[] {
    const rgb = hexRgb(safeColor(base) ?? '') ?? hexRgb(DEFAULT_COLOR)!
    return Array.from({ length: n }, (_, i) => {
        const t = n === 1 ? 1 : 0.15 + (0.85 * i) / (n - 1)
        return '#' + rgb.map((v) => Math.round(255 + (v - 255) * t).toString(16).padStart(2, '0')).join('')
    })
}

export function regionKey(f: RegionFeature, keyProperty: string): string | undefined {
    const v = f.properties?.[keyProperty] ?? f.id
    return v == null || v === '' ? undefined : String(v)
}

export interface BuildOptions {
    keyProperty?: string
    labelProperty?: string
    steps?: number
    color?: string
}

/** Equal-interval bins over the values; regions without a value are grey. */
export function buildChoropleth(geo: RegionCollection, values: Record<string, number>, o: BuildOptions = {}) {
    const keyProperty = o.keyProperty ?? 'key'
    const labelProperty = o.labelProperty ?? 'name'
    const n = Math.max(2, Math.min(9, Math.floor(o.steps ?? 5)))
    const nums = Object.values(values).filter((v) => Number.isFinite(v))
    const min = nums.length ? Math.min(...nums) : 0
    const max = nums.length ? Math.max(...nums) : 0
    const ramp = sequentialRamp(o.color, n)
    const width = (max - min) / n
    const stepOf = (v: number) => (width === 0 ? n - 1 : Math.min(n - 1, Math.floor((v - min) / width)))
    const steps: ChoroplethStep[] = ramp.map((color, i) => ({ from: min + width * i, to: i === n - 1 ? max : min + width * (i + 1), color }))
    const regions: ChoroplethRegion[] = []
    const features: RegionFeature[] = []
    for (const f of geo.features) {
        const key = regionKey(f, keyProperty)
        if (!key || !f.geometry) continue
        const raw = values[key]
        const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
        const step = value === undefined ? -1 : stepOf(value)
        const color = step < 0 ? NO_DATA_COLOR : ramp[step]!
        const label = String(f.properties?.[labelProperty] ?? key)
        regions.push({ key, label, value, color, step })
        features.push({ ...f, properties: { ...f.properties, key, color } })
    }
    return { regions, steps, collection: { type: 'FeatureCollection', features } as RegionCollection }
}

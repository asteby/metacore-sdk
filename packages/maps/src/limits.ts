// Viewport limits resolution (kept out of `config.ts`, which the tiny registration entry imports).
import type * as ML from 'maplibre-gl'
import type { MapBounds, MapLimits } from './config'

export type { MapBounds }

/**
 * MapLibre 6 lanza un TypeError (resize -> constrainInternal -> setZoom -> _calcMatrices) cuando
 * los limites tocan exactamente +-180 de longitud (verificado con 6.14: [[-180,-85],[180,85]] falla,
 * [[-179.99,-84.99],[179.99,84.99]] funciona, tambien con contenedor 0x0). Todo limite se normaliza a
 * este margen en un solo sitio (normalizeBounds).
 */
export const MAP_EDGE = { lng: 179.99, lat: 84.99 } as const

export const DEFAULT_MAP_LIMITS: Required<MapLimits> = { renderWorldCopies: false, minZoom: 'auto', maxZoom: 18, maxBounds: [[-MAP_EDGE.lng, -MAP_EDGE.lat], [MAP_EDGE.lng, MAP_EDGE.lat]] }

const clamp = (v: number, edge: number): number => Math.max(-edge, Math.min(edge, v))

/** Recorta los limites al margen seguro de MapLibre; los invalidos (no numericos) se descartan. */
export function normalizeBounds(b: MapBounds | null | undefined): MapBounds | undefined {
    if (!b) return undefined
    const [[w, s], [e, n]] = b
    if (![w, s, e, n].every((v) => Number.isFinite(v))) return undefined
    return [[clamp(w, MAP_EDGE.lng), clamp(s, MAP_EDGE.lat)], [clamp(e, MAP_EDGE.lng), clamp(n, MAP_EDGE.lat)]]
}

/** World tile size at zoom 0 (MapLibre, 512 px tiles). */
const WORLD_PX = 512

/** MapLibre options for the limits: defaults, then host config, then the map's own props; `auto` minZoom from the container size. */
export function resolveMapLimits(cfg: MapLimits, own: MapLimits, size: { width: number; height: number }): Pick<ML.MapOptions, 'renderWorldCopies' | 'minZoom' | 'maxZoom' | 'maxBounds'> {
    const l = { ...DEFAULT_MAP_LIMITS, ...definedOnly(cfg), ...definedOnly(own) }
    const fit = Math.max(size.width, size.height)
    const auto = fit > 0 ? Math.max(0, Math.ceil(Math.log2(fit / WORLD_PX) * 100) / 100) : 0
    const maxZoom = l.maxZoom
    return {
        renderWorldCopies: l.renderWorldCopies,
        minZoom: Math.min(l.minZoom === 'auto' ? auto : l.minZoom, maxZoom),
        maxZoom,
        maxBounds: normalizeBounds(l.maxBounds),
    }
}

function definedOnly<T extends object>(o: T): Partial<T> {
    return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

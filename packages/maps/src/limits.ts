// Viewport limits resolution (kept out of `config.ts`, which the tiny registration entry imports).
import type * as ML from 'maplibre-gl'
import type { MapBounds, MapLimits } from './config'

export type { MapBounds }

export const DEFAULT_MAP_LIMITS: Required<MapLimits> = { renderWorldCopies: false, minZoom: 'auto', maxZoom: 18, maxBounds: [[-180, -85], [180, 85]] }

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
        maxBounds: l.maxBounds ?? undefined,
    }
}

function definedOnly<T extends object>(o: T): Partial<T> {
    return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

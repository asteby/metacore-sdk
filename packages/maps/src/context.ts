import * as React from 'react'
import type * as ML from 'maplibre-gl'
import type { MapLibreModule, MapScheme } from './config'

export interface MapContextValue {
    map: ML.Map
    ml: MapLibreModule
    scheme: MapScheme
    /** Bumps on every `style.load`: layers re-add themselves after a theme switch. */
    styleVersion: number
    reducedMotion: boolean
}

export const MapContext = React.createContext<MapContextValue | null>(null)

/** The map of the nearest `<MapView>`; throws outside one (a programming error). */
export function useMap(): MapContextValue {
    const v = React.useContext(MapContext)
    if (!v) throw new Error('@asteby/metacore-maps: this component must be rendered inside <MapView>')
    return v
}

/** Remove a layer/source if present (safe on a map whose style was replaced). */
export function removeLayers(map: ML.Map, layerIds: string[], sourceId: string): void {
    try {
        for (const id of layerIds) if (map.getLayer(id)) map.removeLayer(id)
        if (map.getSource(sourceId)) map.removeSource(sourceId)
    } catch {
        /* map already destroyed */
    }
}

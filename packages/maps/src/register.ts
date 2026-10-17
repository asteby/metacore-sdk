// Registers the map and timeline renderers with the runtime's declarative
// view registry. This module is tiny and MapLibre-free: call it once at host
// start-up (or from a remote); each renderer — and MapLibre itself — loads
// the first time a `map` view or panel actually renders.
import { registerPanelRenderer, registerViewRenderer } from '@asteby/metacore-runtime-react'
import { configureMaps, type MapsConfig } from './config'

export interface RegisterMapRenderersOptions {
    /** Host map configuration (base style URLs, PMTiles, default view). */
    config?: MapsConfig
    /** Also render `kind: timeline` panels as a TrackingTimeline (default true). */
    timeline?: boolean
}

/** Returns a function that restores the previous renderers. */
export function registerMapRenderers(opts: RegisterMapRenderersOptions = {}): () => void {
    if (opts.config) configureMaps(opts.config)
    const undo = [
        registerViewRenderer('map', () => import('./renderers/view')),
        registerPanelRenderer('map', () => import('./renderers/panel')),
    ]
    if (opts.timeline !== false) undo.push(registerPanelRenderer('timeline', () => import('./renderers/timeline-panel')))
    return () => {
        for (const u of undo.reverse()) u()
    }
}

export { configureMaps }

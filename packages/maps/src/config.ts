// Host configuration and the lazy MapLibre loader. Nothing here imports
// `maplibre-gl` statically: it is fetched the first time a map mounts, so a
// host (or an addon remote) that never shows a map pays 0 bytes for it.
import type * as ML from 'maplibre-gl'

export type MapLibreModule = typeof ML
export type MapStyle = string | ML.StyleSpecification
export type MapScheme = 'light' | 'dark'

/** Minimal PMTiles surface (`pmtiles` package): the protocol MapLibre registers. */
export interface PMTilesModule {
    Protocol: new () => { tile: (...args: any[]) => any }
}

export interface MapsConfig {
    /**
     * Base map style per colour scheme: a style JSON URL (the host's CDN) or an
     * inline style object. `pmtiles://` sources are supported when `pmtiles` is
     * configured. Without a style the map draws on a plain themed background —
     * the data layers and the list alternative still work, and no request is
     * made to any third party.
     */
    style?: { light?: MapStyle; dark?: MapStyle }
    /** Replace the default `import('maplibre-gl')` (tests, custom builds, CDN). */
    loadMaplibre?: () => Promise<MapLibreModule>
    /**
     * Enables `pmtiles://` styles: pass `() => import('pmtiles')` (the host
     * bundler resolves it; the package never imports it on its own).
     */
    pmtiles?: () => Promise<PMTilesModule>
    /** Inject the MapLibre CSS with the chunk. Default true. */
    injectCss?: boolean
    /** Initial view when there is nothing to fit: `[lng, lat]` and zoom. */
    center?: [number, number]
    zoom?: number
    /** Extra attribution text (the OSM credit of a basemap you serve). */
    attribution?: string
    /** Override the WebGL probe (default: try to create a context). */
    supportsWebGL?: () => boolean
}

let config: MapsConfig = {}
let maplibrePromise: Promise<MapLibreModule> | null = null
const protocolFor = new WeakSet<object>()

/** Merge host configuration. Call once, before the first map mounts. */
export function configureMaps(next: MapsConfig): void {
    config = { ...config, ...next, style: { ...config.style, ...next.style } }
    if (next.loadMaplibre) maplibrePromise = null
}

export function getMapsConfig(): Readonly<MapsConfig> {
    return config
}

/** Test helper: back to defaults and drop the cached module. */
export function resetMapsConfig(): void {
    config = {}
    maplibrePromise = null
}

export function supportsWebGL(): boolean {
    if (config.supportsWebGL) return config.supportsWebGL()
    try {
        const canvas = document.createElement('canvas')
        return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
    } catch {
        return false
    }
}

async function defaultLoad(): Promise<MapLibreModule> {
    const mod = (await import('maplibre-gl')) as unknown as { default?: MapLibreModule } & MapLibreModule
    return (mod.default ?? mod) as MapLibreModule
}

/**
 * Load MapLibre once (shared by every map on the page, and with the host when
 * `maplibre-gl` is a federation share). A failed load is not cached.
 */
export function loadMaplibre(): Promise<MapLibreModule> {
    if (!maplibrePromise) {
        const p = (async () => {
            const [mod] = await Promise.all([
                (config.loadMaplibre ?? defaultLoad)(),
                config.injectCss === false || config.loadMaplibre
                    ? Promise.resolve()
                    : // CSS side-effect import, resolved by the host bundler
                      import('maplibre-gl/dist/maplibre-gl.css').catch(() => undefined),
            ])
            return mod
        })()
        maplibrePromise = p
        p.catch(() => {
            if (maplibrePromise === p) maplibrePromise = null
        })
    }
    return maplibrePromise
}

const hasPmtiles = (style: MapStyle | undefined): boolean =>
    !!style && (typeof style === 'string' ? style.startsWith('pmtiles://') : JSON.stringify(style).includes('pmtiles://'))

/** Register the `pmtiles://` protocol once per MapLibre when the style needs it. */
export async function ensureProtocols(ml: MapLibreModule, style: MapStyle | undefined): Promise<void> {
    if (!hasPmtiles(style) || protocolFor.has(ml) || !config.pmtiles) return
    const { Protocol } = await config.pmtiles()
    ml.addProtocol('pmtiles', new Protocol().tile)
    protocolFor.add(ml)
}

/** Themed blank style: a background only (no network, no glyphs). */
export function blankStyle(scheme: MapScheme): ML.StyleSpecification {
    return {
        version: 8,
        sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': scheme === 'dark' ? '#16181d' : '#eef1f4' } }],
    }
}

/** Raster style over `{z}/{x}/{y}` tile URLs you serve (no key needed). */
export function rasterStyle(tiles: string[], attribution?: string, tileSize = 256): ML.StyleSpecification {
    return {
        version: 8,
        sources: { base: { type: 'raster', tiles, tileSize, attribution } },
        layers: [{ id: 'base', type: 'raster', source: 'base' }],
    }
}

export function resolveStyle(scheme: MapScheme, override?: { light?: MapStyle; dark?: MapStyle } | MapStyle): MapStyle {
    const o = override && (typeof override === 'string' || 'version' in override) ? { light: override, dark: override } : override
    const s = (o as { light?: MapStyle; dark?: MapStyle } | undefined)?.[scheme] ?? config.style?.[scheme] ?? config.style?.light
    return s ?? blankStyle(scheme)
}

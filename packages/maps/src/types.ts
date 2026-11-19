import type { GeoPoint } from '@asteby/storefront/geo'

export type { GeoPoint }

/** How exact a location is. `city` / `country` are approximate (a centroid): drawn as one count bubble per place, never as stacked pins. */
export type MapPrecision = 'exact' | 'city' | 'country'

/** A feature on the map. `key` is stable (record id); `status` is shown as text, never colour alone. */
export interface MapPointItem {
    key: string
    lat: number
    lng: number
    /** Accessible name and list label. */
    label: string
    /** Option key (e.g. `in_transit`); tints the marker and is printed in the list. */
    status?: string
    /** Human text of `status` (option label); shown instead of the key. */
    statusLabel?: string
    /** Explicit colour (CSS hex); wins over `status`. */
    color?: string
    /** One or two characters drawn inside DOM markers (e.g. the stop number). */
    glyph?: string
    /** Location accuracy (default `exact`). Approximate points aggregate into a bubble and zoom is capped on select. */
    precision?: MapPrecision
    /** Place name of an approximate location (e.g. `CA`): printed on its bubble as `CA · 8`. */
    area?: string
    /** Logo / photo URL of the point (https or same-origin path; anything else is ignored). Shown as a round avatar on pins, fan, popup and lists. */
    image?: string
    /** Brand colour (hex / rgb / hsl): tints the initials shown while `image` is missing or fails to load. The status colour stays on the avatar ring. */
    accent?: string
    /** Second line under the name in popups and lists (e.g. a host or an address). */
    subtitle?: string
    /** Extra popup rows, in order. */
    details?: Array<{ label?: string; value: string; /** Source column of the row (lets the host label it). */ field?: string }>
}

/** Polygon ring list in GeoJSON order (`[lng, lat]`), first ring = outer. */
export type PolygonCoords = number[][][]

export interface ZoneItem {
    key: string
    label?: string
    color?: string
    /** Polygon rings (GeoJSON) — or a circle: `center` + `radiusM`. */
    polygon?: PolygonCoords
    center?: GeoPoint
    radiusM?: number
}

/** UI strings; Spanish by default, hosts pass their own translations. */
export interface MapLabels {
    list: string
    map: string
    showList: string
    hideList: string
    empty: string
    openInMap: string
    unavailable: string
    zoomIn: string
    zoomOut: string
    latitude: string
    longitude: string
    useMyLocation: string
    search: string
    searchPlaceholder: string
    noResults: string
    pickerHint: string
    point: string
    zone: string
    loading: string
    /** Cluster hover text; `{n}` is the member count. */
    clusterCount: string
    /** Overflow row of a cluster list; `{n}` is how many are not listed. */
    moreItems: string
    /** Back from a member's detail to its area list. */
    backToList: string
    /** Close a detail / area panel. */
    closeDetail: string
    /** Accessible name of the legend by status. */
    legendByStatus: string
    /** Accessible name of the legend by group. */
    legendByGroup: string
}

export const DEFAULT_LABELS: MapLabels = {
    list: 'Lista de ubicaciones',
    map: 'Mapa',
    showList: 'Ver lista',
    hideList: 'Ocultar lista',
    empty: 'No hay ubicaciones para mostrar.',
    openInMap: 'Abrir en mapa',
    unavailable: 'El mapa interactivo no está disponible en este navegador. Usa la lista.',
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    latitude: 'Latitud',
    longitude: 'Longitud',
    useMyLocation: 'Usar mi ubicación',
    search: 'Buscar',
    searchPlaceholder: 'Dirección o código postal',
    noResults: 'Sin resultados.',
    pickerHint: 'Haz clic en el mapa o arrastra el pin. También puedes escribir las coordenadas.',
    point: 'Ubicación',
    zone: 'Zona',
    loading: 'Cargando mapa…',
    clusterCount: '{n} instancias',
    moreItems: '+{n} más',
    backToList: 'Volver a la lista',
    closeDetail: 'Cerrar',
    legendByStatus: 'Leyenda por estado',
    legendByGroup: 'Leyenda por grupo',
}

export function mergeLabels(l?: Partial<MapLabels>): MapLabels {
    return l ? { ...DEFAULT_LABELS, ...l } : DEFAULT_LABELS
}

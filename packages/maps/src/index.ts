// @asteby/metacore-maps — lazy maps for metacore. This entry never imports
// `maplibre-gl` statically: it is fetched when the first <MapView> mounts.
export { MapView, type MapViewProps } from './map-view'
export { Marker, ClusterLayer, Polyline, Route, Geofence, ChoroplethLayer, ChoroplethList, useChoropleth, useFitBounds, CLUSTER_THRESHOLD, type MarkerProps, type ClusterLayerProps, type PolylineProps, type RouteProps, type GeofenceProps, type ChoroplethLayerProps, type ChoroplethListProps, type ChoroplethOptions, type ChoroplethState } from './layers'
export { LocationPicker, type LocationPickerProps, type GeocodeResult } from './location-picker'
export {
    TrackingTimeline,
    sortTrackingEvents,
    toTrackingEvents,
    DEFAULT_TIMELINE_LABELS,
    type TrackingEvent,
    type TrackingTone,
    type TrackingTimelineProps,
    type TrackingTimelineLabels,
    type TrackingFieldMap,
} from './tracking-timeline'
export { MapList, type MapListProps } from './map-list'
export { useMap, type MapContextValue } from './context'
export { useMapScheme } from './theme'
export {
    configureMaps,
    getMapsConfig,
    loadMaplibre,
    blankStyle,
    rasterStyle,
    supportsWebGL,
    type MapsConfig,
    type MapStyle,
    type MapScheme,
    type MapLibreModule,
    type PMTilesModule,
} from './config'
export { boundsOf, circlePolygon, pointsToGeoJSON, zonesToGeoJSON } from './geometry'
export { colorFor, PALETTE } from './palette'
export { DEFAULT_LABELS, type MapLabels, type MapPointItem, type ZoneItem, type PolygonCoords, type GeoPoint } from './types'
// Geo maths are shared with the storefronts: re-exported, not copied.
export { distanceKm, formatDistance, isValidPoint, parseLatLng, directionsUrl } from '@asteby/storefront/geo'
export { buildChoropleth, sequentialRamp, toRegionCollection, type ChoroplethLoader, type ChoroplethGeometry, type ChoroplethRegion, type ChoroplethStep, type RegionCollection } from './choropleth'

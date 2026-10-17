---
'@asteby/metacore-maps': minor
---

Nuevo paquete `@asteby/metacore-maps`: mapas perezosos para ERP y addons. `MapView` (puntos, popups, lista equivalente accesible, tema claro/oscuro, sin claves de API), `Marker`, `ClusterLayer`, `Polyline`/`Route`, `Geofence`, `LocationPicker` y `TrackingTimeline`, más los renderers del contrato declarativo del kernel (`view_type: map`, paneles `map` y `timeline`) que `registerMapRenderers()` registra en el registro de `@asteby/metacore-runtime-react`. MapLibre GL se carga bajo demanda (peer y share perezoso), el mapa base es un estilo/PMTiles configurable por URL del host y el chunk inicial pesa ~11 KB gzip (presupuesto verificado por prueba). La matemática geográfica es la de `@asteby/storefront/geo`, sin copia.

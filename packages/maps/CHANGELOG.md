# @asteby/metacore-maps

## 0.1.4

### Patch Changes

- Updated dependencies [a890e3c]
  - @asteby/storefront@0.9.0

## 0.1.3

### Patch Changes

- Updated dependencies [14274d0]
  - @asteby/storefront@0.8.0

## 0.1.2

### Patch Changes

- Updated dependencies [361ad9b]
  - @asteby/storefront@0.7.0

## 0.1.1

### Patch Changes

- Updated dependencies [7201b08]
- Updated dependencies [f69aa91]
  - @asteby/storefront@0.6.0

## 0.1.0

### Minor Changes

- 56f8039: Nuevo paquete `@asteby/metacore-maps`: mapas perezosos para ERP y addons. `MapView` (puntos, popups, lista equivalente accesible, tema claro/oscuro, sin claves de API), `Marker`, `ClusterLayer`, `Polyline`/`Route`, `Geofence`, `LocationPicker` y `TrackingTimeline`, más los renderers del contrato declarativo del kernel (`view_type: map`, paneles `map` y `timeline`) que `registerMapRenderers()` registra en el registro de `@asteby/metacore-runtime-react`. MapLibre GL se carga bajo demanda (peer y share perezoso), el mapa base es un estilo/PMTiles configurable por URL del host y el chunk inicial pesa ~11 KB gzip (presupuesto verificado por prueba). La matemática geográfica es la de `@asteby/storefront/geo`, sin copia.

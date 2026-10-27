# @asteby/metacore-maps

## 0.2.13

### Patch Changes

- Updated dependencies [c58aaaf]
  - @asteby/storefront@0.25.0

## 0.2.12

### Patch Changes

- Updated dependencies [d5e771e]
  - @asteby/storefront@0.24.0

## 0.2.11

### Patch Changes

- Updated dependencies [418f618]
  - @asteby/storefront@0.23.0

## 0.2.10

### Patch Changes

- Updated dependencies [2a35c2d]
  - @asteby/storefront@0.22.0

## 0.2.9

### Patch Changes

- Updated dependencies [e78bdbe]
  - @asteby/storefront@0.21.0

## 0.2.8

### Patch Changes

- Updated dependencies [c1fda71]
  - @asteby/storefront@0.20.0

## 0.2.7

### Patch Changes

- Updated dependencies [add7104]
  - @asteby/storefront@0.19.0

## 0.2.6

### Patch Changes

- Updated dependencies [811828e]
- Updated dependencies [2e223d7]
  - @asteby/storefront@0.18.0

## 0.2.5

### Patch Changes

- Updated dependencies [72d9dbf]
  - @asteby/storefront@0.17.0

## 0.2.4

### Patch Changes

- Updated dependencies [234ed7d]
  - @asteby/storefront@0.16.0

## 0.2.3

### Patch Changes

- Updated dependencies [f556c63]
  - @asteby/storefront@0.15.0

## 0.2.2

### Patch Changes

- Updated dependencies [358a1f4]
  - @asteby/storefront@0.14.0

## 0.2.1

### Patch Changes

- Updated dependencies [361af35]
  - @asteby/storefront@0.13.0

## 0.2.0

### Minor Changes

- 8a8e0e9: `ChoroplethLayer`: coropleta para `<MapView>`. Recibe un loader perezoso de GeoJSON/TopoJSON aportado por el host o la región (el SDK no incluye geometrías), valores por clave y una escala secuencial derivada de la paleta existente. Se exportan también `useChoropleth` y `ChoroplethList` (tabla accesible con cada región y su valor).

## 0.1.7

### Patch Changes

- Updated dependencies [67ccba1]
  - @asteby/storefront@0.12.0

## 0.1.6

### Patch Changes

- Updated dependencies [83e476b]
- Updated dependencies [4f10283]
  - @asteby/storefront@0.11.0

## 0.1.5

### Patch Changes

- Updated dependencies [638eed6]
  - @asteby/storefront@0.10.0

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

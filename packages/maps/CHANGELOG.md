# @asteby/metacore-maps

## 0.9.13

### Patch Changes

- Updated dependencies [fb26e74]
  - @asteby/storefront@0.55.0

## 0.9.12

### Patch Changes

- Updated dependencies [8feefca]
  - @asteby/storefront@0.54.0

## 0.9.11

### Patch Changes

- Updated dependencies [ca6fbdd]
  - @asteby/storefront@0.53.0

## 0.9.10

### Patch Changes

- Updated dependencies [9b1f096]
  - @asteby/storefront@0.52.0

## 0.9.9

### Patch Changes

- Updated dependencies [00b4539]
  - @asteby/storefront@0.51.0

## 0.9.8

### Patch Changes

- Updated dependencies [7695cb4]
  - @asteby/storefront@0.50.0

## 0.9.7

### Patch Changes

- Updated dependencies [3f31ee1]
  - @asteby/storefront@0.49.0

## 0.9.6

### Patch Changes

- Updated dependencies [a166f35]
  - @asteby/storefront@0.48.0

## 0.9.5

### Patch Changes

- Updated dependencies [bfa39fc]
  - @asteby/storefront@0.47.0

## 0.9.4

### Patch Changes

- Updated dependencies [c1384b1]
  - @asteby/storefront@0.46.0

## 0.9.3

### Patch Changes

- Updated dependencies [ca10995]
  - @asteby/storefront@0.45.0

## 0.9.2

### Patch Changes

- b581227: fix(maps): «Volver a la lista» y «Cerrar» del panel de detalle del bloque `map` ahora son botones reales (borde, relleno y padding propios con tokens del tema) en lugar de texto plano cuando el host resetea los botones. El cierre del panel de área reutiliza el mismo `PanelButton`.

## 0.9.1

### Patch Changes

- 6c3d83b: Fondo de logos por colores dominantes (el blanco de un logo no claro es «papel», y el oscuro solo gana el desempate por >= 0.5): `imageTone` devuelve `lightShare` / `darkShare` / `midShare` y `dominant`; nueva regla única `logoBacking` (logo claro: marca u oscuro; oscuro, de color o multicolor: placa clara con anillo de la marca; la marca solo es fondo si separa todos los colores dominantes). Corrige logos de dos colores (ProtekAuto: naranja sobre naranja). Vectores `logo-backing-vectors.json` para el espejo Go. Maps pinta el anillo de marca sobre la placa.
- Updated dependencies [6c3d83b]
  - @asteby/metacore-theme@2.35.0

## 0.9.0

### Minor Changes

- deadc55: Contraste dinámico WCAG: primitivo único `onColor` / `pickBacking` / `ensureContrast` / `imageTone` (+ hooks) en `@asteby/metacore-theme`, tokens `--tone-*` / `--on-tone-*` con prueba de pares, vectores de conformidad compartidos con el kernel Go. `Badge` acepta `color` de runtime. Maps: texto de burbujas y chips con `onColor` (antes blanco sobre rosa/ámbar), avatar de logo elige fondo según el tono del logo (logo blanco sobre color de marca) y usa píldora para logos apaisados, etiquetas del mapa oscuro elevadas a ≥ 4.5:1, y la lista del panel de área llena todo el alto del panel (sin max-height fijo) con sombras de scroll.

### Patch Changes

- Updated dependencies [deadc55]
  - @asteby/metacore-theme@2.34.0

## 0.8.0

### Minor Changes

- 02135ca: maps: con `precision: "country" | "city"` las instancias que comparten centroide ya NO se abren en abanico (spiderfy): cada area es UNA burbuja con el recuento, teñida por el estado dominante (o el color de los miembros) y, con logos, hasta 3 avatares apilados + «+N». Al hacer clic:

  - bloque genui `map` con `detail_panel: true`: el panel lateral lista los miembros del area (scroll interno, avatar/logo, titulo, `subtitle_field`, insignia de estado traducida con su tono; flechas/Home/End/Esc; al elegir uno se abre su ficha con «Volver a la lista»).
  - sin panel (o `MapView` suelto): un popup con la lista de miembros (con scroll). Nuevo `onArea(area)` en `MapView` / `ClusterLayer` para que el host pinte su propio panel.
  - el spiderfy queda solo para puntos `exact` realmente coincidentes.

  Popup y panel dejan de duplicarse: con `detail_panel` el popup es un resumen (titulo + subtitulo + estado, `popupDetails={false}`) y las propiedades viven en el panel; ademas no se repiten como fila el titulo, el subtitulo ni el estado.

  Etiquetas e i18n (sin propiedades nuevas en el esquema): las columnas se rotulan con el `t` del host bajo `map.field.<columna>` y los estados bajo `map.status.<valor>`; sin traduccion se humaniza (`ops_version` -> «Ops version», `live_24h` -> «Live 24h»), nunca la clave cruda. El codigo de pais del area se muestra con `Intl.DisplayNames` en el idioma del host (`GT` -> «Guatemala»). Los textos nuevos (`backToList`, `closeDetail`, `legendByStatus`, `legendByGroup`) van por `metacore.maps.*` con valores por defecto en español; se elimina el truco `hideList.replace(/lista/, 'detalle')`.

  El bloque tambien LEE `field_labels` y `status_labels` (mapas columna/estado -> texto o `{ $t }`), que ganan sobre la convencion, pero el esquema genui/v2 actual no los admite todavia.

  SIGUIENTE PASO, REQUIERE RELEASE DEL KERNEL (esquema JSON + validadores Go/TS de genui/v2; este repo no los toca): propiedades nuevas del bloque `map`:

  1. `field_labels`: objeto `{ <columna>: label }` (label = string o `{ "$t": clave, "args"? }`), claves con el patron de `status_tones`, maximo 16 (o 32) propiedades.
  2. `status_labels`: objeto `{ <valor de estado>: label }`, mismo patron y limite que `status_tones`.

  genui: `normalizeMapPoints` anade `field` (columna de origen) a cada fila de detalle construida desde `source`, para que el host la rotule; `label` sigue siendo la clave cruda (compatible).

## 0.7.0

### Minor Changes

- 0b9ad54: Logo por punto en los mapas (multiindustria: tiendas, sucursales, dependencias, vehiculos, instancias).

  - `MapPointItem.image` / `accent` / `subtitle`. Los pines del abanico (spiderfy), los marcadores individuales, el popup (encabezado logo + nombre + subtitulo + chip de estado), la lista bajo el mapa y las filas de la lista de cluster muestran un avatar circular con anillo del color de estado y borde que contrasta en claro y oscuro. Sin imagen o si falla la carga: iniciales con el color de marca (`accent`) o gris neutro; `aria-label`/`alt` con el nombre. El numero solo queda cuando ningun punto del mapa tiene logo ni color (mapas sin marca: igual que antes).
  - Capas WebGL: un overlay perezoso (chunk aparte, solo si hay puntos con logo) pone avatares DOM sobre los puntos visibles (maximo 50 por vista; por encima quedan los circulos) y mosaicos de hasta 3 logos + conteo sobre clusters y burbujas de precision pais/ciudad. Se eligieron marcadores DOM y no capas `symbol` + `map.addImage` (ver `logo-overlay.ts`): `<img>` real con `loading=lazy`, `referrerPolicy=no-referrer`, sin `crossOrigin` (no se dibuja en canvas), fallback de iniciales y foco/nombre accesibles.
  - Seguridad: solo se cargan imagenes `https:` o rutas del mismo origen; `http:`, `data:`, `javascript:` y `//host` se descartan; los colores pasan por `safeColor`.
  - genui `map`: `image_field`, `color_field` y `subtitle_field` (esquema sincronizado con el kernel); no se repiten como filas de detalle. Vista de nav `map`: los mismos tres campos. `GenUIMapPoint` gana `image`, `accent`, `subtitle`.
  - Atribucion de OpenFreeMap legible en tema oscuro (fondo y texto theme-aware con mas especificidad que el CSS compacto de MapLibre).
  - `size-budget`: el chunk inicial sube de 17 a 20 KB gzip por las primitivas de avatar.

## 0.6.3

### Patch Changes

- Updated dependencies [a333e29]
  - @asteby/storefront@0.44.0

## 0.6.2

### Patch Changes

- 60f1f02: Fix: la capa `mcm-points-halo` (halo de contraste del tema oscuro) usaba un radio `['+', ['interpolate', ..., ['zoom'], ...], 6]` que MapLibre rechaza («"zoom" expression may only be used as input to a top-level "step" or "interpolate" expression»), de modo que el halo no se dibujaba. El radio se construye ahora con un `interpolate` de nivel superior (`zoomRadius`) para los puntos y el halo.

## 0.6.1

### Patch Changes

- bd0d61e: Fix: el mapa caia a la lista de reserva («El mapa interactivo no esta disponible en este navegador») con los limites por defecto de 0.5/0.6. MapLibre 6 lanza un `TypeError` (resize -> constrainInternal -> setZoom -> _calcMatrices) cuando `maxBounds` toca exactamente +-180 de longitud. Los limites (por defecto, de `configureMaps` o de la prop) se normalizan ahora a +-179.99 / +-84.99 en un solo sitio (`normalizeBounds`), y un fallo al crear el mapa ya no se traga en silencio (`console.warn`).

## 0.6.0

### Minor Changes

- b38b032: El bloque `map` de genui/v2 admite `popup` (columnas de la fuente que se muestran al seleccionar un punto, max 8), `precision` (`exact|city|country`, constante), `precision_field` (columna con la precision por fila; excluyente con `precision`) y `area_field` (columna con el area o codigo, p. ej. `country_iso`). Mismos nombres y semantica que `MapView` del kernel (metacore-kernel#632 y #634). Esquema, vectores de conformidad (2 validos, 5 invalidos), tipos generados y `validate-v2.ts` sincronizados con el kernel; `popup`, `precision_field` y `area_field` solo aplican con `source`. `normalizeMapPoints` rellena `GenUIMapPoint.precision` y `area` (exports nuevos `MAP_PRECISIONS` y `MapPrecision`) y, con `popup`, los detalles son esas columnas en ese orden; sin `popup` el comportamiento no cambia. El renderer `map` de `@asteby/metacore-maps` pasa `precision` y `area` a `MapPointItem` (burbujas por precision, spiderfy) y el titulo del punto sigue siendo `fields.label`.

## 0.5.0

### Minor Changes

- 76674ad: Mapa: UX de ubicaciones aproximadas y coincidentes.

  - Spiderfy: los miembros que comparten ubicacion (cluster atascado, burbuja o punto con vecinos) se despliegan en circulo/espiral con lineas guia; cada pin es un boton con popup, se cierra con Esc, clic fuera o al alejar el zoom (mas de 24 miembros: lista).
  - Precision: `MapPointItem.precision?: 'exact' | 'city' | 'country'` y `area?` (texto de la burbuja, "CA · 8"). Los puntos aproximados se agregan en una burbuja por ubicacion (radio ~ raiz del conteo). Tope de zoom al seleccionar/ajustar: country 5, city 10 (prop `precisionZoom`, export `DEFAULT_PRECISION_ZOOM`); exact usa `selectZoom`.
  - Popup/lista pulidos y con tema: titulo, estado como chip con el color del estado, filas clave:valor, ancho maximo, cierre visible; hover con "N instancias".
  - Tema oscuro: halo bajo puntos y burbujas, controles y atribucion oscuros, fondo base menos negro.
  - Limites de viewport configurables (props de `MapView` o `configureMaps`): `renderWorldCopies: false`, `minZoom: 'auto'` (el mundo llena el contenedor), `maxZoom: 18`, `maxBounds` [-180,-85]..[180,85] (`null` lo desactiva). Ya no se repite el mundo ni se triplican clusters.
  - Titulo del punto en el renderer `view_type: map`: primera columna de `popup`, luego `name > title > label > host`, por ultimo el id. El renderer lee `precision`, `precision_field` y `area_field` de la vista; estos campos aun no estan en el esquema del kernel (`view.map`): cambio aditivo y opcional pendiente.
  - Presupuesto de tamano del chunk inicial: 15 KB -> 17 KB gzip.

## 0.4.0

### Minor Changes

- 3ec0481: Mapa: los clusters con puntos en las mismas coordenadas (p. ej. centroides de país) ya no hacen zoom a un mapa vacío; muestran una lista de miembros clicable (max. 10 + "+N más") que dispara `onSelect`, y el zoom de un cluster se limita a 14. Nueva prop `selectZoom` (13 por defecto) y seleccionar un punto con vecinos en las mismas coordenadas solo centra, sin acercar. Tooltip al pasar el cursor sobre puntos y clusters (texto plano, nuevos labels `clusterCount` y `moreItems`). Colores de cluster y puntos dependientes del tema (anillo y azul más claro en oscuro, radio mínimo mayor).

## 0.3.1

### Patch Changes

- Updated dependencies [4c3c390]
  - @asteby/storefront@0.43.0

## 0.3.0

### Minor Changes

- 171fb0f: genui/v2 fase 1: bloques `map`, `metric` y `diagram` en el contrato (esquema, reglas por posición y vectores de conformidad compartidos con el kernel), `GenUIProvider` + `registerGenUIBlockRenderer`, renderer `GenUI` (acepta v1 y v2) con bloques stack, grid, tabs, section, text, markdown seguro (sin HTML), alert, empty, card, list, metric y diagram (SVG con layout automático). `@asteby/metacore-maps/genui` registra el bloque `map` como fachada sobre MapView (tono por estado, leyenda por agrupación, tooltip al hover, panel de detalle). `GenerativeUI` (v1) no cambia.

## 0.2.30

### Patch Changes

- Updated dependencies [5739ea0]
- Updated dependencies [8bef179]
  - @asteby/storefront@0.42.0

## 0.2.29

### Patch Changes

- Updated dependencies [71bd819]
  - @asteby/storefront@0.41.0

## 0.2.28

### Patch Changes

- Updated dependencies [0b61717]
- Updated dependencies [cf1eb59]
  - @asteby/storefront@0.40.0

## 0.2.27

### Patch Changes

- Updated dependencies [fb5af45]
  - @asteby/storefront@0.39.0

## 0.2.26

### Patch Changes

- Updated dependencies [1bb0c18]
  - @asteby/storefront@0.38.0

## 0.2.25

### Patch Changes

- Updated dependencies [d5d7e75]
  - @asteby/storefront@0.37.0

## 0.2.24

### Patch Changes

- Updated dependencies [9925a86]
  - @asteby/storefront@0.36.0

## 0.2.23

### Patch Changes

- Updated dependencies [191462c]
- Updated dependencies [9f78ce8]
  - @asteby/storefront@0.35.0

## 0.2.22

### Patch Changes

- Updated dependencies [37bcb7e]
  - @asteby/storefront@0.34.0

## 0.2.21

### Patch Changes

- Updated dependencies [1681a04]
  - @asteby/storefront@0.33.0

## 0.2.20

### Patch Changes

- Updated dependencies [ef85c84]
  - @asteby/storefront@0.32.0

## 0.2.19

### Patch Changes

- Updated dependencies [dafd2d9]
  - @asteby/storefront@0.31.0

## 0.2.18

### Patch Changes

- Updated dependencies [91731ca]
  - @asteby/storefront@0.30.0

## 0.2.17

### Patch Changes

- Updated dependencies [11525c4]
  - @asteby/storefront@0.29.0

## 0.2.16

### Patch Changes

- Updated dependencies [8f47538]
- Updated dependencies [ee1701a]
  - @asteby/storefront@0.28.0

## 0.2.15

### Patch Changes

- Updated dependencies [7371859]
  - @asteby/storefront@0.27.0

## 0.2.14

### Patch Changes

- Updated dependencies [5bc2f61]
  - @asteby/storefront@0.26.0

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

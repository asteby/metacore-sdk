# @asteby/metacore-genui

## 2.13.0

### Minor Changes

- 14be603: genui: los textos fijos de v2, paginas y bloques de tablero salen del `t` del `GenUIProvider` (claves `genui.*`, respaldo en espanol; hook `useGenUILabel`). i18n: claves `genui.*` en es y en.

## 2.12.0

### Minor Changes

- b37cc36: SeriesView: `toggle="single"` (un solo boton "Ver tabla" / "Ver grafica") y `toolbar` (contenido en la misma fila, p. ej. la leyenda).

## 2.11.0

### Minor Changes

- 2a21374: Puente entre el grafo de pagina y la fusion de overlays de Loom: `toBlockGraph` / `fromBlockGraph` (arbol <-> lista plana `{ id, type, region, config, fallback }`, sin perdida para add/remove/move/configure/replace). `props` ya no admite la clave `visible` (la gobierna el nodo).

## 2.10.0

### Minor Changes

- c33245e: Pagina como datos: `genui.page-graph/v1` (arbol de nodos con id estable, visibilidad por permiso/ajuste/estado, `fallback_node`), `parsePageGraph`, `resolveGraph`, `indexGraph`, `pageToGraph` y `PageGraphView` con aislamiento de error por bloque. Bloques de tablero que el kit no tenia: `RankedList`, `SeriesView` y `BlockState` (sobre `DataState`). `section` y los bloques del nucleo usan `BlockState` para cargando/error/vacio (se conservan los marcadores `source-*` y `section-*`).

## 2.9.3

### Patch Changes

- 5dae350: `createHostApiClient(api, { defaultHeaders })`, `useHostApiClient({ defaultHeaders })` y `headers` por llamada (`X-Correlation-ID`...), aditivo. El host descarta las cabeceras que posee (Authorization, X-Organization-ID, X-Branch-ID, Accept-Language, Cookie...; `PROTECTED_HOST_HEADERS`). `HostApiRequestOptions.headers` en sdk. Ademas sdk, genui, ui y runtime-react reescriben en postbuild sus imports relativos de `dist/` con extension (`.js`) para que Node ESM los resuelva.
- Updated dependencies [5dae350]
  - @asteby/metacore-lib@0.12.1

## 2.9.2

### Patch Changes

- Updated dependencies [4b0ce51]
  - @asteby/metacore-lib@0.12.0

## 2.9.1

### Patch Changes

- 2393365: Formateo unificado en `@asteby/metacore-lib`, sin defaults regionales.

  - lib (minor): `formatAmount` (moneda con decimales propios de la divisa via Intl: JPY 0, KWD 3; sin moneda -> numero plano sin simbolo), `formatLocalizedDate`, `relativeTime`, `formatBytes`, `compareVersions`. `formatCurrency` queda `@deprecated` con el mismo comportamiento. Solo presentacion: el calculo/redondeo va en `MoneyValue` y en moneykit del backend.
  - app-providers: nuevo `useFormatMoney()` (moneda y locale de `useOrgConfig`). `FALLBACK_ORG_CONFIG` ahora tiene `currency`/`locale` vacios (antes `USD`/`en-US`): una org sin configurar ya no inventa moneda.
  - genui, runtime-react (panels, card-spec), charts: se quitan los fallbacks `MXN`/`USD`; sin moneda se muestra el numero sin simbolo. `ConfigurableCard`/`resolveCard` aceptan `currency`.
  - dataload, inbox: `formatBytes` delega en lib (inbox: 10-100 KB ahora muestra un decimal).

- Updated dependencies [2393365]
  - @asteby/metacore-lib@0.11.0

## 2.9.0

### Minor Changes

- ab09b50: Bloque `table` con mejor UX: `column.format` ahora se aplica (incluido `relative_date`, con la configuración regional del host y unidad hora/minuto), columnas `variant` (`text` | `badge` | `icon_text`) con `tones`, `labels` (`$t` resuelto con el `t` del host; sin etiqueta se humaniza el valor, nunca la clave cruda) e `icons` (resueltos con `resolveIcon`; los desconocidos se omiten), `max_height` (`sm` | `md` | `lg`, tokens en `TABLE_MAX_HEIGHT`) con scroll interno por teclado y cabecera fija, y `density: "compact"` que en contenedor estrecho usa filas compactas en lugar de tarjetas apiladas. Nuevos exports: `TableView`, `TABLE_MAX_HEIGHT`, `humanize`, `toTone`, `lookupGenUIIcon`. Retrocompatible: sin las propiedades nuevas el render no cambia. Esquema sincronizado con el kernel (PR #639) y regla `tones`/`labels`/`icons` solo con `variant` badge o icon_text en el validador; 16 vectores `table-*` de conformidad.

### Patch Changes

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

## 2.8.0

### Minor Changes

- 40fa7a5: `GenUIBody` pasa al SDK con un adaptador de host inyectable (`genui.host/v1`) y el chat de Aby pinta embeds `type:"ui"` genui/v2 con ese mismo componente.

  **genui** (`@asteby/metacore-genui`, submodulo `host`)
  - `GenUIBody({ scope, ui, host, syncUrl, refetchIntervalMs, loadingFallback })`: reutiliza `GenUIProvider` + `PageView` (PageProvider/PageBlocks); no dibuja bloques por su cuenta. Un solo camino de render para paginas, Tablero y chat.
  - `GenUIHostAdapter` (todo opcional): `sources: SourceResolver` (el host implementa `q:`/`t:`/`r:`/`widget`/`inline` por su compuerta; sin resolver las fuentes quedan en «sin acceso», nunca se inventan filas), `can`, `onAction`, `onNavigate` (el SDK solo entrega rutas internas seguras), `t`, `locale`, `currency`, `ctx`, `resolveIcon`, `urlState`, `connectBus`, `customBlocks(names)`, `lazyBlocks` (carga perezosa por tipo de bloque, p. ej. `map`), `allowExternalLinks` (default `false`), `labels`.
  - Estados por fuente aislados: cargando / error con reintento / sin permiso (`SourceDeniedError`, `denied === true`); una fuente caida no tumba las demas. Los bloques hoja (`metric`, `chart`, `table`...) muestran el estado de su fuente en vez de quedarse en blanco.
  - `chart`, `table` y demas bloques v1 con `source` ahora reciben las filas de la fuente del host (antes solo leian `rows` inline).
  - Utilidades genericas que los hosts duplicaban: `isSafeInternalPath`, `collectCustomBlockNames`, `collectBlockTypes`, `createHistoryUrlAdapter` (+ `encode/decodeUrlStateValue`), `createActionHandler(policy)` (lista blanca de verbos y de ids de `emit`; lo no permitido se ignora y se reporta con `onBlocked`).

  **agent-workspace**
  - Registra el renderer de `ui` (`createAgentUiResult`, `prepareAgentUi`): valida con `allowExternalLinks:false`, mejora v1 a v2, degrada a las capacidades del chat (`AGENT_UI_CHAT_BLOCKS`, `fallback` por bloque), nunca monta `ext`/`slot`/`component`, y si el documento no valida muestra su texto plano. Adaptador por defecto seguro: sin enlaces externos, fuentes solo `inline`, `can` niega todo, acciones limitadas a `navigate` interno y `emit` de ids en lista blanca (`invoke`/`submit` nunca llegan a ningun host). El host lo sustituye con `registerAgentResultRenderer('ui', createAgentUiResult({ host: { sources, can, ... } }))`.
  - Los renderers `chart` (`AbyChartEmbed`) y el v1 (`createGenerativeUIResult`) siguen intactos; se retiran en la fase F7 del plan.
  - Nueva dependencia (peer/dev) en `@asteby/metacore-genui`.

  **Cambio exacto para Ops (PR asteby-hq/ops#2373, NO incluido aqui)**: `features/metacore/genui-body.tsx` pasa a ser un wrapper fino de `GenUIBody` del SDK:
  - `host.sources = { resolve: ({ def }) => resolveSource(api, def) }` (lanzar `SourceError` con `denied`; ya cumple el contrato) y `react-query` deja de ser necesario en el cuerpo (si se quiere cache compartida, envolver `resolve` con `queryClient.fetchQuery`).
  - `host.can`, `host.onNavigate` (con `splitHref` + `router.navigate`), `host.t`, `host.locale/currency`, `host.ctx = { locale, branch_id, org_id }`.
  - `host.urlState = createHistoryUrlAdapter(router.history)` (borrar `page-url-state.ts`; sus exports `encodeUrlStateValue`/`decodeUrlStateValue`/`URL_STATE_PREFIX` ya salen del SDK).
  - `host.connectBus = (bus, { addon, page }) => connectHostPageBus({ bus, addon, page })` (`page-host-events.ts` se queda en Ops).
  - `host.customBlocks = (names) => defsFromManifests(names)` con la logica de `page-custom-blocks.tsx` (`registerBlocks` devuelve las `BlockDefinition`; `collectCustomBlockNames` y `usePageBlockBridge` pasan a ser innecesarios).
  - `host.lazyBlocks = { map: ensureGenUIMapBlock }` en lugar de `hasMapBlock` + estado `mapReady`.
  - `host.onAction`: `createActionHandler({ verbs, emitIds, onNavigate, onEmit })` en lugar del `console.warn`.
  - `isSafeInternalPath` se importa del SDK (borrar la copia de `declarative-page.ts` si es identica).

## 2.7.0

### Minor Changes

- 0b9ad54: Logo por punto en los mapas (multiindustria: tiendas, sucursales, dependencias, vehiculos, instancias).

  - `MapPointItem.image` / `accent` / `subtitle`. Los pines del abanico (spiderfy), los marcadores individuales, el popup (encabezado logo + nombre + subtitulo + chip de estado), la lista bajo el mapa y las filas de la lista de cluster muestran un avatar circular con anillo del color de estado y borde que contrasta en claro y oscuro. Sin imagen o si falla la carga: iniciales con el color de marca (`accent`) o gris neutro; `aria-label`/`alt` con el nombre. El numero solo queda cuando ningun punto del mapa tiene logo ni color (mapas sin marca: igual que antes).
  - Capas WebGL: un overlay perezoso (chunk aparte, solo si hay puntos con logo) pone avatares DOM sobre los puntos visibles (maximo 50 por vista; por encima quedan los circulos) y mosaicos de hasta 3 logos + conteo sobre clusters y burbujas de precision pais/ciudad. Se eligieron marcadores DOM y no capas `symbol` + `map.addImage` (ver `logo-overlay.ts`): `<img>` real con `loading=lazy`, `referrerPolicy=no-referrer`, sin `crossOrigin` (no se dibuja en canvas), fallback de iniciales y foco/nombre accesibles.
  - Seguridad: solo se cargan imagenes `https:` o rutas del mismo origen; `http:`, `data:`, `javascript:` y `//host` se descartan; los colores pasan por `safeColor`.
  - genui `map`: `image_field`, `color_field` y `subtitle_field` (esquema sincronizado con el kernel); no se repiten como filas de detalle. Vista de nav `map`: los mismos tres campos. `GenUIMapPoint` gana `image`, `accent`, `subtitle`.
  - Atribucion de OpenFreeMap legible en tema oscuro (fondo y texto theme-aware con mas especificidad que el CSS compacto de MapLibre).
  - `size-budget`: el chunk inicial sube de 17 a 20 KB gzip por las primitivas de avatar.

## 2.6.0

### Minor Changes

- 3e08623: `tabs[].icon` acepta, además del conjunto base (`map`, `cards`, `table`, `dashboard`, `list`, `calendar`, `chart`), un nombre de icono que resuelve el host con `resolveIcon` (p. ej. `MapPin` de lucide), con patrón `^[A-Za-z][A-Za-z0-9]{0,63}$` (`$defs/iconName`; sin claves de prototipo). Cambio aditivo y retrocompatible: `parseGenUI` y el validador Go del kernel aceptan los mismos documentos. Esquema y vectores de conformidad sincronizados con metacore-kernel (tipos regenerados; 4 vectores válidos y 7 inválidos nuevos).

## 2.5.0

### Minor Changes

- e06931a: Resolutor de iconos inyectable: `GenUIProvider resolveIcon` + hook `usePageIcon`. Los iconos de las opciones de `tabs` se resuelven con el host, luego el conjunto interno y un icono neutro; retrocompatible.
- b38b032: El bloque `map` de genui/v2 admite `popup` (columnas de la fuente que se muestran al seleccionar un punto, max 8), `precision` (`exact|city|country`, constante), `precision_field` (columna con la precision por fila; excluyente con `precision`) y `area_field` (columna con el area o codigo, p. ej. `country_iso`). Mismos nombres y semantica que `MapView` del kernel (metacore-kernel#632 y #634). Esquema, vectores de conformidad (2 validos, 5 invalidos), tipos generados y `validate-v2.ts` sincronizados con el kernel; `popup`, `precision_field` y `area_field` solo aplican con `source`. `normalizeMapPoints` rellena `GenUIMapPoint.precision` y `area` (exports nuevos `MAP_PRECISIONS` y `MapPrecision`) y, con `popup`, los detalles son esas columnas en ese orden; sin `popup` el comportamiento no cambia. El renderer `map` de `@asteby/metacore-maps` pasa `precision` y `area` a `MapPointItem` (burbujas por precision, spiderfy) y el titulo del punto sigue siendo `fields.label`.

## 2.4.0

### Minor Changes

- d0b72c4: Sincroniza el esquema genui/v2, los vectores de conformidad y el validador TS con el kernel (metacore-kernel#631): `tabs` extendido (variant, default, keep_alive, chrome, label, mobile; opciones con icon, permission y component+props), bloque `section`, `grid.areas/rows/mobile` y `columns` como lista de pistas, `kpi_card`, `stats.items[].action`, `map.select`, `area` en todos los bloques y `component` con formato `<addon>.<nombre>@<n>`. `validate-v2.ts` aplica las mismas reglas que el kernel (opciones de tabs, section, plantilla rectangular y hijos colocados del grid) y pasa los 77 vectores nuevos. Los tipos de `PageGridDef`, `PageSectionDef`, `PageTabsDef`, `PageTabOption` y `PageKpiCardDef` reutilizan los tipos generados.
- d2693f7: Conmutador de vistas en paginas genui: el bloque `tabs` de pagina (`PageBlocks`/`PageView`) admite `variant: "segmented"`, vista activa en `state.<clave>` (deep link via `url_state` de la pagina), opciones con `icon`/`permission`, vistas declarativas, hibridas o custom (`component`), montaje perezoso con `keep_alive` opcional, `chrome` card|bare, teclado/aria y select en movil. Ejemplo: `examples/fleet-switcher.page.json`.

## 2.3.0

### Minor Changes

- d4d52e3: Renderers de pagina para genui v2 (aditivo, sin cambiar lo existente): `PageProvider`/`usePageState`/bus de eventos con `url_state` opcional, `grid` con `areas` (y orden movil), `stats`/`kpi_card` con `$ref` y acciones `set`/`emit`, `section` (modos declarative/hybrid/custom, `chrome` card|bare, estados de carga/error/vacio, ErrorBoundary, `permission`/`on_denied`), `map` con seleccion que escribe estado y emite `select`, y el contrato `defineBlock` (block@1) con stub para el modo custom (sin federacion).

## 2.2.0

### Minor Changes

- 171fb0f: genui/v2 fase 1: bloques `map`, `metric` y `diagram` en el contrato (esquema, reglas por posición y vectores de conformidad compartidos con el kernel), `GenUIProvider` + `registerGenUIBlockRenderer`, renderer `GenUI` (acepta v1 y v2) con bloques stack, grid, tabs, section, text, markdown seguro (sin HTML), alert, empty, card, list, metric y diagram (SVG con layout automático). `@asteby/metacore-maps/genui` registra el bloque `map` como fachada sobre MapView (tono por estado, leyenda por agrupación, tooltip al hover, panel de detalle). `GenerativeUI` (v1) no cambia.

## 2.1.1

### Patch Changes

- 5b7f8e5: Endurecimiento del contrato `genui/v2` antes de los renderizadores: ningún segmento (separado por `.`, `:` o `@`) de una clave i18n `$t`, de `formField.depends_on`, de una clave de fila (`table.rows[]`, `data.*.inline[]`) ni de los identificadores usados como clave de registro (`widget`, `icon`, `addon`, `invoke.action`, `emit.id`, `slot.name`, `ext`, `id` de bloque, `name`) puede ser `__proto__`, `constructor` ni `prototype` (`genui.forbidden_key`; `asset:<id>` de `media.src` por patrón). `key` cierra los segmentos vacíos (`a..b`, `a.`), `depends_on` debe apuntar a un campo del mismo formulario (`genui.unknown_target`) y `propertyNames` admite `x-no-proto`. Un overlay o una fuente llamados `constructor` ahora fallan antes con `genui.forbidden_key`.

## 2.1.0

### Minor Changes

- 5f08fa1: Contrato `genui/v2` (ADR 0001 del SDK, §3 fila 4: primer PR de código del plan): JSON Schema versionado (`schema/genui-v2.schema.json`) como fuente única, tipos TS y tablas de bloques generados (`pnpm codegen`), vectores de conformidad compartidos con el kernel (`conformance/`) y validador ampliado. Nuevas exportaciones: `parseUISpecV2`, `parseGenUI` (acepta v1 y v2 y devuelve v2), `upgradeV1`, `downgrade`, `GENUI_V2_LIMITS` (profundidad 6, 200 bloques, 128 KB), `GENUI_ERROR_CODES` y `GenUIError`. Rechaza claves de prototipo, mide texto en puntos de código y bytes UTF-8, y aplica las reglas por posición en el esquema. Aditivo: sin renderizadores nuevos; `parseUISpec` y `GenerativeUI` (v1) no cambian.

## 2.0.0

### Patch Changes

- Updated dependencies [944dd83]
  - @asteby/metacore-ui@2.28.0

## 1.0.0

### Minor Changes

- 4039e53: Nuevos paquetes. `@asteby/metacore-genui`: UI generativa segura por metadatos — valida (`parseUISpec`) y dibuja especificaciones `genui/v1` del agente con una lista blanca de componentes (texto, KPI, tarjeta, tabla, enlaces, línea de tiempo, gráfica SVG con resumen accesible y formulario de confirmación), sin HTML ni scripts; `createGenerativeUIResult` la registra en el registro de resultados del agente. `@asteby/metacore-automations`: cliente REST, hooks y pantalla de automatizaciones dinámicas (lista con filtros, detalle con autoría «persona con asistente», confirmación de propuestas, pausa/reanudación, simulación, historial y editor generado del JSON Schema `automation/v1`), más `automationUIActionHandler` para las tarjetas del chat.

### Patch Changes

- Updated dependencies [019192d]
- Updated dependencies [bdc8a60]
  - @asteby/metacore-ui@2.27.0

# @asteby/metacore-agent-workspace

## 6.3.0

### Minor Changes

- c1d0bf9: Las rutas fijas `/api/...` ya no ignoran el baseURL del host: el beacon de salida de llamadas y el atlas de mapas del workspace usan el cliente inyectado (`apiBaseUrl` opcional en el host, o `http.defaults.baseURL`), y `resolveTillImageUrl` acepta una base de media configurable. Sin cambios para quien no configure nada.

### Patch Changes

- Updated dependencies [4b0ce51]
  - @asteby/metacore-lib@0.12.0

## 6.2.2

### Patch Changes

- Updated dependencies [2393365]
  - @asteby/metacore-lib@0.11.0

## 6.2.1

### Patch Changes

- 46da5c6: `@asteby/metacore-lib/envelope`: una sola implementación del envelope `{success,data,meta}` y de los mensajes de error. Nuevos `unwrapEnvelope(body)`, `unwrapResponse(res)`, `unwrapList(body)` / `unwrapListResponse(res)` (`items` + `meta.total`), `ApiError` / `isApiError`, `isEnvelope`, `getApiErrorMessage(err, fallback)` e `isAbortError`. Los `unwrap` locales de automations, dataload, org-ai, billing, runtime-react y agent-workspace usan ahora este módulo (agent-workspace sigue re-exportando `getApiErrorMessage`). CI rechaza `.data.data` nuevo (`scripts/check-no-data-data.mjs`, baseline ratcheteado).
- Updated dependencies [46da5c6]
  - @asteby/metacore-lib@0.10.0

## 6.2.0

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

## 6.1.0

### Minor Changes

- 9134fa7: abyGuidance emite `ops:aby-guide-stopped` ({ guideId, stepIndex }) cuando el usuario descarta un tour en curso, para que el host registre un tour saltado. El fin de tour ya emitía `ops:aby-guide-completed`.

## 6.0.0

### Patch Changes

- Updated dependencies [df0c760]
  - @asteby/metacore-runtime-react@53.0.0
  - @asteby/metacore-app-providers@153.0.0
  - @asteby/metacore-starter-core@162.0.0

## 5.0.0

### Patch Changes

- ecaa56c: recharts sale del grafo estático del índice de `runtime-react`. Los widgets `BarWidget`, `LineWidget`, `AreaWidget`, `PieWidget` y `DonutWidget` del índice (y `WidgetRenderer`/`DashboardGrid`) ahora son fachadas con `React.lazy` que descargan recharts solo cuando un tablero pinta una gráfica; antes el share de runtime-react lo arrastraba al primer pintado del shell. Los componentes con recharts viven en el nuevo subpath `@asteby/metacore-runtime-react/charts`, y `preloadWidgetCharts()` calienta el chunk. Los nombres exportados no cambian.

  Una sola versión de recharts en el ecosistema: `runtime-react` pasa de `^2.15.0` a `^3.8.1` (la que ya usan OPS y `agent-workspace`), y el peer de `agent-workspace` sube a `>=3`. Un test de grafo estático (`index-static-graph`) falla si recharts, maplibre-gl u otras librerías pesadas vuelven a entrar al índice.

- Updated dependencies [ecaa56c]
  - @asteby/metacore-runtime-react@52.1.0
  - @asteby/metacore-app-providers@152.0.0
  - @asteby/metacore-starter-core@161.0.0

## 4.0.0

### Patch Changes

- 0cd5ba5: El chat flotante muestra la mascota de la plataforma (piel y estado animado, `mascot_skin`) en la fila de Aby y en la cabecera de su conversación, igual que la bandeja de `/team-chat`, en vez de un ícono genérico de Lucide.
  - @asteby/metacore-app-providers@151.0.0

## 3.1.0

### Minor Changes

- 3ed6083: `openAbyWidget({ message, send: true })` abre una conversación nueva con Aby y envía la pregunta en cuanto se abre el panel (buscador, tablero, voz). Además, un borrador sin conversación previa ya no deja el panel en la lista de conversaciones con el texto escondido: abre una conversación nueva con el texto en el compositor.

## 3.0.0

### Minor Changes

- 47d97d9: Chat del asistente: al recargar el historial, los avisos de turno fallido guardados (`metadata.turn_error`) vuelven como burbuja de error con «Reintentar» (reenvía la pregunta previa) en lugar de texto plano; nuevo `abyTurnErrorFromMeta`. `pollAbyAssistantReply` ya no sondea el historial ~5 min con la red caída: se detiene si el navegador está sin conexión o tras `maxNetworkFailures` (3) fallos consecutivos sin respuesta HTTP (`AbyNetworkDownError`), y un aviso `turn_error` encontrado al sondear se reporta como error clasificado (`AbyHistoryTurnError`) en vez de como respuesta.

### Patch Changes

- Updated dependencies [944dd83]
- Updated dependencies [420ff5b]
- Updated dependencies [47d97d9]
  - @asteby/metacore-app-providers@150.0.0
  - @asteby/metacore-ui@2.28.0
  - @asteby/metacore-runtime-react@52.0.0
  - @asteby/metacore-starter-core@160.0.0

## 2.0.0

### Patch Changes

- Updated dependencies [bdc8a60]
- Updated dependencies [019192d]
- Updated dependencies [bdc8a60]
- Updated dependencies [bdc8a60]
  - @asteby/metacore-runtime-react@51.0.0
  - @asteby/metacore-ui@2.27.0
  - @asteby/metacore-starter-core@159.0.0
  - @asteby/metacore-app-providers@149.0.0

## 1.0.0

### Patch Changes

- Updated dependencies [b285f48]
  - @asteby/metacore-runtime-react@50.2.0
  - @asteby/metacore-app-providers@148.0.0
  - @asteby/metacore-starter-core@158.0.0

## 0.3.1

### Patch Changes

- 33e73fb: Chat de equipo: el encabezado de la lista ya no pinta un fondo sólido (se veía como un cuadro en el tema glass) y el hilo usa la superficie de tarjeta en escritorio.

## 0.3.0

### Minor Changes

- 56448c3: Sincroniza con ops (mascot-face-store, agent-suggestions, mascotName en el PiP, speech-dictation) y exporta ImmersiveCopilot, sonidos y stores.

## 0.2.0

### Minor Changes

- 3812cb9: Nuevo paquete: espacio de trabajo del agente completo (chat con historial, widget, chat de equipo con llamadas, guías) con todos los acoplamientos del host inyectados por puertos.

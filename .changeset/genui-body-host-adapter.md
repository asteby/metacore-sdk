---
'@asteby/metacore-genui': minor
'@asteby/metacore-agent-workspace': minor
---

`GenUIBody` pasa al SDK con un adaptador de host inyectable (`genui.host/v1`) y el chat de Aby pinta embeds `type:"ui"` genui/v2 con ese mismo componente.

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

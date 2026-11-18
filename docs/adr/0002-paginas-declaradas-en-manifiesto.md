# ADR 0002 (SDK): páginas declaradas en el manifiesto con secciones de libertad total

- Estado: **propuesto** (solo diseño; sin código en este cambio).
- Fecha: 2026-11-18
- Paquetes afectados al implementarse: `@asteby/metacore-genui`, `@asteby/metacore-runtime-react`, `@asteby/metacore-maps` (registro del bloque `map`), `@sdk` (`packages/sdk`: `definePage`, nuevo `defineBlock`, `PAGE_SHARES`), `create-addon`; kernel `manifest/v3` y `genui/v2`; ops (rutas, sidebar, `/api/pages`, `/api/q`); hub (validación y firma al publicar); addons (`hub_fleet` primero).
- Relacionados: ADR 0001 de este repo (genui como capa declarativa única; **este ADR cierra su decisión abierta 2**), kernel ADR 0004 (query batch v2, `q:caps`, compuerta única), `docs/full-page-federation.md` (páginas federadas, hoy "nivel 3").
- Numeración: segundo ADR de este repo. Todas las decisiones marcadas **propuesta, pendiente de confirmación del dueño** son un default recomendado, no una decisión tomada.
- Convención de evidencia: **[V]** verificado en el código el 2026-11-18; **[P]** API propuesta que todavía no existe; **[S]** supuesto sin verificar.

## 1. Contexto

### 1.1 Requisito

Cuando un addon quiera diseñar una **sección** específica dentro de una página del sidebar, debe tener **libertad total** para hacerlo: declarativa, híbrida o custom, aunque eso exija contratos nuevos en SDK y kernel. Principio rector: *lo declarativo es un atajo opcional, nunca un techo*.

### 1.2 Por qué `view_type` no alcanza (evidencia en ops y kernel)

1. **La vista se resuelve por modelo, no por entrada de navegación.** [V] `backend/services/ui_surfaces.go` (`ResolveModelUI`, `mergeViewBlock`) fusiona los bloques `view` de todas las entradas de nav que apuntan al mismo modelo: "one block per type; the first entry of each type wins". Dos mapas distintos sobre `HubInstance` son imposibles; el segundo se ignora en silencio.
2. **El bloque viaja por un camino largo y frágil**: manifiesto → kernel `v3.NavItem.View` → copia del host `models.AddonNavItem` → `GET /metadata/table/:model?view=` → frontend. [V] El commit `44371d7` (PR #2356) arregló que `AddonNavItem` perdía `View` (el mapa de Flota salía como tabla); el mismo struct ya había perdido `Permission`. Cada campo nuevo de nav repite el riesgo.
3. **La ruta de modelo decide el renderer con heurísticas** [V] (`routes/_authenticated/m/$model/index.tsx`, 1003 líneas: `?view` gana sobre `metadata.view_type`, casos especiales de scroll y mapas).
4. **Una vista = un renderer** [V]: `NavView` (`manifest/v3/ui.go`) es una unión exclusiva `map|timeline|calendar|chart|split`. No hay layout, KPIs junto al mapa, panel de detalle propio, estado compartido ni CTAs; por eso el popup del mapa "amontona" cards.
5. **Los tableros componen pero sin diseño** [V]: `contributions.dashboard[]` se pinta agrupado por addon; no hay página por addon ni filtros compartidos, y `WidgetQuery.Range` es fijo por widget.

### 1.3 Qué ya existe y se reutiliza

- [V] **genui/v2**: esquema JSON, tipos generados y validador TS (`validate-v2.ts`) en `@asteby/metacore-genui`; bloques `stack, grid, tabs, section, stats, chart, table, model_view, view, slot, ext…`, fuentes `data.{q|plan|widget|inline}`, `$ref`, `$t`, `when` y verbos `navigate/invoke/submit/open/close/set/refresh/emit`. **Sin renderers v2 todavía** y **sin `genui/v2` en Go** (el kernel solo tiene v1: `genui/genui.go`).
- [V] **Páginas federadas** (`frontend.pages[]`, kernel `v3.FrontendPage`; ops `federated-page-host.tsx`, rutas `/a/$key/$` y `/addons/$key/$`; SDK `definePage`, `useHostApi`, SRI, `PAGE_SHARES`). Productivas; son el embrión del bloque custom.
- [V] Bloques federados en superficies (`DashboardWidget kind:"custom"`, `DetailPanel kind:"custom"`, `<Slot>`), `@asteby/metacore-maps`, `@asteby/metacore-charts`, `/api/q` con compuerta única, `DashboardCatalogService.computeWidget(..., extraWhere)`.

## 2. Decisión

Se agrega **`contributions.pages[]`** al manifiesto (hermano de `frontend.pages[]`). Una página tiene identidad propia (`key`, `path`), una envoltura (permisos, requires, layout, estado en URL, refresco) y un **cuerpo que es un documento genui/v2**, no un segundo lenguaje. La página es una composición de **secciones**; cada sección elige su modo de forma independiente. Esto **cierra la decisión abierta 2 del ADR 0001** en "sí, con envoltura `PageDef`", y reemplaza su default ("no en R2") por la evidencia de §1.2.

> Decisión 1 (propuesta, pendiente de confirmación del dueño): cerrar la decisión 2 del ADR 0001 en "sí, páginas completas en el manifiesto con envoltura `PageDef`". Default: sí.

### 2.1 Espectro de tres niveles (el addon elige por página, sección o bloque)

| Nivel | Qué escribe el addon | Cuándo | Costo JS |
|---|---|---|---|
| 1. Declarativo | `pages[]` con bloques del núcleo | tableros, mapas con panel, rankings, KPIs | 0 KB |
| 2. Híbrido | la misma página + secciones `hybrid`/`custom` con bloques propios | lo específico del vertical | solo el bloque |
| 3. Página custom | `frontend.pages[]` (ya existe) con el SDK de host | editores, canvas, flujos inmersivos | la página |

Regla anti-techo: los tres niveles usan los mismos primitivos y el mismo contrato de host. Un nivel 1 crece a 2 agregando una sección custom sin reescribir nada; un bloque custom repetido en varios verticales se gradúa al núcleo (§2.8).

### 2.2 `PageDef` [P]

```jsonc
{
  "key": "fleet_map",                 // único en el addon, snake_case
  "path": "fleet-map",                // ruta bajo el espacio del addon (ver §2.7)
  "title": "hub_fleet.pages.fleet_map.title",   // clave i18n
  "icon": "MapPin",
  "permission": "hub_instances.index",
  "requires": [{ "model": "HubInstance", "actions": ["index"] }],
  "layout": "shell",                  // shell | immersive (mismo vocabulario que FrontendPage)
  "density": "comfortable",           // comfortable | compact
  "refresh": { "interval_s": 60 },    // mínimo 15 s
  "url_state": ["range", "selected"], // claves de state reflejadas en la URL (deep link)
  "ui": { "version": "genui/v2", "i18n": "keys", "data": {}, "state": {}, "overlays": {}, "blocks": [] }
}
```

La nav la referencia con `NavItem.page: "<key>"` [P]. Nada se fusiona por modelo. Capacidades implícitas del manifiesto: `ui.pages@1`, `ui.blocks@1`, `ui.genui@2` (como hoy `view_type: map` implica `ui.views.map`).

### 2.3 Layout de regiones [P]

Aditivo a genui/v2: `grid` con `areas` (plantilla nombrada estilo CSS grid areas, con `columns`, `rows` y variante `mobile`; solo tokens `fr`, `px` acotado 120-640, `auto`, `minmax`; sin CSS libre) y `split` (azúcar de dos regiones, `aside_mode: inline|drawer`, drawer siempre en móvil). Cada hijo declara `"area"`.

### 2.4 Contrato de sección [P]

La sección es la **unidad de libertad**; el bloque custom (§2.6) es la unidad de reutilización.

```jsonc
{
  "type": "section",
  "id": "competencia",
  "area": "media",                  // región del layout de la página
  "mode": "custom",                 // declarative | hybrid | custom
  "title": { "$t": "vantora.blocks.media_competition" },
  "permission": "vantora.media.read",
  "on_denied": "hide",              // hide | notice
  "children": [ /* declarative|hybrid: bloques del núcleo y/o ext */ ],
  "component": "vantora.media_competition@1",   // custom: nombre@mayor de un BlockDef
  "props": { "limit": 10 },
  "chrome": "card"                  // card | bare
}
```

- `declarative`: árbol de bloques del núcleo. `hybrid`: núcleo mezclado con bloques `ext` en el mismo `children`. `custom`: la sección entera es un componente del addon (`component` + `props`), con su propio layout interno, interacción, animación o canvas.
- `children` y `component` son mutuamente excluyentes y su presencia debe coincidir con `mode` (error de validación estable `page.section.mode_mismatch`).
- `chrome: card` hace que el host pinte marco, título y estados de carga/vacío/error; `bare` los delega al addon.
- `permission` y `on_denied`: el **servidor poda** la sección antes de servir la página; el cliente solo pinta `hide` o `notice`. Una página puede ser **una sola sección `custom`** a pantalla completa.
- Una sección `custom` consume exactamente el contrato `block@1` (§2.6).

> Decisión 9 (propuesta, pendiente de confirmación del dueño): la sección vive **dentro del árbol genui** como bloque `section` con `mode`, no en `PageDef.sections[]` aparte. Default: dentro de genui, para que la IA y el validador vean un solo árbol.

### 2.5 Contexto de página `page@1` [P]

Contrato de la envoltura que comparten todas las secciones:

- `state`: estado compartido (solo escalares y listas de escalares, como en ADR 0001 §2.2); `url_state` declara qué claves se reflejan en la URL.
- Cada sección declara `reads` y `writes` sobre claves de `state` y `ctx.*` (`locale`, `currency`, `time_zone`, `branch_id`); el validador comprueba que existan. Una sección custom no puede escribir fuera de `writes` ni leer fuera de `reads`.
- **Bus de eventos**: las secciones emiten eventos declarados; el cuerpo declarativo reacciona con los verbos cerrados de ADR 0001 §2.4 (más `notify` [P], solo cliente).
- **Fuentes parametrizadas** [P]: `params` con `$ref` a `state.*`, permitido solo en claves que la fuente declara (rango en widgets, valores de filtro en `q:`). El servidor **revalida** contra lo que la página declara (no es una consulta libre) y recalcula solo la fuente afectada. `WidgetQuery.Range` suma `last_28_days` y `last_90_days`.
- Versionado: `page@1` y `block@1` son mayores de contrato; el host los anuncia en `q:caps`; ante un cambio incompatible se soportan ≥ 2 mayores durante 12 meses.

### 2.6 Bloque custom `block@1` [P]

Declaración en `contributions.blocks[]` (es el `genui_blocks[]` del ADR 0001 §2.6, ampliado):

```jsonc
{
  "name": "election_simulator",        // → ext "vantora.election_simulator@1"
  "version": 1,
  "expose": "./blocks/election-simulator",
  "runtime": "federated",              // federated | iframe
  "host_api": "block@1",
  "props_schema": { "mode": { "enum": ["vote", "seat"] } },
  "reads":  ["state.range", "state.selected", "ctx.locale"],
  "writes": ["state.selected"],
  "data":   ["ranking"],               // fuentes de la página que recibe ya resueltas
  "requires": [{ "model": "Poll", "actions": ["index"] }],   // lo que puede pedir por su cuenta
  "events": ["select", "simulate"],    // emits declarados
  "shares": ["@asteby/metacore-charts"],
  "budget_kb": 60,                     // tope 80
  "permission": "vantora.simulator.use",
  "min_size": { "cols": 2, "rows": 1 }
}
```

Entrada en código (`defineBlock`, análogo a `definePage`):

```ts
defineBlock<Props>({
  api: 'block@1',
  component: ({ props, context, data, host, emit, size }) => JSX,
})
```

- `props`: validadas contra `props_schema` (subconjunto de JSON Schema: `string` con `maxLength`, `number`, `boolean`, `enum`, `array` de esos; sin objetos libres).
- `context`: snapshot de solo lectura de las claves de `reads`.
- `data`: las fuentes de `data`, ya resueltas por el batch de la página (`{status, rows, meta}`).
- `host`: `useHostApi()` **recortado a `requires`**; todo acceso pasa por la compuerta del servidor; el token nunca se expone [V patrón de `federated-page-host.tsx`].
- `emit`: `select`, `set` (solo claves de `writes`), `invoke`, `navigate`, `notify` y los eventos declarados en `events`, con payload escalar. Un emit no declarado se descarta y se reporta.
- **Ciclo de vida**: el layout reserva el área → carga perezosa al entrar en viewport → verificación SRI (`frontend.integrity`) → `mount` en ErrorBoundary con timeout (5 s → `fallback`) → actualización por cambio de `context`/`data` → `unmount` limpia suscripciones. Un fallo de carga pinta `fallback`, reporta incidente y nunca rompe la página.
- **Publicación**: `metacore build` compila cada `expose`, mide presupuesto y estampa `integrity` y `sdk`; el hub valida (`props_schema`, `reads/writes` ⊂ claves existentes, `budget_kb`, `shares` ⊂ `PAGE_SHARES`) y **firma** el bundle; el kernel al instalar verifica firma y que el host soporte `host_api` (`ui.blocks@1`).
- **Aislamiento por `runtime`**:
  - `federated` (default; first-party y addons firmados del hub): mismo origen y React; aislamiento **contractual** (solo lo declarado, host API recortado, firma + SRI + presupuesto). Es lo que ya hacen modals, paneles y widgets custom [V].
  - `iframe`: `<iframe sandbox="allow-scripts">` en origen aparte; puente `postMessage` con el mismo contrato `block@1` serializado; sin cookies ni token; tema por tokens CSS enviados por el puente.
  - `wasm` **no** es runtime de UI: encaja como productor del lado servidor de un documento genui o de datos (decisión 4 del ADR 0001).

### 2.7 Ruta, `view_type`, esquema y terceros

**Ruta (decisión 3).** Evidencia del código de ops [V]: `/a/<addon>/<path>/*` ya es el espacio de rutas por addon **dentro del shell** (`routes/_authenticated/a/$key/$.tsx`), y `/addons/<addon>/...` es pantalla completa; `EmbeddedAddonPage` resuelve el `splat` con `matchPage(frontend.pages, splat)` y, si no hay hit, cae a `EmbeddedLegacyRoute`; el permiso de pantalla `screen.<slug>.access` se deriva de la URL `addon://` (`BuildScreenCapabilityImpliesFromNav`, `canonicalScreenPath` mapea `/a/` ↔ `/addons/`), y `addonHref` decide shell vs inmersivo desde el manifiesto. Una ruta nueva `/p/` obligaría a duplicar ese mapeo de permisos, el breadcrumb y la activación del sidebar (`active-nav-item.ts`).

> Decisión 3 (propuesta, pendiente de confirmación del dueño): **reutilizar `/a/<addon>/<path>`** (y `/addons/...` para `layout: immersive`) con resolución por tipo: primero `frontend.pages[]`, luego `contributions.pages[]`, luego legado. El kernel rechaza al publicar/instalar un `path` repetido entre `pages[]` y `frontend.pages[]` del mismo addon; si el dueño prefiere cero riesgo de colisión, el fallback es `/p/<addon>/<path>`. `NavItem.page` se resuelve a esa URL en `use-addon-sidebar.ts`.

**Destino de `view_type` (decisión 4).** Se **mantiene** funcionando sin cambios. El host proyecta cada entrada `view_type: map|timeline|calendar|chart|split` a una **página sintética por entrada** (`key = nav:<hash>`) con un único `model_view`/`map` y el filtro de la entrada, lo que elimina la fusión por modelo y deja `/m/$model` solo para tabla/kanban.

> Decisión 4 (propuesta, pendiente de confirmación del dueño): `view_type` queda como **azúcar proyectada indefinidamente**, con advertencia del linter en manifiestos nuevos; no se elimina en v4. Alternativa: error en el manifiesto v4.

**Esquema genui v2 en el kernel (decisión 2).** El validador de publicación e instalación vive en Go, así que el esquema debe ser consumible ahí.

> Decisión 2 (propuesta, pendiente de confirmación del dueño): **mover la fuente de `genui-v2.schema.json` al kernel** (`genui/schema/`, como pedía el ADR 0001 §2.7), con `genui/v2` en Go y vectores de conformidad compartidos; el SDK lo sincroniza con hash. Hasta entonces, el hub valida con el validador TS en su pipeline de publicación.

**Terceros no verificados (decisión 5).**

> Decisión 5 (propuesta, pendiente de confirmación del dueño): un bloque de un tercero **no verificado** solo puede declarar `runtime: "iframe"`; `federated` queda para first-party y addons firmados por el hub. Hasta que exista el runtime `iframe`, solo se aceptan bloques de addons firmados.

**`contributions.queries[]` (decisión 10).** Para secciones custom que necesitan datos que ningún `widget` ni `t:` expresa.

> Decisión 10 (propuesta, pendiente de confirmación del dueño): **sí, en P1**. Consulta de **lectura** declarada por el addon (modelo, filtros, agregaciones, límites, `params` con claves declaradas), ejecutada por el mismo motor de agregación de los widgets y bajo la compuerta única con los permisos de quien mira; el código custom la consume con `usePageData` junto a las mismas fuentes que lo declarativo. Sin SQL, sin URL, sin endpoints ad hoc en `contributions.api`.

### 2.8 Graduación y lenguaje

- **Graduación**: telemetría del hub cuenta `ext` por nombre y verticales; criterio: mismo patrón en ≥ 2 verticales o ≥ 3 addons, props estables 2 versiones, sin dependencia de dominio; el bloque pasa al núcleo (cambio aditivo en genui v2) y el `ext` queda como alias durante un mayor.
- **Lenguaje (decisión 6)**:

> Decisión 6 (propuesta, pendiente de confirmación del dueño): no crear un DSL nuevo. IR canónica = genui v2 (JSON); builder TS tipado `@asteby/metacore-genui/author` que compila a esa IR; TSX acotado como azúcar solo si hay demanda medida. Expresiones: `$ref` + `when` sin `eval`; si hacen falta valores calculados, el motor de expresiones del kernel evaluado en servidor.

### 2.9 Decisiones restantes

> Decisión 7 (propuesta, pendiente de confirmación del dueño): primer `ext` piloto = el que tenga dueño y datos reales al llegar a la fase 3 (simulador de Vantora o una línea de rollout del hub).
>
> Decisión 8 (propuesta, pendiente de confirmación del dueño): presupuestos y límites por página: 200 bloques, profundidad 6, 16 fuentes, 8 `ext`, 32 KB de props totales, 128 KB de documento, `budget_kb` ≤ 80 por bloque, 3 s por batch en servidor; se ajustan tras medir la fase 1.

## 3. Seguridad

- Nivel 1 sin código: lista cerrada de bloques, sin HTML/CSS/colores literales, `isSafeLink`, `$ref` prohibido en URLs, sin `eval` (reglas del ADR 0001 §2.6).
- **Compuerta única en el servidor**: toda fuente y acción pasa por la autorización de su ruta directa; la poda de secciones en cliente es UX. `org_id` y usuario salen del JWT.
- Bloques custom: declaración obligatoria, firma + SRI + presupuesto, `reads/writes/data/requires` como capacidades mínimas, host API recortado, ErrorBoundary + timeout, sin acceso al token.
- Validación en tres momentos: publicación (hub, Go), instalación (kernel, Go + capacidades del host) y render (TS). Errores con código estable (`genui.*`, `page.*`).
- Páginas deterministas: no se sirve a usuarios una página generada por IA en runtime sin validar ni persistir; la IA entra como autora asistida en build y productora de vistas efímeras en el chat.

## 4. Plan por fases (cada una un PR o serie de PRs pequeños; sin publicar paquetes en este cambio)

| Fase | Entregable | Repos |
|---|---|---|
| 0 | Este ADR | sdk |
| 1 | Mapa de flota (nivel 1) detrás de flag: `PageDef`, `NavItem.page`, `grid.areas`, `stats`, `map`, `view`, `filter_bar`, `DeclarativePage`, ruta y `GET /api/pages/:addon/:key` | kernel, sdk, ops, hub_fleet |
| 2 | Estado compartido, `params`, `ranking`, `kpi_card`, `badge`, `notify` | sdk, ops, kernel |
| 3 (adelantable junto a 2) | Sección/bloque custom: `defineBlock`, `ExtBlockHost`, `blocks[]`, firma/SRI, `reads/writes/emit`; `contributions.queries[]` | kernel, sdk, ops, hub |
| 4 | Páginas sintéticas desde `view_type` y test de paridad `NavItem` ↔ `AddonNavItem` por reflexión | ops, kernel |
| 5 | Validador Go `genui/v2` + vectores compartidos | kernel, sdk |
| 6 | DX: `metacore validate`, `page preview`, builder tipado | sdk |
| 7 | `host@N` en `q:caps`, `PAGE_SHARES` += genui, runtime `iframe` | sdk, ops, kernel |

Criterios de aceptación de la fase 1: dos entradas de nav sobre el mismo modelo con mapas distintos conviven; la página se sirve en una llamada de metadata y un batch; seleccionar un punto actualiza el panel sin popup apilado (drawer en móvil); un usuario sin permiso recibe 403 sin descargar nada y las secciones podadas no llegan en la respuesta; un manifiesto con `ext` inexistente, `$ref` a fuente no declarada o literal con `i18n: keys` se rechaza con código estable; flag apagado = comportamiento actual.

## 5. Riesgos

- *Camino crítico en genui v2 sin renderers*: implementar primero solo los bloques de la fase 1.
- *Validador Go v2 ausente*: deriva Go↔TS; vectores compartidos desde el día 1 y validación TS en el hub mientras tanto.
- *Explosión de primitivos*: cada bloque nuevo es fachada de un componente existente (regla 1 del ADR 0001) y entra por graduación.
- *Rendimiento con muchas fuentes*: presupuesto por batch, carga por viewport, ETag por fuente.
- *Bloques custom de terceros*: hasta tener `iframe`, solo addons firmados.
- *Doble camino `view_type`/páginas*: páginas sintéticas para no mantener dos renderers, tras flag.
- *Colisión de rutas en `/a/`*: validación de unicidad de `path` en el kernel; fallback a `/p/`.

## 6. Alternativas descartadas

- **Un solo nivel (solo declarativo)**: crea un techo; el vertical que necesita un canvas queda bloqueado esperando al host.
- **Solo páginas federadas completas (todo o nada)**: obliga a reescribir la página entera por una sección específica y no comparte contexto ni datos con lo declarativo.
- **Un DSL nuevo o plantillas con expresiones (CEL, JSONLogic)**: superficie nueva de seguridad y mantenimiento; ver decisión 6.
- **Ruta `/p/` nueva por defecto**: duplica permisos de pantalla, breadcrumbs y sidebar que `/a/` ya resuelve (§2.7).
- **WASM o web components como runtime de UI**: la federación ya cubre el caso y comparte React y tema.

## 7. Resumen de decisiones abiertas

Todas son **propuesta, pendiente de confirmación del dueño**.

| # | Decisión | Default |
|---|---|---|
| 1 | Cerrar decisión 2 del ADR 0001 | sí, con envoltura `PageDef` |
| 2 | Fuente del esquema genui v2 | mover al kernel; el SDK sincroniza con hash |
| 3 | Ruta | reutilizar `/a/<addon>/<path>`; `/p/` solo si hay colisión |
| 4 | `view_type` | azúcar proyectada a página sintética; advertencia en linter |
| 5 | Terceros no verificados | `iframe` obligatorio |
| 6 | DSL | IR JSON + builder TS; TSX solo con demanda |
| 7 | Primer `ext` piloto | el que tenga dueño y datos en la fase 3 |
| 8 | Presupuestos y límites | los de §2.9, ajustables tras la fase 1 |
| 9 | Dónde vive la sección | dentro del árbol genui |
| 10 | `contributions.queries[]` | sí, en P1, con la compuerta única |

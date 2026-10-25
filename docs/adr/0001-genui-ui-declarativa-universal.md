# ADR 0001 (SDK): genui como capa declarativa única de UI (contrato `genui/v2`)

- Estado: **propuesto** (solo diseño; sin código en este cambio).
- Fecha: 2026-10-25
- Paquetes afectados al implementarse: `@asteby/metacore-genui`, `@asteby/metacore-runtime-react`, `@asteby/metacore-charts` (solo consumo), `@asteby/storefront-react` (solo el vocabulario de campos); kernel `genui` (+ nuevo `genui/v2`), `agent`, `automation`; ops (`/api/q`, `features/installed-addons`); `local` (solo sube versión).
- Relacionados: kernel ADR 0002 (ajustes con alcance y revisión), kernel ADR 0004 (query batch v2, `q:caps`, compuerta única), `ops: docs/plan-next-gen/DISENO-EXTENSIBILIDAD.md` (slots@1, `inject[]`) y `AUDITORIA-METADATOS.md` (B4, B6, B9, C.4).
- Numeración: es el primer ADR de este repo; los del kernel viven en `metacore-kernel/docs/adr/` (0001-0004).

## 1. Contexto: qué hay hoy (verificado en el código)

`@asteby/metacore-genui` 2.0.0 (`packages/genui/src`) implementa `genui/v1`: un documento JSON `{version, title, blocks[]}` con una lista cerrada de 8 bloques (`text`, `kpi`, `card`, `table`, `links`, `timeline`, `chart`, `confirm`), validado por `parseUISpec` (`validate.ts`, límites `GENUI_LIMITS`: 12 bloques, 64 KB, 50 ítems…) y pintado por `GenerativeUI` (`generative-ui.tsx`). El kernel tiene el espejo en Go (`metacore-kernel/genui/genui.go`: `Parse`, `FromAny`, `Spec.Validate`, `SafeLink`, mismas cotas `MaxBlocks`…`MaxSpecBytes`). Hoy solo lo usan el agente (`agent/chat_embed.go`, `ChatEmbed.UI`, tipo de embed `"ui"`) y las tarjetas de automatizaciones (`automation/view.go: CardUI`, `PreviewBlocks`; del lado SDK `packages/automations/src/ui-actions.ts`). Ops no registra el renderer todavía (`createGenerativeUIResult` no aparece en `ops/frontend`).

Al mismo tiempo, la misma UI se resuelve en paralelo en muchos sitios. **Esto es lo que este ADR quiere eliminar**:

| Duplicación | Evidencia |
|---|---|
| **Al menos 6 renderizadores de campos de formulario** | `resolveWidget` (`runtime-react/src/dynamic-form-schema.ts`, usado por `DynamicForm`); `renderField` (`action-modal-dispatcher.tsx:1698`); `EditField` por `field.type` (`dialogs/dynamic-record.tsx`, con su propio `TODO(deuda)` en `:706`); `SetupFormStep` (`setup/setup-form-step.tsx:287-304`, Switch/Select/Input a mano); `AddonConfigSurface` (`setup/addon-config-surface.tsx`, tres bloques a mano en `:336`, `:529`, `:1097-1140`); `ConfirmView` de genui (`generative-ui.tsx:398`, Switch/`<select>` propios). |
| **Bug causado por esa duplicación** | `AddonConfigSurface` pinta `type: integer` como `<Input type='text'>` y lo envía como texto (`addon-config-surface.tsx:1135-1140` solo reconoce `'number'`). Afecta, p. ej., `inventory.low_stock_threshold` (integer, default 5). `DynamicForm` sí maneja enteros. |
| **Vocabularios de tipo de campo distintos** | genui `UIInput.kind` (7), `SetupFieldType` (`setup/types.ts:48`, 6), `SectionPropKind` (`storefront-react/src/sections.tsx`, 13), `OPS_PROP_KINDS` (`section-types.ts`, 13), `Setting.type` y `ActionField.type/widget` del manifest v3, `validWidgets` (22, solo en el validador legacy `manifest/validate.go:164-196`; auditoría B4). |
| **Tres gráficas** | `chart` de genui = SVG propio sin dependencias (`generative-ui.tsx: ChartView`); `@asteby/metacore-charts` (Bar/Line/Area/Pie/Donut/Sparkline) que usan `DashboardGrid` y `views/chart-view.tsx`; y el embed `type: "chart"` del agente con su propio `ChartSpec` (`agent/chat_embed.go: embedsFromChartResult`). |
| **Tonos y formatos** | genui `Tone` (`default/muted/info/success/warning/danger`); `setup/tone.ts` (`neutral/info/good/warn/bad`); `WidgetAccent` de charts (colores). Formato: `StatFormat` (`views/panels.tsx:11`, 7 valores) frente a `WidgetFormat` (`charts/src/format.ts:5`, 4). |
| **Mini-lenguajes de bloques** | `ConnectorFormBlock` (`setup/connector-blocks-model.ts`: `webhook_url/instructions/action`), `SetupStepKind` (`check/form/action/records/custom`), `DetailPanel.kind` (`map/timeline/chart/relation/stats/custom`, kernel `manifest/v3/ui.go:272`), `DashboardWidgetSpec.kind` (`dashboard-types.ts:9`), `DeclarativeViewType` (`views/types.ts:20`). |
| **Validación de URLs** | `isSafeLink` (genui) y `safeHttpsUrl` (`setup/connector-blocks-model.ts:50`) con reglas distintas. |

Lo que **ya está bien** y se reutiliza tal cual: `DynamicForm` + `FormLayout` (secciones y pasos, `form-layout.ts`), `validator.ts` (`validateValues`, códigos `validation.<code>` localizados), `VisibleWhen`/`applyOptionWhen` (predicados declarativos sin `eval`), `ViewDataSource` (`views/types.ts:46`, "todo corre con los permisos del visitante en el servidor"), `DetailPanels`/`DeclarativeView` (registro de renderers perezosos), `DashboardGrid`, `ActionModalDispatcher` (federado, wizard, prefill, supervisor), `useSupervisor`/`ApprovalGate`, `Slot`/`slotStore`, `registerFieldWidget`, `registerAgentResultRenderer`, `batchGet`/`loadQueryPart` (`query-batch.ts`), y `defineSection` del storefront.

## 2. Decisión

**genui pasa a ser el único lenguaje declarativo de UI en tiempo de ejecución, y sus bloques son fachadas de los componentes que ya existen, nunca reimplementaciones.** Se define `genui/v2`, aditivo sobre `genui/v1`.

### 2.1 Reglas anti-duplicación (vinculantes)

1. **Un componente por cosa.** Formularios: `DynamicForm`. Tablas de un modelo: `DynamicTable`/`DynamicView`. Gráficas: `@asteby/metacore-charts`. Paneles de ficha: `DetailPanels`. Diálogos: `ResponsiveDialog`/`Sheet` de `@asteby/metacore-ui`. Wizard: `FormLayout mode:"steps"`. Un bloque genui nuevo que necesite algo que no existe lo agrega **al componente**, no al bloque.
2. **El manifest sigue siendo la fuente de lo declarado por el addon** (acciones, campos, paneles, widgets, ajustes). genui **no** es un segundo manifest: un bloque puede **referir** a un artefacto del manifest (`{"type":"form","ref":{"action":"customers.SalesOrder.approve"}}`) o declararse **en línea** (agente, resultados de acción). Para cada fragmento del manifest hay **una** proyección canónica a genui (`FromAction`, `FromPanel`, `FromWidget`, `FromSettings`), en Go y generada en TS; no se escribe a mano en cada host.
3. **Un vocabulario por concepto**, definido una vez en el esquema genui y compartido: tipos de campo (`field.kind`, que absorbe `validWidgets` cuando se mueva a v3 según B4), tono (`Tone` de genui; `setup/tone.ts` se convierte en un mapeo), formato (`StatFormat` como superconjunto; `WidgetFormat` queda como subconjunto), validación de enlaces (`isSafeLink`; `safeHttpsUrl` pasa a llamarla con `{https:true}`).
4. **Sin dependencia circular.** `@asteby/metacore-genui` no importa `runtime-react`: contiene el contrato, el validador, el motor de vinculaciones y los bloques **presentacionales** (texto, tarjetas, alertas, layout) sobre `@asteby/metacore-ui`. Los bloques **con datos** (form, table, model_view, view, chart, settings) los registra `runtime-react` en un registro de renderers de genui (`registerGenUIBlockRenderer`, mismo patrón que `registerAgentResultRenderer`), y el host monta `<GenUIProvider>` una vez. Sin proveedor, esos bloques pintan su `fallback` de texto.
5. **Migración por convergencia, no por reescritura.** `ActionModalDispatcher` y `DynamicCRUDPage` siguen llamando a los componentes directamente; lo que se elimina son los renderizadores paralelos (tabla de §1). Ninguna pantalla se "pasa a genui" si no borra código duplicado al hacerlo.

### 2.2 Contrato `genui/v2`

Documento:

```jsonc
{
  "version": "genui/v2",
  "title": "Pedidos por surtir",             // texto o {"$t": "clave.i18n"}
  "i18n": "keys",                             // "keys" (addons) | "literal" (agente); default "literal"
  "data": {                                   // fuentes declaradas; solo lectura (§2.3)
    "orders": { "q": "t:customers.SalesOrder?status=eq:confirmed&limit=20" },
    "meta":   { "q": "mm:customers.SalesOrder" },
    "kpis":   { "widget": "customers.dashboard.open_orders" }
  },
  "state": { "tab": "lista", "filtro": { "almacen": null } },  // estado local, solo escalares/listas de escalares
  "overlays": { "detalle": { "kind": "drawer", "title": "Pedido", "blocks": [ /* … */ ] } },
  "blocks": [ /* árbol de bloques */ ]
}
```

`blocks` (raíz) sigue siendo una lista para que un v1 se lea igual. Todo bloque admite `id` (único en el documento), `when` (predicado, §2.3) y `fallback` (texto que se muestra si el cliente no soporta el bloque o no hay proveedor).

**Lista cerrada de bloques v2** (los 8 de v1 se conservan con su forma):

| Bloque | Propósito | Fachada de (componente que ya existe) |
|---|---|---|
| `stack`, `grid`, `tabs`, `section` | Composición: `stack` vertical/horizontal; `grid` de 1-4 columnas (`span` como `WidgetSize`); `tabs` (hasta 8, estado en `state`); `section` plegable | `Tabs`, `Collapsible`/`Accordion` de `metacore-ui`; grilla = la de `DashboardGrid` |
| `text` (v1), `markdown` | Texto plano; markdown **seguro** (subconjunto: párrafos, negritas, cursivas, código, listas, encabezados h3-h4, enlaces vía `isSafeLink`; sin HTML, sin imágenes, sin tablas) parseado a nodos React propios | Parser propio en genui core; **prohibido** `dangerouslySetInnerHTML` (regla de lint en el paquete) |
| `alert`, `empty` | Aviso con tono; estado vacío con acción opcional | `Alert`; `DataState`/`shared-states` de `metacore-ui` |
| `card` (v1), `list` | Tarjeta con campos y badges; lista de ítems con título, descripción, badge y acción | `Card`; filas de `RecordsTable` |
| `kpi` (v1), `stats` | Indicadores; `stats` agrega `format` (`StatFormat`), `trend`, `compare`, `source` | `StatsPanelView` + `formatStat` (`views/panels.tsx`); widget `stat` de `DashboardGrid` |
| `links`, `timeline` (v1) | Enlaces y cronología | `timeline` con `source` → `views/timeline-view.tsx` |
| `table` (v1 ampliado) | En línea (`columns`+`rows`, como v1) **o** con `source` + `columns`, `filters`, `sort`, `page_size`, `row_actions`, `bulk_actions` | En línea: `Table` de `metacore-ui`. Con `source` de modelo: `DynamicTable` (paginación, filtros y orden los resuelve el servidor) |
| `model_view` | La vista completa de un modelo por referencia: `{model, view: table\|kanban\|calendar\|map\|timeline\|chart, filters, allowed_actions}`; solo `ref`, nunca en línea | `DynamicView` (`dynamic-view.tsx`) con `allowedActionKeys`, `defaultSort`, `hiddenColumns` |
| `view` | Ficha de un registro: campos (`fields` por clave de columna) + `panels` | Campos: `view-record-dialog`; paneles: `DetailPanels` (`views/registry.tsx:167`) |
| `chart` (v1 ampliado) | `kind`: `bar\|line\|area\|pie\|donut\|sparkline`; `x`, `series`(≤6), `rows` en línea **o** `source` (consulta declarada o `widget`); `format`, `accent`; `summary` obligatorio (accesible) | `@asteby/metacore-charts` (carga perezosa). El SVG propio de genui se retira |
| `form` | Campos (`fields[]` con la forma de `ActionFieldDef`: `key,label,kind,required,options,depends_on,visible_when,validation,widget,section`), `layout` (`FormLayout`: `sections`/`steps`), `submit` (acción) | `DynamicForm` (`formLayout`, `scrollableBody`) + `validator.ts` |
| `wizard` | Azúcar de `form` con `layout.mode = "steps"`; `ref` a `Action.steps` | `DynamicForm` en modo pasos |
| `confirm` (v1) | Se mantiene; internamente es `form` + acciones | `DynamicForm` + botones |
| `settings` | Panel de configuración de un addon por referencia: `{addon, keys?, scope: org\|branch, section?}`; nunca en línea | `settings.Resolver`/`Store` del kernel (ADR 0002, con `rev` y `expectedRev`) + `DynamicForm` (`FromSettings` proyecta `Setting` → campo). Secretos: solo `write_only` (nunca se sirven) |
| `media` | Imagen (y video corto) **solo** por id de asset (`asset:<id>`) o ruta relativa de la app; `alt` obligatorio; `width/height` obligatorios | `Image` del host; jamás URL externa interpolada |
| `slot` | Monta un punto de extensión con nombre (`record.panels`, `dashboard.widgets`…, catálogo `slots@1` de DISENO-EXTENSIBILIDAD) | `<Slot>` (`slot.tsx`) |
| `ext` | Bloque registrado por un addon: `{ext: "<addon>.<nombre>@<mayor>", props}` (§2.6) | Componente federado registrado, validado contra su `props_schema` |

Modal y drawer **no** son bloques en línea: se declaran en `overlays` y se abren con la acción `open` (§2.4). Se pintan con `ResponsiveDialog`/`Sheet`.

### 2.3 Vinculaciones y expresiones (sin `eval`)

- **Una sola forma de vincular**: `{"$ref": "<raíz>.<ruta>"}` en **posiciones de valor** (texto, `value` de campos, filas, `rows`, parámetros de acción declarados). Raíces cerradas: `data` (fuentes declaradas), `state` (estado local), `record` (el registro anfitrión, si el spec vive en una ficha o modal), `ctx` (solo `locale`, `currency`, `time_zone`, `branch_id`). Gramática: `^(data|state|record|ctx)(\.[A-Za-z_][A-Za-z0-9_]{0,63}|\.[0-9]{1,3}){1,6}$`. No hay operadores, funciones, plantillas ni índices calculados.
- **i18n**: `{"$t": "clave", "args": {"n": {"$ref": "data.orders.total"}}}`. Los argumentos se insertan como texto. Con `i18n: "keys"` todo texto visible debe ser `$t` (los addons ya etiquetan con claves en el manifest); el agente usa `literal`.
- **Formato**: declarativo con `format` (`StatFormat`) y `currency` de `ctx`; nunca cálculo de negocio en el frente (los totales llegan del servidor, como ya exige `ViewDataSource`).
- **Condiciones (`when`)**: la forma de `VisibleWhen` ampliada a cualquier raíz: `{"ref": "state.tab", "equals": "lista"}`, `{"ref": "...", "in": [...]}`, `not_in`, `empty: true|false`. Se evalúa con la misma función pura que ya usa el formulario (`evaluateVisibleWhen`, `dynamic-form-schema.ts:455`), generalizada y movida a `genui/core` (sin React); `runtime-react` la reexporta para no tener dos.
- **Fuentes de datos** (`data.<nombre>`), cerradas a cuatro formas, todas resueltas por el **query batch** (`batchGet`/`loadQueryPart`; en v2, el sobre de ADR 0004):
  - `{"q": "<token>"}` con prefijos de **lectura** únicamente: `t:` `m:` `mm:` `o:` `r:` `i:` (y `mi:`/`me:` de v2). `x:` solo si la extensión está en la lista del servidor. Las referencias `@parte.campo` del batch se admiten solo en valores de filtro, como en v2 §8.6.
  - `{"plan": "model.list", "args": {...}}` — planes con nombre del batch v2 (`model.list`, `model.form`, `dashboard.home`).
  - `{"widget": "<addon>.dashboard.<key>"}` — un `DashboardWidget` declarado por un manifest instalado, por el mismo `LoadWidgetData` del tablero.
  - `{"inline": [...]}` — filas literales (lo que hace hoy v1).
  Nunca SQL, nunca URL, nunca endpoint libre. El `org_id` y el usuario salen siempre del JWT, jamás del spec.

### 2.4 Acciones declarativas

Toda acción es `{"do": <verbo>, ...}` y puede llevar `label`, `variant`, `icon` (slug de lucide resuelto por `DynamicIcon`), `confirm` y `when`. Verbos cerrados:

| `do` | Efecto | Quién decide |
|---|---|---|
| `navigate` | `{route: {name: "record", model, id} \| {name: "list", model, filters} \| {name: "page", key} \| {path: "/m/..."}}`; solo rutas de la app (se valida con `isSafeLink` sin http) | Router del host (`onNavigate`) |
| `invoke` | Ejecuta una **acción del manifest**: `{action: "<addon>.<Model>.<key>", record: {"$ref": "record.id"}, params}`. Si la acción declara `fields`/`steps`/`modal` y el spec no trae `values`, abre `ActionModalDispatcher` (no se duplica su lógica: prefill, federado, supervisor, `requires_addon`) | Handler de acción del servidor (RBAC, `requires_state`, `supervisor_policy`) |
| `submit` | Envía un `form` del documento a: `invoke` (acción del manifest), `settings.write` (ADR 0002, con `expectedRev`), `record.create` / `record.update` (`/dynamic/<model>`) | Los mismos endpoints que ya validan por tipo contra el manifest |
| `open` / `close` | Abre/cierra un `overlay` (`modal` o `drawer`) | Cliente |
| `set` | Escribe un **literal** en `state.<ruta>` (cambiar pestaña, elegir filtro) | Cliente; nunca toca el servidor |
| `refresh` | Recarga una fuente `data.<nombre>` | Cliente → batch |
| `emit` | Compatibilidad v1: `{id, params}` hacia un manejador del host registrado en lista (`automations.confirm`…, `UIActionEvent`) | Host (allowlist de ids) |

**Modelo de permisos y confirmación**

- **Compuerta única en el servidor.** El cliente oculta lo que `p:` (permisos efectivos) dice que no se puede, pero eso es solo UX: cada `invoke`, `submit` y fuente de datos pasa por el mismo código de autorización que su ruta directa (ADR 0004, §5 "compuerta única"; en ajustes, `settings.Store.Write`). Un spec no puede elevar permisos ni nombrar una org.
- **La confirmación solo puede endurecerse.** Si la acción del manifest es `Destructive` o `Confirm`, el renderer confirma aunque el spec no lo pida; el spec puede añadir `confirm: {title, body, tone: "danger", require_text?}` pero no quitarla. Acciones con `supervisor_policy` pasan por `useSupervisor().authorize` como hoy.
- **Lo que propone el agente nunca se ejecuta solo.** Una acción de un spec del agente requiere un clic humano; no hay `autorun`. El resultado de una acción no se reinyecta al agente con autoridad de herramienta.
- **Estado de formulario**: cada `form` es dueño de `state.<id_del_form>.values` (sembrado por `fields[].value`, `$ref` o `record`, como `seedValues` de `DynamicForm`), `errors` y `dirty`. Validación en cliente con `validator.ts` y **revalidación en servidor** (el kernel ya lo hace al crear, actualizar y en payloads de acción). Los campos ocultos por `visible_when` no se envían (misma regla que `stripHiddenFieldValues`).

### 2.5 Compatibilidad, versiones y negociación

- **`genui/v1` sigue válido** al menos hasta 12 meses después de publicar `genui/v3`. Go y TS exponen `Upgrade(v1) → v2` (sin pérdida: los 8 bloques existen en v2 con la misma forma) y el renderer v2 acepta los dos. El paquete Go `genui` (v1) no cambia su API (lo usan `automation` y `agent`); v2 vive en `genui/v2` y `genui.ParseAny` devuelve siempre un v2 normalizado.
- **Política de versiones del contrato**: `version` solo cambia de mayor (`genui/v3`) si un campo existente cambia de significado o se retira. Agregar un bloque, un campo opcional, un verbo o un formato es **aditivo** dentro de v2 y se descubre por capacidades, no por versión.
- **Negociación (`q:caps`)**: la parte `q:caps` del batch v2 incluye `genui: {versions: ["genui/v1","genui/v2"], blocks: [...], verbs: [...], ext: ["shipments.route_map@1", ...], limits: {...}}` y el cliente envía las suyas (lo que tiene registrado su `GenUIProvider`). El servidor (agente, automatizaciones, resultados de acción) emite solo bloques que ambos soportan y, si no, aplica `Downgrade(spec, caps)`: cada bloque no soportado se sustituye por su `fallback` (texto). El prompt de herramientas del agente lista solo los bloques negociados. Mientras `q:caps` no exista en ops, el servidor asume `genui/v1`.
- **Cliente que recibe un bloque desconocido** (no debería pasar tras negociar): pinta el `fallback` o un aviso neutro y sigue con el resto; no invalida el documento. Un **campo** desconocido dentro de un bloque conocido sí invalida el documento (estricto como en v1).
- **Paquetes npm**: `@asteby/metacore-genui` 2.x → **minor** (v2 es aditivo; nuevas exportaciones; `GenerativeUI` acepta ambos). La retirada del SVG propio y de los inputs internos de `ConfirmView` va en **3.0.0**, tras un minor con aviso de obsolescencia.
- **Migración**: ningún spec v1 almacenado se reescribe; `automation/view.go` puede seguir emitiendo v1 indefinidamente. Los consumidores migran por la tabla de §2.7.

### 2.6 Seguridad

- **Lista cerrada en dos niveles**: los bloques del núcleo (§2.2) + las extensiones `ext` que (a) declara un manifest **instalado** en `contributions.genui_blocks[] {name, version, props_schema, permission}`, (b) valida el hub al publicar, y (c) registra el SDK con `registerGenUIBlock("<addon>.<nombre>@<mayor>", Componente, propsSchema)`. Si falta cualquiera de las tres, se pinta el `fallback`. `props_schema` es un subconjunto de JSON Schema: `string` (con `maxLength`), `number`, `boolean`, `enum`, `array` de esos, y `$ref` de genui; nada de objetos libres. Los widgets de campo siguen el mismo camino: `widget` sale del enum del contrato (B4) o de `registerFieldWidget`.
- **Límites** (Go y TS idénticos, servidos en `q:caps`): documento 128 KB; profundidad 6; 200 bloques en total, 24 hijos por contenedor; 8 pestañas; 8 pasos; 4 overlays; 8 fuentes de datos; 200 vinculaciones; 32 acciones (6 por bloque); tabla en línea 12 columnas × 200 filas (con `source`, 24 columnas y la paginación del servidor); gráfica 6 series × 500 puntos; formulario 40 campos; `markdown` 8 000 caracteres; resto como v1 (`label` 160, `text` 2 000). Los datos que llegan por una fuente se recortan al límite del bloque, no amplían el documento.
- **Sanitización**: todo texto se pinta como texto. Sin HTML, sin `style`, sin `className`, sin colores literales (solo `Tone`/`accent`), sin SVG ni `<image>` aportados. Iconos solo por slug de lucide. Enlaces: rutas relativas de la app o `http(s)` **literal** (nunca `$ref`), y los externos solo si el host lo permite (`allowExternalLinks`, por defecto apagado fuera del chat). Medios solo por id de asset o ruta relativa.
- **Anti-exfiltración por vinculaciones**: un `$ref` nunca puede aparecer en `url`, `link`, `media.src`, `navigate.path` ni en un `emit` hacia un manejador que no lo declare; los `params` de `invoke` solo aceptan `$ref` a claves que la acción del manifest declara como campo, y el servidor los revalida. Las fuentes se evalúan con los permisos **del que mira**, no del que escribió el spec (un spec del agente o de un addon no ve más que el usuario). No existe ningún verbo que envíe datos a un destino arbitrario.
- **Validación en ambos lados y al guardar**: el servidor valida al producir (agente, wasm, kernel) y al **persistir** (tableros, specs de addon publicados en el hub con el validador Go); el cliente revalida siempre antes de pintar (`parseUISpec`). Errores con **código estable** (`genui.unknown_block`, `genui.field_not_allowed`, `genui.unsafe_link`, `genui.limit.depth`…), no solo texto.

### 2.7 Paridad Go↔TS: esquema JSON como fuente única

- **Fuente**: `metacore-kernel/genui/schema/genui-v2.schema.json` (JSON Schema 2020-12, `additionalProperties: false` en cada bloque, enums de `Tone`, `StatFormat`, `field.kind`, verbos). Se elige el esquema —no structs Go— como fuente porque además alimenta las *structured outputs* del agente (el LLM recibe el esquema recortado a las capacidades negociadas) y el editor visual. Es una excepción explícita al default de la auditoría C.1 (structs Go como fuente del manifest); ver Decisiones abiertas.
- **Generado**: tipos Go (`genui/v2/types_gen.go`, `go generate`), tipos TS (`packages/genui/src/generated/genui-v2.ts`, `json-schema-to-typescript`), y las tablas de campos permitidos por bloque (`ALLOWED` de `validate.ts` hoy, `onlyFields` en Go) en ambos lenguajes. Gate de CI en los dos repos: `go generate ./genui/... && git diff --exit-code` y `pnpm --filter @asteby/metacore-genui codegen && git diff --exit-code`.
- **Escrito a mano (y solo esto)**: las reglas que el esquema no expresa (gramática de `$ref`, profundidad y totales, unicidad de `id`, que `open` apunte a un overlay existente, `isSafeLink`, `$ref` prohibido en URLs). Una implementación por lenguaje, verificada por la suite.
- **Suite de conformidad con vectores compartidos**: `metacore-kernel/genui/testdata/conformance/{valid,invalid,upgrade,downgrade}/*.json`, cada uno con `{"input": …, "expect": {"ok": bool, "code": "genui.…", "output": …}}`. El kernel los corre en `go test`; el SDK los trae fijados a la versión del kernel (`scripts/sync-genui-vectors.mjs`, con hash en un archivo de bloqueo) y los corre en vitest. Un vector nuevo en Go que el TS no cumple rompe el CI del SDK al subir el pin.

### 2.8 Cómo lo consume cada superficie

| Superficie | Hoy | Con genui v2 |
|---|---|---|
| **Modales y `ActionModalDispatcher`** | Formulario genérico, wizard, federado y confirmación con su propio `renderField` | `renderField` se elimina a favor de `resolveWidget` (B9). La proyección `FromAction` (fields/steps/confirm → `form`/`wizard`/`confirm`) es la que usa el agente para proponer una acción ya rellenada. Una acción wasm puede devolver `{ui: spec}` como resultado y el dispatcher lo muestra en el mismo modal (`GenerativeUI`) en lugar de un toast. |
| **Vistas y tablas** | `DynamicView`/`DynamicTable` por metadata | Siguen igual; `model_view` y `table` con `source` son la puerta declarativa para pantallas compuestas (pestañas con una tabla y una gráfica) sin componente nuevo. |
| **Configuraciones** (ajustes de addons, conectores, setup) | `AddonConfigSurface`, `SetupFormStep`, `ConnectorBlocks` con controles propios | Bloque `settings` (ref) → `FromSettings` → `DynamicForm`; `SetupFormStep` usa `form`; `ConnectorFormBlock` se proyecta a `markdown` (instructions), `card.fields[].copy` (webhook_url) y `invoke` (action). Se borran los tres renderizadores manuales. (`starter-config` es configuración de build/lint; no entra.) |
| **Tableros** | `DashboardGrid` + `contributions.dashboard[]` | Siguen igual; `stats`/`chart` con `source: {widget}` reutilizan `LoadWidgetData`, de modo que el agente puede mostrar un widget declarado; "fijar al tablero" queda para después y solo para consultas declaradas. |
| **Agente de IA** | `ChatEmbed.UI` (v1) y además `ChatEmbed.Chart` (`ChartSpec`) | Emite v2 negociado; el embed `chart` se depreca a favor del bloque `chart` (una sola gráfica). `createGenerativeUIResult` se registra en ops. |
| **Secciones del storefront** (`local`, tiendas) | `defineSection({type, schema, component})`, SSR, diseño propio de cada tienda | Los bloques visuales de la tienda **no** pasan a genui (la marca vive en el repo de la tienda y el SSR no debe cargar `metacore-ui`). Se unifica el **vocabulario de props**: `SectionPropKind` se define como subconjunto de `field.kind` de genui (`sectionSchemaToFields` en `storefront-react`, junto a `sectionTypesToOps`). El estudio de OPS edita las props de una sección con un `form` de genui generado desde ese esquema. `local` y las tiendas solo suben de versión. |
| **Editor visual** (estudio de OPS) | Formularios propios por tipo de prop | Usa `form` de genui para editar props de secciones y, más adelante, specs de tablero; el esquema genui-v2 le da autocompletado y validación. |

**Extensibilidad para addons**: `ext` (§2.6) y `slot` (catálogo `slots@1`). La declaración `contributions.genui_blocks[]` entra en el **único** bump de esquema R2 (Ola 3 de DISENO-EXTENSIBILIDAD), en el mismo PR que `inject[]`; no abre una cadena de release aparte. Un `DetailPanel kind:"custom"` y un `DashboardWidget kind:"custom"` se proyectan a `ext`.

## 3. Plan por PRs pequeños

Orden global; cada fila es un PR. **Ejecuta Sonnet; revisa Opus** donde se indica (todo lo que toca seguridad, contrato o datos de producción).

| # | Repo | PR | Depende de | Ejecuta / revisa |
|---|---|---|---|---|
| 0 | sdk | Este ADR + resumen en `packages/genui/README.md` | — | Opus / usuario |
| 1 | sdk | `genui`: separar `src/core/` (tipos, validación, `isSafeLink`, sin React) del renderer; códigos de error estables; `upgradeV1` (identidad estructural). Sin cambio visible | 0 | Sonnet / Opus |
| 2 | sdk | `runtime-react`: `EditField` → `resolveWidget` + registro (B9); `renderField` del dispatcher delega en lo mismo. Golden de render por tipo de campo | — (paralelo a 1) | Sonnet / Opus |
| 3 | kernel | `genui/schema/genui-v2.schema.json` + `genui/v2` (tipos generados, validador, `Upgrade`, `Downgrade`, `ParseAny`) + vectores de conformidad. `genui` v1 intacto | 0 | Sonnet / **Opus** (contrato y seguridad) |
| 4 | sdk | `genui`: tipos generados desde el esquema + validador v2 + runner de los vectores del kernel (`sync-genui-vectors`) + gate de codegen | 3 | Sonnet / Opus |
| 5 | sdk | `genui`: `GenUIProvider` y registro de renderers; bloques presentacionales (`stack/grid/tabs/section/markdown/alert/empty/list/media`). `runtime-react`: renderers `form`, `chart` (metacore-charts), `stats`, `table` en línea. `ConfirmView` y `ChartView` pasan a usar los renderers; los internos quedan obsoletos | 1, 2, 4 | Sonnet / Opus |
| 6 | sdk | Motor de vinculaciones y acciones: `$ref`, `$t`, `when`, fuentes por `batchGet`, verbos `navigate/invoke/submit/open/close/set/refresh/emit`, confirmación endurecida, supervisor | 5 | Sonnet / **Opus** (anti-exfiltración) |
| 7 | sdk | **Piloto** (ver abajo): bloque `settings` + `FromSettings` en TS; `AddonConfigSurface` usa `settings` para los ajustes generales tras un flag | 5, 6 | Sonnet / Opus |
| 8 | ops | Registrar `GenUIProvider` y `createGenerativeUIResult` en el frontend; flag del piloto en `features/installed-addons`; prueba e2e con `inventory` | 7 | Sonnet / Opus |
| 9 | ops + kernel | `q:caps` publica `genui` (cuando exista el sobre v2 de ADR 0004); el agente negocia y emite v2; embed `chart` obsoleto | 3, ADR 0004 | Sonnet / Opus |
| 10 | sdk | `table`/`model_view`/`view` con `source` (fachadas de `DynamicTable`/`DynamicView`/`DetailPanels`); overlays `modal`/`drawer` | 6 | Sonnet / Opus |
| 11 | sdk | `SetupFormStep` y `ConnectorBlocks` sobre `form`/`markdown`/`card`; `setup/tone.ts` como mapeo de `Tone`; `safeHttpsUrl` → `isSafeLink` | 5 | Sonnet / Opus |
| 12 | sdk | `storefront-react`: `SectionPropKind` ⊂ `field.kind` y `sectionSchemaToFields`; sin cambio visual en tiendas | 4 | Sonnet / Opus |
| 13 | kernel + hub | `contributions.genui_blocks[]` dentro del bump R2 (Ola 3); validación al publicar; `registerGenUIBlock` en el SDK | 3, R2 | Sonnet / **Opus** |
| 14 | sdk | `@asteby/metacore-genui` 3.0.0: retirar SVG propio e inputs internos | 5 + un minor de aviso | Sonnet / Opus |
| 15 | local | Subir versiones; sin cambios de diseño | 12 | Sonnet / Opus |

**PR piloto (7 + 8): los ajustes generales de un addon en "Addons instalados".** Pantalla: `ops/frontend/src/features/installed-addons/index.tsx`, que monta `AddonConfigSurface`; se reemplaza solo el bloque de ajustes no secretos (`addon-config-surface.tsx:1085-1140`) por `<GenerativeUI spec={{version:"genui/v2", blocks:[{type:"settings", addon, scope}]}}/>`. Addon de prueba: **`inventory`** (5 ajustes: integer, string, boolean, number; sin `scope: branch`), y después `paypal` (agrega `select`). Por qué esta: (1) borra un renderizador duplicado real; (2) arregla un bug medible (el integer que hoy viaja como texto); (3) ejercita `form`, `submit → settings.write` con `expectedRev` (ADR 0002), permisos en servidor y estado local, sin tocar tablas ni datos de negocio; (4) es reversible con un flag. Criterio de éxito: mismo payload que hoy para string/boolean/number, entero tipado para integer, cero diferencias en e2e de ops, y el bloque de ajustes de `addon-config-surface.tsx` se borra en el PR siguiente al apagar el flag.

**Riesgos**

- *Tamaño de bundle*: genui no debe arrastrar `runtime-react` ni `recharts`; se mitiga con el registro inyectado (§2.1-4) y la carga perezosa de charts (ya existe `preloadCharts`). Hoy no hay presupuesto de tamaño en el repo: el PR 5 agrega uno (p. ej. `size-limit`) para `genui` y `runtime-react`.
- *Contrato más grande, más specs inválidos del agente*: se mitiga con el esquema recortado a capacidades como *structured output* y con `Downgrade`.
- *Deriva Go↔TS*: la suite de vectores y los gates de codegen; el pin del kernel en el SDK debe estar al día (auditoría B5/B16).
- *Doble camino durante la migración*: cada PR de convergencia borra el código viejo o lo deja tras un flag con fecha de retiro; no se permite que convivan dos renderizadores sin flag.
- *Dependencia de ADR 0004*: la negociación por `q:caps` espera al sobre v2 del batch; hasta entonces el servidor emite v1 y el cliente v2 consume ambos.

## 4. Alternativas descartadas

- **Un "page builder" nuevo con su propio árbol de componentes**: sería el séptimo renderizador de formularios y el cuarto de gráficas.
- **Meter genui dentro del manifest como lenguaje de pantallas completas desde ya**: duplica `Action.fields`, `DetailPanel`, `DashboardWidget` y `FormLayout`, y obligaría a un bump de esquema extra. Se proyecta desde el manifest en vez de reemplazarlo.
- **JSX/HTML o plantillas con expresiones (estilo Handlebars, JSONLogic, CEL)**: abren `eval`, interpolación en URLs y costo de auditoría; `$ref` + `when` + verbos cerrados cubre los casos medidos.
- **Federar componentes para todo (Module Federation)**: ya existe como escape (`modal`, `custom`), pero no es declarativo, el agente no puede producirlo y no se valida en servidor.
- **Unificar también los bloques visuales del storefront**: la marca de cada tienda vive en su repo (CLAUDE.md de `local` y de las tiendas) y el SSR no debe cargar la UI del admin; se comparte el vocabulario de props, no el dibujo.

## 5. Decisiones abiertas (solo el usuario; con default recomendado)

1. **Fuente del contrato**: ¿JSON Schema como fuente (genera Go y TS) o structs Go como fuente (genera el esquema), como recomienda la auditoría para el manifest? **Default: JSON Schema** para genui, porque además lo consumen el LLM y el editor; el manifest sigue con structs Go.
2. **¿Pantallas completas declaradas en el manifest con genui** (`contributions.pages[].ui`) en R2, o solo resultados en tiempo de ejecución (agente, acciones, tableros, ajustes) y bloques `ext`? **Default: no en R2**; se reevalúa tras el piloto y los PRs 10-11.
3. **Enlaces externos en specs fuera del chat** (tarjetas en fichas o tableros). **Default: apagado**; el host lo habilita por superficie.
4. **¿Puede un addon devolver un spec genui como resultado de una acción wasm** (mostrarlo en el modal)? **Default: sí**, validado en el kernel antes de salir y sujeto a las mismas fuentes de solo lectura.
5. **Piloto**: ajustes de `inventory` en "Addons instalados" (default) o la tarjeta de automatizaciones del chat (cero riesgo, pero no borra duplicación).

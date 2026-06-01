# @asteby/metacore-runtime-react

## 13.6.0

### Minor Changes

- ee91499: feat(runtime-react): metadata-driven DynamicRelations, DynamicRelation scope filters, and an upload field widget

  Three additive primitives for generic detail pages and file-bearing actions
  (kernel >= v0.41.0):
  - **`DynamicRelations`** — a metadata-driven panel list. Given a parent record
    and `TableMetadata.relations[]` (the new `RelationMeta[]` the kernel serves),
    it renders one `DynamicRelation` panel per relation, merging each relation's
    static `scope` (polymorphic discriminators like `{ owner_model: "Customer" }`)
    plus `{ <foreign_key>: parentId }` into the panel's `filters`. This is what a
    generic detail page renders to show "a Customer's vehicles, addresses,
    attachments".
  - **`DynamicRelation.filters`** — new optional `filters?: Record<string,string>`
    prop so a relation can be scoped by MORE than one column (the polymorphic
    case: `foreign_key=owner_id` AND `owner_model=Customer`). Each entry threads
    into the child list query as an additional `f_<col>=eq:<val>` param alongside
    the foreign-key filter, is hidden from the rendered child columns, and is
    folded into create/attach payloads so new children carry the scope.
  - **`upload` field widget** — `type:"upload"` / `widget:"upload"` action fields
    now render a themed file picker (semantic tokens) that POSTs the file to the
    host upload endpoint as multipart and stores the returned file url/path as the
    field value. Honors `accept` and `maxSize` (tolerates kernel snake_case
    `max_size`/`storage_path`). Wired into BOTH the standalone `DynamicForm`
    renderer and the `ActionModalDispatcher` renderer so they stay in sync.

  All purely additive — zero behavioural change for existing relations, forms, and
  action modals.

## 13.5.2

### Patch Changes

- bc99aec: Gate per-row table actions by the row's `status` against the action's `requiresState`.

  Row actions that declare a non-empty `requiresState` (camelCase or the snake_case
  `requires_state` served by the backend) are now hidden in the row-action dropdown
  unless the row's `status` value is one of the declared states. For example, an
  "Iniciar trabajo" action with `requiresState: ['reception']` no longer appears on an
  order already in `in_progress`.

  Additive and null-safe: actions without `requiresState` (or an empty array) are always
  shown, and rows without a `status` field surface every action, so there is no
  regression for existing models.

## 13.5.1

### Patch Changes

- 2778004: fix(action-modal): sticky header + footer, scrollable body

  A tall declarative form (a journal entry with many line-items rows) used to push
  the Cancel/Submit footer below the viewport. The action modal now caps at 90vh
  and scrolls ONLY the field area — the title and the action buttons stay pinned
  and always reachable.

## 13.5.0

### Minor Changes

- 0e427f1: feat(forms): modern date picker, roomy line-items modal, 2-column layout

  Three declarative-form polish items, all driven by field shape — zero per-app code:
  - **DynamicDateField**: `type: "date"` fields now render a shadcn Calendar inside
    a Popover instead of the native `<input type="date">`. The Popover portals to
    the body so the calendar is never clipped by the modal (fixes the cut-off), and
    it looks modern. The field value stays an ISO `YYYY-MM-DD` string, so payloads
    are unchanged. No future-date restriction (entries can be post-dated).
  - **Roomy modal for line-items**: GenericActionModal auto-widens to ~820px when
    the action has a line-items (`type:"array"`) field so the debit/credit grid has
    room; plain forms stay compact. An optional `action.modalWidth` overrides.
    Applied as an inline style so it always takes effect.
  - **2-column field layout**: scalar fields (journal, date, reference) flow
    side-by-side instead of one tall vertical stack; line-items grids and textareas
    span full width. Mirrors DynamicForm so the action modal and standalone form
    render identically.

## 13.4.1

### Patch Changes

- f03fe86: fix(action-modal): render `dynamic_select` action fields as the searchable async picker instead of a plain text input

  ActionModalDispatcher's GenericActionModal had its own field renderer that keyed
  off `field.type` and had no `dynamic_select` case, so a declarative action field
  with `type: "dynamic_select"` (e.g. the Diario/Cuenta pickers of a journal entry)
  fell through to a plain text `<Input>`. It now resolves the widget the same way
  DynamicForm does (`resolveWidget`) and routes `dynamic_select` to
  `DynamicSelectField`, keeping action modals and the standalone form in lockstep.

## 13.4.0

### Minor Changes

- 23d737f: feat(runtime-react): rich declarative line-items — column totals, balance rule, pro layout

  Makes the declarative form/modal renderer rich enough to replace a custom
  federated modal for line-items entry (e.g. a journal entry's debit/credit grid),
  driven entirely from the manifest:
  - **Totals footer** — any `item_fields` column flagged `total: true` is summed
    across rows and shown in a footer row (`computeLineItemTotals`). Numeric
    columns render right-aligned with `tabular-nums`.
  - **Balance rule** — a `type: "array"` field can declare
    `balance: { debit_column, credit_column, message?, require_nonzero? }`. The
    grid shows a live "Cuadrado" / "Descuadre: N" badge and the form blocks submit
    until `Σ(debit_column) === Σ(credit_column)` (and, by default, > 0). Fully
    generic — debit/credit are just the two column keys to reconcile. Typing a
    value into one reconciled column clears its sibling on the same row.
  - **Pro layout** — `DynamicForm` flows scalar header fields through a responsive
    2-column grid while line-items grids and textareas span full width, matching
    the look of the hand-written federated journal modal without any custom React.

  New pure helpers (`computeLineItemTotals`, `evaluateBalance`, `getBalanceRule`,
  `toNumber`) are exported and unit-tested so hosts can reuse the math. Mirrors the
  kernel v3 `ActionField.total` / `ActionField.balance` contract additions.

## 13.3.0

### Minor Changes

- 99477d6: feat(runtime-react): add `dynamic_select` field widget — async searchable FK picker

  Declarative answer to "I don't want to type a raw FK UUID". A field with
  `type: "dynamic_select"` (or `widget: "dynamic_select"`) + `ref` renders a
  typeahead combobox that queries the canonical options endpoint as the user
  types (`GET /api/options/<ref>?field=id&q=<text>&limit=<n>`), reusing
  `useOptionsResolver` (debounced, abortable). Works both as a flat form field
  and as a line-items column cell (e.g. the account_id per debit/credit row of a
  journal entry). The metacore equivalent of 7leguas' `type: search`, driven
  entirely from the manifest — addons get a searchable picker with zero custom
  React, keeping custom federated frontends for genuinely page-level UIs (POS).

## 13.2.0

### Minor Changes

- fb45ad4: Migrate federation tooling from the broken `@originjs/vite-plugin-federation` to the official `@module-federation/vite` + `@module-federation/runtime`.

  **BREAKING (federation runtime swap — hosts and addons must rebuild):**
  - `metacoreFederationShared()` (starter-config) now returns a `@module-federation/vite` `federation()` config instead of an `@originjs` config. Same signature/call-sites: `metacoreFederationShared({ host })` → host config (name + shared, empty remotes — remotes register dynamically at runtime); `metacoreFederationShared({ host, exposes })` → remote config (name + filename + exposes + shared). Hosts MUST switch their `vite.config.ts` to `import { federation } from '@module-federation/vite'`.
  - The shared singleton list is now `{ singleton: true }` (no `requiredVersion: false`) and matches the addon + ops host contract exactly: `react`, `react-dom`, `react/jsx-runtime`, `react-i18next`, `i18next`, `@asteby/metacore-ui`, `@asteby/metacore-runtime-react`, `@asteby/metacore-sdk`, `@asteby/metacore-app-providers`, `@asteby/metacore-theme`, `@asteby/metacore-auth`. **Build-time gotcha:** `@module-federation/vite` resolves every shared bare specifier at build time, so each must be an installed (dev)dependency of the building package.
  - `AddonLoader` (runtime-react) now uses `@module-federation/runtime` (`registerRemotes` + `loadRemote`) instead of the manual `init`/`get`/`window[scope]` machinery. The host's `@module-federation/vite` build auto-initialises the shared scope, so the remote consumes the HOST's React/SDK singletons — fixing the `useState`-null crash.
  - `clearFederationContainer()` is now a deprecated no-op under the MF runtime (container replacement on hot-swap is handled by `registerRemotes(..., { force: true })`).

## 13.1.0

### Minor Changes

- 8d9c602: AddonLoader carga remotes de federación ESM vía `import()` dinámico (fix "Cannot use import statement outside a module").

  Los remotes built con Vite/@originjs `format:"esm"` (el estándar de `metacoreFederationShared`) son módulos ES que hacen `import` top-level y exportan `{ init, get }` — DEBEN cargarse como módulo. El `AddonLoader` los inyectaba como `<script>` clásico → el browser tiraba `Cannot use import statement outside a module` y la UI federada nunca cargaba. Ahora hace `import()` dinámico (vía `new Function` para que ningún bundler reescriba el import del URL externo) y usa el namespace del módulo como container; los remotes legacy "var"/window siguen soportados con fallback a `<script>` + `window[scope]`.

## 13.0.0

### Minor Changes

- 7ea7caa: Acciones con `placement` (`row` | `table` | `create`) y nuevo primitivo `<ModelActionToolbar>`.

  `ActionMetadata`/`ActionDefinition` ganan `placement`, espejando `manifest/v3` Action.placement del kernel (v0.30.0):
  - `row` (default) — acción por fila dentro de `<DynamicTable>` (comportamiento actual).
  - `table` — botón en la toolbar de la página, sin contexto de record.
  - `create` — botón en la toolbar que **reemplaza** el botón "crear" genérico, para addons que traen una experiencia de creación custom (p.ej. un asiento contable con líneas débito/crédito).

  `<ModelActionToolbar>` (+ hook `useModelActions`) es el primitivo genérico que renderiza esos triggers de nivel página y monta el `ActionModalDispatcher` (record vacío para `create`). Resuelve tanto modales federados custom (vía el action registry) como el form declarativo genérico. `DynamicCRUDPage` lo consume internamente y suprime su botón crear cuando existe una acción `create`; `DynamicTable` excluye los placements `table`/`create` de la columna de acciones por fila. Los hosts ya no reimplementan el plumbing de botones de acción — montan `<ModelActionToolbar>` y listo.

### Patch Changes

- Updated dependencies [7ea7caa]
- Updated dependencies [3b40ed5]
  - @asteby/metacore-sdk@3.1.0
  - @asteby/metacore-ui@2.1.0

## 12.0.0

### Minor Changes

- 5e17059: Add declarative line-items (repeatable group) support to the action
  form renderer, pairing with the kernel v3 `ActionField.item_fields`
  addition. Multi-line action modals (e.g. a "Recibir mercancía" modal
  with N item rows, or a journal entry with N debit/credit lines) can now
  be declared in the manifest instead of needing a custom federated modal.
  - `ActionFieldDef` gains `itemFields?: ActionFieldDef[]` (mirrors the v3
    `item_fields`). A field carrying item columns is a repeatable group;
    its value is an array of row objects keyed by the item field keys.
  - `buildZodSchema` now builds `z.array(z.object(...))` for line-items
    fields, applying each column's per-cell rules per row; a required
    group requires at least one row. New `isLineItemsField` / `getItemFields`
    helpers tolerate both camelCase `itemFields` and raw snake_case
    `item_fields` served by the kernel.
  - New `DynamicLineItems` component renders a row grid (header from the
    item field labels, add/remove row controls, each cell a widget via
    `resolveWidget`, including `ref`-driven selects). It is wired into both
    `DynamicForm` and `ActionModalDispatcher`'s declarative-fields path.

  Additive only: existing flat-field rendering is unchanged.

- 212c6ab: Add `CreateRecordDialog` and `ViewRecordDialog` to
  `@asteby/metacore-runtime-react` (Wave 2.5 cleanup).

  Both components are thin, intent-specific wrappers over the existing
  `DynamicRecordDialog`. They surface a narrower, callback-driven API so
  addons can mount create/edit/view dialogs without having to pre-select
  a `mode` and without coupling to product-specific affordances:
  - `CreateRecordDialog` — opens in create mode by default; passing
    `recordId` flips it to edit. Optional `onCreate` / `onUpdate`
    callbacks override the default `useApi()` POST/PUT calls, and
    `defaults` seeds the form on create.
  - `ViewRecordDialog` — read-only viewer with optional `onEdit` /
    `onDelete` affordances (footer buttons are hidden when the callback
    is not provided).
  - New shared types: `ModelKey`, `ModelSchema`, `RecordDialogProps`,
    `CreateRecordDialogProps`, `ViewRecordDialogProps`, `CreateResult`.

  `DynamicRecordDialog` itself gains the same optional props
  (`onCreate`, `onUpdate`, `defaults`, `schema`, `onEdit`, `onDelete`)
  so existing consumers keep working unchanged. The product-specific
  dialogs that used to live in `ops/frontend` (with pricing rules, media
  galleries, category-driven custom attributes) are intentionally NOT
  promoted to the SDK — those stay in the host as they are product
  domain concerns. Generic record CRUD lives here.

### Patch Changes

- Updated dependencies [26063a4]
  - @asteby/metacore-sdk@3.0.0

## 11.0.0

### Patch Changes

- 3a3ea4b: fix: unify slot priority ordering across SDK and runtime-react (was
  inconsistent — DESC is now canonical, see `docs/slot-priority.md`).

  `Registry.registerSlot` in `@asteby/metacore-sdk` sorted ascending
  ("lower renders first") while `slotRegistry` in
  `@asteby/metacore-runtime-react` sorted descending ("higher renders
  first"). The runtime-react behaviour matches `docs/dynamic-ui.md`,
  `mergeNavigation` and every other priority sort in the codebase, so the
  SDK has been flipped to match. Addons that register a single
  contribution per slot — i.e. every in-tree consumer we audited — are
  unaffected. Addons relying on the inverted SDK order will need to swap
  their priority values.

- Updated dependencies [dee623a]
- Updated dependencies [56d2013]
- Updated dependencies [1c4a108]
- Updated dependencies [3a3ea4b]
  - @asteby/metacore-sdk@2.6.0

## 10.0.0

### Minor Changes

- 9ce8269: feat: hot-swap reload policy (RFC-0001 D4 close)

  Closes the gap between `useManifestHotSwapSubscriber` (already invalidates
  the metadata cache) and the federation container of an already-mounted
  addon, which keeps the old code in memory until something forces a
  re-evaluation.

  **runtime-react:**
  - New `hotswap-reload-policy` module ships three policies and a single
    hook that wires the chosen policy to the manifest hot-swap stream:
    - `useHotSwapReload(client, { strategy })` returns `{ addonVersionMap }`
      — a reactive map `addonKey → hashShort` that hosts wire into
      `<AddonRoute version={addonVersionMap[addonKey]} ... />`. Default
      strategy is `"rekey"`: React unmounts and remounts the addon subtree
      on every swap, which forces the federation loader to re-fetch
      `remoteEntry.js?v=<hash8>` and re-evaluate the exposed module.
    - `strategy: "page-reload"` is an opt-in `window.location.reload()`
      escape hatch for immersive addons with critical in-progress state
      (POS, kitchen-display). Pair with `onBeforeReload` to surface an
      "unsaved changes" prompt — returning `false` cancels the reload.
    - `strategy: "manual"` only invokes `onSwap` with the message;
      the host decides what to do.
  - `clearFederationContainer(scope)` helper for hosts that hit
    `Container already registered` after a re-key; call it from the
    `onSwap` callback before the addon route re-mounts.
  - `applyHotSwapReload` exported for non-React shells that want to
    drive the policy from a vanilla container.

  **sdk:**
  - `loadFederatedAddon(spec, addonKey, version?)` accepts an optional
    `version` so the loader cache-busts `remoteEntry.js` via
    `?v=<hash8>` when the manifest hash bumps. Cache key includes the
    version so a fresh hash triggers a fresh load instead of returning
    the memoized old container.
  - New `withVersionParam(url, hash)` helper (idempotent, fragment-safe,
    replaces prior `v=` entries) exported for symmetry — the
    runtime-react module re-uses the same algorithm.

  **starter-core:**
  - `<AddonRoute>` accepts a new optional `version?: string` prop. When
    it changes, the route's children are wrapped in a `Fragment` with a
    new `key`, forcing the federation loader to re-evaluate.

  ### Host wire-up (4-5 lines)

  ```tsx
  const ws = useWebSocket()
  useManifestHotSwapSubscriber(ws)                         // metadata cache
  const { addonVersionMap } = useHotSwapReload(ws, { strategy: 'rekey' })
  // …in your router:
  <AddonRoute version={addonVersionMap[addonKey]} shell={renderShell}>
    <AddonLoader scope={addonKey} url={remoteEntryUrl} api={api} />
  </AddonRoute>
  ```

  Re-keying is intentionally destructive: any state inside the addon is
  lost because the code version changed. Hosts that need a confirmation
  gate should pass `onBeforeReload` and prompt the user before the swap
  applies.

- 04362f2: feat: immersive layout, federation shared-deps helper polish, wasm client

  **sdk:**
  - `FrontendSpec` now carries `layout?: "shell" | "immersive"`. Mirrors the
    upcoming kernel-side `manifest.FrontendSpec.Layout` field. `undefined` is
    treated as `"shell"` (legacy behaviour) so the change is purely additive.
    Exposed as the `AddonLayout` type alias for explicit consumers.
  - New `wasm-client` module — frontend twin of `kernel/runtime/wasm`. Ships
    `loadAddonWasm({ url, integrity, imports })` (SRI verification + instantiate
    pipeline) and `callAddonExport(instance, fn, payload)` honouring the same
    `ptr<<32 | len` packed ABI the Go example backends use (`alloc`, `free`,
    `memory`). Lets POS / kitchen-display / signage addons run their compiled
    module locally for sub-50ms latency without a webhook round trip. Typed
    errors (`WasmIntegrityError`, `WasmAbiError`) surface failure cause cleanly.

  **runtime-react:**
  - New `<AddonLayoutProvider>`, `useAddonLayout()`, `useAddonLayoutControl()`
    and `useDeclareAddonLayout()` API in `addon-layout-context`. The host shell
    reads the active layout and hides Sidebar / Topbar / breadcrumbs when an
    addon declares `layout: "immersive"`. Cleanup restores chrome on unmount,
    so navigating away from an immersive addon brings the shell back.
  - `<AddonLoader>` accepts an optional `layout` prop and propagates it through
    the context, so hosts get the chrome switch wired without per-route plumbing.

  **starter-config:**
  - `metacoreFederationShared()` now accepts `extra: Record<string, ShareConfig>`
    for the typical "I just want to add a package with explicit config" case
    (`extra: { lodash: { singleton: true } }`). The existing `extras: string[]`
    and `overrides` knobs are retained for backwards compatibility.
  - `METACORE_FEDERATION_SINGLETONS` adds `@asteby/metacore-app-providers` so
    the SDK's transport-agnostic platform provider keeps a single instance
    between host and addons.

- ba60c8f: feat: immersive route wrapper + manifest hot-swap subscriber (RFC-0001 D1 + D4)

  **runtime-react:**
  - `metadata-cache` gains `invalidateAddon(addonKey, matcher?)` and `clearAll()`
    so consumers can flush scoped cache entries when an addon's manifest hash
    changes. The default matcher recognises `addonKey`, `${addonKey}.`,
    `${addonKey}:` and `${addonKey}/` prefixes; hosts that namespace their
    `model` keys differently can pass a custom matcher.
  - New `manifest-hotswap-subscriber` module ships:
    - `ADDON_MANIFEST_CHANGED_TYPE` — the `ws.MessageType` constant the kernel
      emits via `bridge.WSManifestBroadcaster`.
    - `wireHotSwapInvalidation(client, options?)` — imperative helper hosts call
      once at boot. Accepts any object exposing `subscribe(type, handler)`
      (structurally compatible with `useWebSocket().subscribe`), invalidates
      the metadata cache for the bumped addon, and optionally invokes an
      `onSwap` side-effect callback (handy for forcing a `window.location.reload()`
      when the running addon's bundle hash changes, since metadata invalidation
      alone does not swap the federation container already in memory).
    - `useManifestHotSwapSubscriber(client)` — React hook variant for hosts
      that prefer mounting the wire-up next to their WebSocket provider.

  **starter-core:**
  - New `AddonRoute` component closes the host side of RFC-0001 D1 (immersive
    end-to-end). It reads `useAddonLayout()` from runtime-react and either
    renders the addon inside a caller-provided shell renderer (default
    `"shell"` layout) or strips chrome and pins the addon to the viewport
    (`fixed inset-0 z-50`) when the active layout is `"immersive"`. Supports
    both prop-driven layout (no shell flash for always-immersive routes like
    POS / kitchen-display) and context-driven layout (addon calls
    `useDeclareAddonLayout("immersive")` after mount). Cleanup restores
    `"shell"` so navigating away brings the chrome back.

  Together these closures unblock zero-polling hot-swap reloads in the
  metadata layer and let immersive addons own the viewport without each app
  re-implementing the shell branch.

### Patch Changes

- Updated dependencies [9ce8269]
- Updated dependencies [04362f2]
  - @asteby/metacore-sdk@2.5.0

## 9.2.0

### Minor Changes

- 150a907: feat: useOptionsResolver hook + locale-aware Validation via OrgConfigProvider

  **runtime-react:**
  - New `useOptionsResolver(args)` hook that consumes the v0.9.0 kernel
    envelope `{ success, data, meta: { type, count } }` from
    `GET /api/options/:model?field=…`. Replaces the ad-hoc `/data/<model>`
    reads `<DynamicRelation>` used to do.
  - `<DynamicForm>` now renders a Ref-driven `<RefSelect>` whenever an
    `ActionFieldDef.ref` is present — apps stop hardcoding option lists for
    belongs_to FKs.
  - `<DynamicRelation>` (kind="many_to_many") prefers the canonical options
    endpoint via `useOptionsResolver`. The legacy `referencesEndpoint` prop
    remains a working escape hatch for apps wired against custom routes.
  - `ColumnDefinition.ref` and `ColumnDefinition.validation` are now part of
    the metadata contract the SDK reads. `ActionFieldDef.ref` joins the
    field-level type so addons can declare ref-aware modal fields.
  - New `setOrgConfigBridge` / `resolveValidatorToken` surface lets apps
    feed a `useOrgConfig`-backed resolver into the SDK's validator
    pipeline. Validators with `custom: '$org.<key>'` are resolved at form
    build time; unresolved tokens degrade to no-op so missing config does
    not crash forms.
  - New `registerValidator(slug, fn)` lets apps install their own
    region-specific validators (e.g. `mx.rfc`, `co.nit`) without leaking
    fiscal vocabulary into the SDK.

  **app-providers:**
  - New `OrgConfigProvider` + `useOrgConfig()` companion to
    `PlatformConfigProvider`. Apps wire a per-org config fetcher and the
    provider exposes typed `currency`, `locale`, `validators` plus a
    `resolveValidator(refOrKey)` helper for the `$org.<key>` reference
    contract the kernel ≥ v0.9.0 emits.

## 9.1.0

### Minor Changes

- 2e50839: feat(runtime-react): leer `visibility` y `searchable` en metadata de columnas.
  - `ColumnDefinition` tipa los nuevos campos `visibility?` (`"all" | "table" | "modal" | "list"`) y `searchable?` que el kernel ya emite (`manifest.ColumnDef`). Backwards compat: zero-value preserva el comportamiento previo.
  - `<DynamicTable>` ahora oculta del listado las columnas con `visibility === "modal"` (y `"list"`) además del legacy `hidden`. Las columnas sin `visibility` o con `"all" | "table"` siguen visibles.
  - Cuando al menos una columna declara `searchable` el SDK acota el global search a esas columnas vía el nuevo query param `search_columns=<keys>`. Si todas las columnas se opt-out (`searchable: false`), el SDK deja de mandar `search` al backend. Si ninguna columna trae el flag (kernel anterior a v0.8.x), no se cambia nada.
  - Nuevos helpers públicos `isColumnVisibleInTable(col)` y `getSearchableColumnKeys(metadata)` exportados desde el barrel; tests con metadata mock cubren los pasos legacy + opt-in + opt-out total.

## 9.0.0

### Minor Changes

- d51ef45: feat(runtime-react): `DynamicForm` aplica `Validation` (regex/min/max) al schema zod generado y soporta widgets `textarea`/`richtext`/`color`.
  - `ActionFieldDef` extendido con `validation?: FieldValidation` (regex/min/max/custom — espejo del `ValidationRule` del manifest del kernel) y `widget?: FieldWidget | string`.
  - `DynamicForm` ahora deriva un schema zod por field y valida en el submit, mostrando errores inline en lugar del `alert()` previo. Min/max aplica como longitud para strings y como bound para numéricos (mismo dual semantics que el kernel). Regex malformada del manifest se ignora silenciosamente para no tirar el render.
  - Nuevo export `buildZodSchema(fields)` para que callers reutilicen el mismo schema fuera del form.
  - Renderer mapea widgets explícitos a primitivos de `@asteby/metacore-ui`:
    - `textarea` → `Textarea`
    - `richtext` → `Textarea` con `data-widget="richtext"` (puente hasta que aterrice un primitivo MDX/rich; mantiene el contrato sin romper consumers).
    - `color` → `Input type="color"`.
  - Backwards compat: zero-value (sin `validation`/`widget`) preserva el comportamiento previo (widget inferido por `type`, sin reglas de validación más allá de `required`).

- 88b176c: feat(runtime-react): `<DynamicRelation kind="many_to_many">` — multi-select sobre la tabla destino, sync transparente contra la tabla pivote (`through`).

  API mínima:

  ```tsx
  <DynamicRelation
    kind="many_to_many"
    through="org_members" // tabla pivote
    references="users" // tabla destino sobre la que se hace multi-select
    foreignKey="organization_id" // FK del pivot al padre
    parentId={org.id}
  />
  ```

  - `referencesKey` por default es `${references}_id` (override opcional). Endpoints `/data/${through}` y `/data/${references}` con override por prop si la app expone rutas custom.
  - Lectura: lista pivot rows filtradas por `f_<foreignKey>=eq:<parentId>` (mismo envelope kernel `{success, data, meta}` que `<DynamicTable>`); lista target rows del modelo `references`.
  - Escritura: el `<MultiSelect>` dispara un diff entre la selección previa y la nueva. Cada nuevo target → `POST /data/${through}` con `{[foreignKey]: parentId, [referencesKey]: targetId}`. Cada target removido → `DELETE /data/${through}/<pivotRowId>`.
  - Permisos por prop (`canCreate` controla attach, `canDelete` controla detach — default `true`).
  - Label de cada opción: `displayKey` prop si está; si no se infiere de la metadata (primer column no-id no-hidden); fallback al `id`.
  - Nuevos helpers puros exportados: `buildPivotAttachPayload`, `extractSelectedTargetIds`, `buildPivotRowIndex`, `diffSelection`, `pickOptionLabel`.

  `kind="one_to_many"` no cambia.

- 88b176c: feat(runtime-react): nuevo `<DynamicRelation kind="one_to_many">` — lista inline editable que cuelga del registro padre.

  API mínima:

  ```tsx
  <DynamicRelation
    kind="one_to_many"
    model="line_items"
    foreignKey="invoice_id"
    parentId={id}
  />
  ```

  - Lista filas del modelo hijo filtradas por `f_<foreignKey>=eq:<parentId>` (envelope kernel `{success, data, meta}`).
  - Crear/Editar via `<DynamicForm>` derivado del `TableMetadata.columns` del modelo; la FK queda fija al `parentId` y se oculta automáticamente del form y de la lista.
  - Quitar via `DELETE /data/<model>/<id>` con confirm dialog.
  - Permisos por prop (`canCreate` / `canEdit` / `canDelete` — default `true`) y strings traducibles via prop `strings`.
  - Helpers puros exportados (`buildRelationFilterParams`, `buildCreatePayload`, `deriveRelationFormFields`, `relationRowKey`) para que callers reutilicen las convenciones fuera del componente.
  - `kind="many_to_many"` queda stubbed (renderiza `not-implemented`) — sigue como follow-up; la RFC completa vive en `packages/runtime-react/docs/relations.md`.
  - Ejemplo end-to-end en `examples/dynamic-relation-one-to-many/`.

### Patch Changes

- Updated dependencies [ec9ad56]
  - @asteby/metacore-sdk@2.4.0

## 8.0.0

### Patch Changes

- Updated dependencies [c91d778]
- Updated dependencies [64de425]
  - @asteby/metacore-sdk@2.3.0
  - @asteby/metacore-ui@2.0.0

## 7.1.5

### Patch Changes

- 922d63b: Add `<MetacoreAppShell>` — single-line provider wiring for metacore apps.

  Today every app reproduces the same eight-deep wedding cake of providers (QueryClient + ApiProvider + PWAProvider + Toaster + install/update/offline prompts + metadata cache invalidation). The new shell collapses it into:

  ```tsx
  import { MetacoreAppShell } from "@asteby/metacore-app-providers";

  <MetacoreAppShell api={api} queryClient={queryClient}>
    <RouterProvider router={router} />
  </MetacoreAppShell>;
  ```

  What it bundles:
  - `QueryClientProvider` (when `queryClient` is supplied)
  - `ApiProvider` from `runtime-react`
  - `PWAProvider` + `PWAInstallPrompt` + `PWAUpdatePrompt` + `OfflineIndicator`
  - `Toaster` from `metacore-ui`
  - A `MetadataInvalidator` that clears `useMetadataCache` the moment the PWA layer reports a new service worker — so the next mount of `<DynamicTable>` fetches fresh column / filter / actions definitions instead of replaying yesterday's metadata. Resolves the stale-cache bug where adding `filterable: true` to a column on the backend was invisible until users cleared localStorage.

  Apps that want a subset can pass `hidePWAInstall` / `hidePWAUpdate` / `hideOfflineIndicator` / `hideToaster` / `disableMetadataInvalidate` to opt out per layer.

  `runtime-react` patch: also switches `<DynamicTable>` to stale-while-revalidate metadata fetch (paint with cache, always re-fetch in background) so the shell isn't the only path that picks up backend changes.

- 922d63b: Auto-derive `date_range` filter for `type: 'date'` columns.

  The zero-config filter chip in 7.1.0 picked the right variant for text/number/boolean/select but mapped `type: 'date'` to a generic text filter. `FilterableColumnHeader` already supports `date_range` — pointing the auto-derive at it makes any column flagged `filterable: true` with `type: 'date'` light up the calendar range picker without app-side glue.

## 7.1.4

### Patch Changes

- c985453: Auto-derive `date_range` filter for `type: 'date'` columns.

  The zero-config filter chip in 7.1.0 picked the right variant for text/number/boolean/select but mapped `type: 'date'` to a generic text filter. `FilterableColumnHeader` already supports `date_range` — pointing the auto-derive at it makes any column flagged `filterable: true` with `type: 'date'` light up the calendar range picker without app-side glue.

## 7.1.3

### Patch Changes

- db1a224: Fix raw i18n keys leaking into the auto-generated CRUD actions dropdown.

  The auto-Actions column shipped in 7.1.0 looked up `datatable.view_record`, `datatable.edit` and `datatable.delete` — keys that didn't exist in `@asteby/metacore-i18n/locales`, so i18next fell back to the key string and the dropdown rendered "datatable.view_record" instead of "Ver".

  Two fixes:
  - `@asteby/metacore-i18n`: add `datatable.edit` and `datatable.delete` to the base ES/EN bundles (alongside the pre-existing `datatable.view`).
  - `@asteby/metacore-runtime-react`: lookup `datatable.view` (the real key) and pass `{ defaultValue }` to every action label so a missing bundle never leaks the key into the UI.

## 7.1.2

### Patch Changes

- c00d7f9: Fix DynamicTable horizontal scrollbar appearing mid-card.

  `<Table>` from `@asteby/metacore-ui` ships its own `overflow-x-auto` wrapper sized to content height. Combined with DynamicTable's outer `flex-1 min-h-0 overflow-auto` card, the inner scrollbar drew at the bottom of the rendered rows (mid-card) instead of pinned to the card's bottom edge — wide tables felt visually broken when there were few rows.

  Pass `noWrapper` to opt out of shadcn's inner wrapper. The outer SDK wrapper now owns the scroll; horizontal scrollbar pins to the bottom of the card as expected.

## 7.1.1

### Patch Changes

- 76d4b58: Align SDK dialogs to the kernel's `/dynamic/:model` path namespace.

  `<DynamicRecordDialog>`, `<ExportDialog>` and `<ImportDialog>` were posting to `/data/:model[/...]`, which had no kernel handler — apps that didn't ship their own `handlers/export.go` got 404s the moment a user clicked Export, Import or "Descargar plantilla".

  Switches every hardcoded path from `/data/${model}` to `/dynamic/${model}`. Pairs with `metacore-kernel v0.5.0`, which exposes the canonical `/dynamic/:model/export`, `/dynamic/:model/export/template`, `/dynamic/:model/import`, `/dynamic/:model/import/validate` endpoints — so the SDK toolbar now wires straight to the kernel out of the box, no app glue.

## 7.1.0

### Minor Changes

- 0cd085c: Zero-config CRUD UX from a single column flag.

  Three changes that move polish from each app's metadata into the SDK default behaviour, so a model only needs `enableCRUDActions: true` plus `filterable: true` on the columns it wants searchable to get the same UX link / ops / hub render today:
  1. **Auto-derive filter chip type from column type.** A column flagged `filterable: true` without options or a `searchEndpoint` no longer falls back to "no filter" — it picks the FilterableColumnHeader variant that matches the column type: `text` for text/email/phone/tags, `number_range` for numeric columns, `boolean` for booleans, `select` when options/endpoint are present.
  2. **Auto-render the row Actions column when `enableCRUDActions` is on.** If the host metadata already declares its own `actions[]`, those win. When it doesn't, the SDK falls back to the canonical View / Edit / Delete trio wired to DynamicTable's existing `view` / `edit` / `delete` handlers — no host-side glue.
  3. **`<DynamicCRUDPage>` defaults `hideRefresh` to `true`.** The page-level Refresh button duplicated the one DynamicTable's internal toolbar already ships next to "View"; the page chrome now defers to it. Apps that want both back can pass `hideRefresh={false}`.

## 7.0.0

### Patch Changes

- 3450876: Add `getInitials(name)` helper to `@asteby/metacore-ui/lib`.

  Pulls a duplicated 6-line snippet (`name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()`) out of every avatar across the platform — chat headers, profile dropdowns, dynamic-table avatar cells, sidebar nav. Trims whitespace, caps token count, and falls back to a single character when the input is empty.

  `runtime-react`'s avatar cell renderer now uses it; visually identical, one less inline lambda.

- Updated dependencies [3450876]
  - @asteby/metacore-ui@0.7.0

## 6.4.0

### Minor Changes

- d7f1e55: Per-model extension registry, badge cell normalization, and auto-derived filter chips.
  - `registerModelExtension(model, ext)` lets apps layer per-model UI on top of `<DynamicCRUDPage>` (header KPI strip, custom toolbar buttons, hidden create flow, title overrides) without forking the page or copy-pasting it.
  - `defaultGetDynamicColumns` now accepts `type === 'badge'` (what the kernel emits) in addition to `cellStyle === 'badge'`. Columns marked `type: badge` previously rendered as plain text.
  - `<DynamicTable>` derives a filter chip from every column flagged `filterable: true` plus either static options, a `searchEndpoint`, or boolean type, so apps no longer need to mirror the same options into a separate `filters` array on the metadata. Explicit `metadata.filters` still wins when present.
  - Fixes the default `getDynamicColumns` fallback that previously read `col.name` instead of `col.key`, leaving cells blank for hosts that did not pass a custom factory.

## 6.0.0

### Patch Changes

- Updated dependencies [1c93e68]
  - @asteby/metacore-ui@0.6.0

## 5.0.0

### Patch Changes

- Updated dependencies [317b021]
  - @asteby/metacore-ui@0.5.0

## 4.0.0

### Minor Changes

- e23eede: Publicación inicial a npm del ecosistema metacore.

  Propaga los 13 paquetes del SDK al registry público para que las host applications consumidoras migren de `file:` a semver y Renovate pueda propagar updates.

### Patch Changes

- Updated dependencies [e23eede]
  - @asteby/metacore-sdk@2.2.0
  - @asteby/metacore-ui@0.3.0

## 3.0.0

### Minor Changes

- 6d243b0: Initial release of the metacore frontend ecosystem.

  11 packages extracted from host application frontends into a publishable monorepo with auto-propagation via Changesets + Renovate.

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies [6d243b0]
  - @asteby/metacore-sdk@2.1.0
  - @asteby/metacore-ui@0.2.0

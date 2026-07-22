# @asteby/metacore-runtime-react

## 28.2.0

### Minor Changes

- c9206cf: Nuevo widget de formulario `icon` (IconPickerField): buscador de íconos lucide con grid y preview, más un modo Imagen que delega en UploadField. El valor almacenado sigue siendo un string retrocompatible (nombre lucide o url/path). Las celdas `image` y los thumbnails de opciones ahora reconocen nombres lucide (PascalCase o kebab, ej. "credit-card") y renderizan el glifo en vez de un `<img>` roto.

## 28.1.0

### Minor Changes

- 833cffb: DynamicTable: nuevo prop `pagination?: 'pages' | 'infinite'` con default `'pages'` (paginación clásica). El modo por defecto renderiza el footer `DataTablePagination` (selector de filas por página, "página X de Y", botones primera/anterior/siguiente/última) y cada cambio de página hace un fetch que REEMPLAZA las filas visibles (page/per_page contra el servidor, pageCount derivado de `meta.total`). Cambiar filtros/búsqueda/orden resetea a la página 1, y el tamaño de página elegido se persiste por tabla en localStorage (clave por `model`). El scroll infinito pasa a ser opt-in explícito con `pagination="infinite"`; el prop booleano `infiniteScroll` queda deprecado pero sigue funcionando cuando no se pasa `pagination`, así que los hosts existentes no cambian de comportamiento.

## 28.0.3

### Patch Changes

- 6c99099: DynamicTable: columnas currency con moneda POR FILA — `display_config.currency_field`
  nombra la columna hermana que trae el código ISO del monto de esa fila (tablas
  multi-moneda: un pago en Bs ya no se renderiza como USD de la org). Código no-ISO
  se prefija verbatim en vez de reventar el Intl.NumberFormat.

## 28.0.2

### Patch Changes

- ab08084: DynamicTable: las cards móviles ya no desbordan el viewport cuando una celda contiene badges largos — el valor de cada fila se contiene con `overflow-hidden` y los badges internos pueden envolver a multilínea (`max-w-full` + `whitespace-normal`) en vez de empujar el ancho de toda la página.

## 28.0.1

### Patch Changes

- a723f0f: DynamicTable: los avatares con key anidada (`user.avatar`) ahora aplican el `basePath` declarado en la columna también en la rama del sibling — antes los filenames pelados (`"2.png"`) se devolvían crudos y la imagen nunca cargaba. Contrato unificado y exportado como `resolveAvatarSrc`: URL absoluta y ruta rooted pasan intactas; filename pelado se prefija con `apiBaseUrl + basePath`.

## 28.0.0

### Patch Changes

- Updated dependencies [c676dd0]
  - @asteby/metacore-sdk@3.4.0

## 27.3.3

### Patch Changes

- 31ba021: DynamicTable: clamp genérico de texto largo en celdas (max-width 350px + tooltip con el valor completo) y las cards móviles muestran el label traducido de la columna en vez de la key cruda.

## 27.3.2

### Patch Changes

- c58b455: Empty state del Tablero: el mockup animado ahora reorganiza toda la grilla en
  loop, pasando por cuatro composiciones de dashboard (A→B→C→D→A) — las skeleton
  cards crecen, se achican y se redistribuyen como widgets reales probando
  acomodos mientras carga. ~2s de reposo por layout y ~1.2s de transición fluida
  sincronizada (todas las cards transicionan a la vez, mismo easing).

  Cero solapes garantizado por construcción: la grilla son 3 columnas en orden
  fijo × top/bottom, y cada layout solo cambia anchos de columna y el split
  top/bottom, así que todo par de tiles conserva un eje de separación consistente
  con un `gap` constante — bajo interpolación lineal eso jamás se cruza. Se agrega
  un test que interpola los rects (t=0..1, paso 0.05) en cada transición y asserta
  0 solapes (estático + en tránsito). Se mantiene tokens de tema, skeleton interno
  tipo widget card, `prefers-reduced-motion: reduce` → grilla estática (layout A) y
  `aria-hidden`.

## 27.3.1

### Patch Changes

- ccfb7b0: Empty state del Tablero: el mockup animado ahora es full-bleed, se mueve más y
  va sin texto. Antes se percibía como una ilustración centrada casi estática con
  un caption en inglés. Ahora los tiles skeleton llenan todo el área del
  dashboard en una grilla 4×4 y se reacomodan de forma visible —pares que se
  intercambian de lugar (horizontal, vertical y diagonal) con translate suave,
  escalonados para que siempre haya 2-3 piezas en movimiento— como si el tablero
  se estuviera armando solo. Se eliminó el caption ("Your dashboard is taking
  shape"): la animación habla sola y así no se envía copy sin localizar. Se
  mantiene el loop lento (~13s), tokens de tema y `prefers-reduced-motion: reduce`
  (congela todo). El mock sigue decorativo (`aria-hidden`).

## 27.3.0

### Minor Changes

- 8b46e55: El empty state del Tablero ahora muestra un mockup animado en vez de un ícono
  estático. Cuando no hay widgets (o ninguno visible tras el gating de permisos),
  `DashboardGrid` pinta una silueta del propio dashboard —tiles skeleton (un
  gráfico grande, un par de stat cards, una barra de progreso y una lista)— que
  se desplazan y reacomodan suavemente entre sí, como piezas encajando en su
  lugar. El mensaje pasa de "no hay nada" a "acá va a vivir tu tablero".

  Detalles: animación CSS pura (un loop lento de ~11s, translate+scale sutil, sin
  dependencias nuevas), tokens de tema (`bg-muted`) para light/dark automáticos,
  `prefers-reduced-motion: reduce` congela todo, y el mock es decorativo
  (`aria-hidden`). Se exporta el componente `DashboardEmptyMockup` por si un host
  quiere reutilizarlo. Copy por defecto del empty ajustado al nuevo framing
  (override vía `strings`).

## 27.2.0

### Minor Changes

- 27edd94: Las opciones del picker de referencias SIEMPRE llevan lead visual. El gate
  `optionsHaveVisual` suprimía el avatar de toda la lista cuando ninguna opción
  traía imagen/icono/color — un select de almacenes quedaba como texto pelado
  mientras el de productos (una opción con foto) mostraba avatares. Ahora cada
  opción renderiza su `OptionLead`, que cae a la inicial neutra cuando no hay
  imagen, en el dropdown y en el trigger.

## 27.1.1

### Patch Changes

- 33e0e3b: Avatares de referencia con esquina visible: `rounded-sm` (2px) a 24px se percibe
  como círculo; pasa a `rounded-md` en la inicial (`InitialsAvatar`) y en el thumb
  de imagen (`RelationThumbnail`), para que imagen e inicial lean como cuadrado
  redondeado. `rounded='full'` queda para avatares de persona/marca.
- Updated dependencies [33e0e3b]
  - @asteby/metacore-ui@2.12.1

## 27.1.0

### Minor Changes

- 056e231: La celda de relación en tablas dinámicas queda PLANA: se elimina la cápsula
  redondeada con tinte por label alrededor de [avatar + nombre + subtítulo]. Una
  referencia es dato, no estado — la pastilla hacía que un listado de productos o
  almacenes se lea como una pared de badges. Identifica al registro el thumb
  cuadrado-redondeado (imagen del registro, o inicial neutra como fallback) junto
  a texto plano. Los badges de enum/estado conservan su pastilla de color.

## 27.0.0

### Minor Changes

- 9bd4d4e: Relation avatars render monochrome instead of one color per row.

  `InitialsAvatar` gains a `tone` prop. `auto` (the default, unchanged) keeps the
  per-name palette hash, which is meaningful for a small stable value set such as
  a category or a status. The three relation surfaces — the dynamic-table relation
  cell, the select options and the read-only detail dialog — now pass `neutral`,
  which paints every imageless avatar the same muted surface. For open-ended
  references like products or warehouses the derived color carried no meaning and
  a listing rendered as a rainbow. Records that have an image are unaffected.

### Patch Changes

- Updated dependencies [9bd4d4e]
  - @asteby/metacore-ui@2.12.0

## 26.0.0

### Minor Changes

- ee5f7e8: feat(ui): InitialsAvatar — deterministic initials fallback for imageless references

  New shared `InitialsAvatar` primitive: when a reference/option has no image it now
  shows 1–2 uppercase initials on a background color derived deterministically from
  the name (stable per name via the existing `optionColor` hash → curated palette),
  instead of an empty placeholder box.

  Wired into the three surfaces through ONE component so they never diverge: the
  relation picker (`OptionThumb`/`OptionLead`), the dynamic-table relation cell
  (`RelationCell`), and the read-only detail dialog. Existing image, icon, and color
  rendering is unchanged; the avatar is purely the imageless fallback. Respects the
  existing sizes (24px table, 22px detail, the picker's).

### Patch Changes

- a8f94ba: fix(runtime-react): render `dynamic_select` por `type`, no solo por `ref`/`widget`

  El renderer editable del `DynamicRecordDialog` solo pintaba el picker cuando
  `getFieldRef(field)` o `field.widget === 'dynamic_select'`. Un campo con
  `type: 'dynamic_select'` cuya fuente vive en `optionsConfig.source` (sin `ref`
  FK — p. ej. `currency_code` → `currencies` / `POSOrgCurrency`) degradaba a un
  input de texto libre. Se agrega `field.type === 'dynamic_select'` a la
  condición; `DynamicSelectField` ya resuelve la fuente vía `resolveOptionsSource`
  (ref o `optionsConfig.source`).

- Updated dependencies [ee5f7e8]
  - @asteby/metacore-ui@2.11.0

## 25.2.0

### Minor Changes

- 62f273a: DynamicRelation/DynamicRelations: honor a `readonly` flag on the kernel relation metadata (`RelationMeta.readonly`, camelCase alias `readOnly`). When a relation is read-only the panel forces canCreate/canEdit/canDelete = false regardless of the perms the host passes, hiding the "Agregar" (Plus) button and the per-row edit (Pencil) / delete (Trash2) controls. Backwards compatible: when the flag is absent/false the panel keeps deriving its controls from the host props.

### Patch Changes

- 62f273a: normalize-submit: prefer the explicit `nullable` field flag served by the kernel (v0.77.1+) when deciding to null an empty reference, falling back to the type-based heuristic for older hosts that don't serve the flag.

## 25.1.5

### Patch Changes

- 6f20bf5: normalize-submit: prefer the explicit `nullable` field flag served by the kernel (v0.77.1+) when deciding to null an empty reference, falling back to the type-based heuristic for older hosts that don't serve the flag.

## 25.1.4

### Patch Changes

- bdbc542: Per-field validation error rendering + Spanish localization. On a 422 with a
  `{ errors: { <field>: [{ code, params }] } }` map, create/edit dialogs and action
  modals now show each field's first error inline (in red under the input) plus a
  summary toast, instead of one flattened toast. Errors localize to Spanish from
  locale-agnostic codes (`required`, `invalid_option`, `not_found`, `duplicate`,
  `invalid_type`, generic fallback) using the field label via i18next `{{label}}`
  interpolation, so hosts can override the copy under `validation.<code>`.
  Pre-localized string entries pass through verbatim. Adds exported helpers
  `extractFieldErrors` and `localizeFieldIssue` (with the `FieldIssue` type) in
  `server-error`. The client-side required check now marks all missing fields
  inline rather than toasting only the first.

## 25.1.3

### Patch Changes

- 2f117ad: Fix FK violation (SQLSTATE 23503) when creating/updating a record with an empty optional relation. DynamicRecordDialog now normalizes the submit payload so empty reference pickers (and any nil-UUID value) are sent as `null` instead of `""`/"00000000-…", which a nullable FK column (e.g. products.category_id) would otherwise reject. Generic across all addons — keyed off field metadata (ref / dynamic_select / search). Exposed as `normalizeRefFieldsForSubmit`.
- 579ab21: DynamicRecordDialog now surfaces the server's real error cause (`details`) in the create/update/delete error toast via `toastServerError`, instead of showing only the generic headline ("Error creating record"). This is the modal the generic model CRUD page uses, so a failed create now shows the underlying Postgres/validation reason as the toast description.

## 25.1.2

### Patch Changes

- 7c19de1: fix(table): stop infinite reload loop when applying a column filter

  The URL-resync effect read the location's search string from a render-time
  snapshot, which lagged one commit behind the sibling write effect's imperative
  `history.replaceState` (that write does not re-render). Applying any column
  filter (e.g. the "Almacén" facet on /m/stock) made the resync misread its own
  write as an external change, reset the filters, and ping-pong `{k:[v]} <-> {}`
  every render — spinning the infinite-scroll fetch forever. The resync now reads
  `window.location.search` fresh inside the effect, so a self-write is recognized
  and skipped; only genuine external rewrites (sidebar deep-links, back/forward)
  are adopted. Also lifts the pagination reset out of the `setDynamicFilters`
  updater.

## 25.1.1

### Patch Changes

- dea9d02: fix(table): las listas en infinite-scroll recargan al bumpear refreshTrigger

  El efecto de recarga de la tabla en modo infinite-scroll omitía `refreshTrigger` de sus deps (aunque el comentario decía que lo respetaba), así que tras crear/editar/eliminar en la página la lista infinita no se recargaba ("a veces no recarga la tabla"). Se añade `refreshTrigger` a las deps para igualar el path clásico.

## 25.1.0

### Minor Changes

- a7da67d: feat(errors): los toasts de mutación/acción muestran la causa real del servidor

  Nuevo helper compartido `toastServerError` / `extractServerError` (`server-error.ts`): en vez de tragarse el `details` y mostrar solo el `message` genérico ("Error creating record"), el toast muestra el `message` como título y el `details`/`errors` de validación como descripción. Cableado en `action-modal-dispatcher` (create/edit/acciones declarativas). Cualquier consumidor puede reusarlo. Así un 500 del kernel (p. ej. un error de Postgres o un guard declarativo) llega legible al usuario/operador.

## 25.0.0

### Minor Changes

- 711bdfc: Nuevo flag declarativo `lock_rows` en campos de line-items (`type: "array"`): cuando está activo, el renderer fija las filas — oculta el botón "Agregar renglón" y los botones de borrar por fila, dejando solo editables las celdas de las filas ya presentes. Primitivo genérico del framework (se lee snake_case `lock_rows` con alias camelCase `lockRows`).

### Patch Changes

- Updated dependencies [711bdfc]
  - @asteby/metacore-sdk@3.3.0

## 24.0.2

### Patch Changes

- a27d1a2: feat(relations): secondary identifier (SKU/email) under a reference chip

  Reference chips (resolved FK cells, endpoint-option badges, jsonb line-item refs,
  confirm-modal items) now render a muted secondary line under the label — a
  product's SKU, a user's email — so a resolved record reads "Name / SKU" instead
  of a bare name. Declarative: the SDK reads the backend-projected `subtitle` /
  `description` on the option or resolved sibling (never a hardcoded column). Absent
  → single-line as before. The select picker already surfaced `description`; this
  brings the resolved-chip surfaces in line.

## 24.0.1

### Patch Changes

- 4a62c3c: Preview automático del registro en el modal de confirmación de acciones de fila.

  Al confirmar una row-action con `confirm` (p. ej. aceptar/rechazar un traspaso), el
  `ConfirmActionDialog` ahora muestra un resumen compacto y de solo lectura del registro
  que va a afectar, para no confirmar a ciegas. Es 100% del SDK y genérico: se apoya en la
  metadata de tabla del modelo (labels + display hints, leída del cache o con un único fetch
  a `/metadata/table/<model>`) y en los siblings de relación que la tabla ya resolvió sobre
  la fila. La heurística surface relaciones resueltas a su label, campos line-items (jsonb,
  como `Transfer.items`, renderizados producto × cantidad) y un puñado de escalares de
  identidad; omite `id`, `organization_id`, timestamps y los `*_id` crudos sin label. Se
  degrada solo: si no hay nada útil que mostrar, no renderiza la sección.

## 24.0.0

### Patch Changes

- 165f25c: feat(dynamic-table): cache first-page rows for instant reload paint

  The table fetched rows into local state, so a full reload showed a full-table
  skeleton until `/data/:model` resolved — even for the view just seen. Stash the
  last first-page result in sessionStorage (org/user-scoped → must not outlive the
  tab session) keyed by model+endpoint+branch+URL params, and seed the initial
  rows from it so a reload paints instantly and revalidates in the background
  (stale-while-revalidate).

- Updated dependencies [0704d54]
  - @asteby/metacore-ui@2.10.0

## 23.12.3

### Patch Changes

- 5e46e61: fix(dynamic-table): don't strip a deep-linked filter on first mount (URL race)

  The URL-write effect ran on the very first commit — when `initializedFromUrl`
  (a ref) is already true but the init effect's `setDynamicFilters` hasn't
  re-rendered yet — so it wrote a URL WITHOUT `f_status`, stripping a
  deep-linked/reloaded filter and flickering the address bar until it settled
  without the filter. Gate the write on a STATE flag (`urlSynced`) set once the
  URL has been adopted, so the first write only happens on the render where
  `dynamicFilters`/`pagination` already mirror the URL (a true no-op).

## 23.12.2

### Patch Changes

- 5333315: fix(dynamic-table): don't rewrite a clean filtered deep-link (no URL flicker)

  Normalise the `eq:` operator when fingerprinting the query string and stop
  stamping `per_page` for the plain server default, so opening/clicking a
  sidebar deep-link (`f_status=eq:in_progress&view=list`) is a true no-op: the
  table adopts the filter without rewriting the URL to its own spelling
  (`f_status=in_progress&per_page=15`). This removes the visible URL flicker and
  keeps the sidebar active-state exact-href match working.

## 23.12.1

### Patch Changes

- 8788161: fix(dynamic-table): stop infinite URL replaceState loop on filtered deep-links

  The host router re-serializes the query string in its own canonical form
  (different key order, percent-encoded operator colons) than the table writes,
  so the raw-string comparison never matched and the table's write effect fought
  the router's re-serialize forever ("Throttling navigation…" + React #185),
  hanging any filtered sidebar view (e.g. `f_status=eq:reception`). Both URL-sync
  effects now compare an order/encoding-independent fingerprint and the write is
  skipped when semantically a no-op.

## 23.12.0

### Minor Changes

- 9376722: Add `useAddonSettings` / `useUpdateAddonSettings` — the standard primitive for reading an addon's per-organization configuration from a federated addon, backed by react-query and the host-injected api client. Merges caller-provided defaults (mirroring the manifest's `settings[].default`) under the saved org values, so a never-saved setting falls back to its default. Also exports the pure `mergeAddonSettings` helper and the stable `addonSettingsKey` query key.

## 23.11.2

### Patch Changes

- 990bb63: DynamicForm oculta los campos readonly (estado de conexión, valores escritos por sync): el servidor los posee, el form no los captura ni los envía en el submit.

## 23.11.1

### Patch Changes

- 6e3cf4f: DynamicTable: el sentinel de infinite scroll se detiene cuando el backend devuelve una página corta/vacía, aunque meta.total reporte más filas de las que la lista entrega (drift count vs list). Elimina el skeleton accent parpadeando bajo las filas.

## 23.11.0

### Minor Changes

- 023dc28: feat(license-gate): gateo por rol del formulario de activación.

  `<LicenseGate>` acepta dos props nuevas (backward-compatible):
  - `canActivate?: boolean` (default `true`): cuando es `false`, el modal bloqueante se muestra SIN el formulario de activación.
  - `readOnlyMessage?: string`: mensaje mostrado en ese caso (default: "Contacta al administrador de la plataforma para activar la licencia.").

  Aplica a todas las variantes del modal (missing/invalid/expired, incluido el copy de trial vencido). Permite que solo el Platform Root/superadmin active la licencia mientras el resto de usuarios ve el bloqueo con la indicación de a quién contactar.

## 23.10.0

### Minor Changes

- c94ec63: feat(license-gate): gate de licencia reutilizable — el negocio blindado en el SDK.

  Nuevo primitivo `<LicenseGate>` (más `<LicenseExpiryBanner>`, `<LicenseStatusBadge>` y los helpers `isLicenseOperable`/`isLicenseBlocking`/`isPresetEntitled`/`isTrialExpired`) que ops y todos los verticales montan en una línea para blindar la app tras la licencia de instancia:
  - Sin enforcement o estado operable (`valid`/`stale`/`grace`) → renderiza children; `stale`/`grace` montan un banner degradado (`expired` no descartable, el resto descartable con TTL en localStorage).
  - Enforcement && `missing`/`invalid`/`expired` → modal bloqueante full-screen no descartable con formulario de activación (clave `lic_…` o token pegado); `plan === 'trial'` + `expired` muestra "Tu prueba gratuita terminó". La activación exitosa desbloquea sin recargar.
  - Branding-aware (logo/nombre) con fallback neutro; i18n es-first con `t(key, { defaultValue })`.

  Independiente del kernel: el host resuelve el `LicenseState` con su propio transporte y pasa `onActivate`. No requiere release del kernel.

## 23.9.3

### Patch Changes

- e67e403: fix(kanban): las etiquetas de lane dejan de mostrar la clave i18n cruda cuando el bundle del addon llega tarde. Un hook (useI18nResourceVersion) re-resuelve las etiquetas al mergearse el bundle async (addResourceBundle), sin depender del bindI18nStore del host.

## 23.9.2

### Patch Changes

- 38856fc: fix(data-table/kanban): filtros con un solo indicador y scroll infinito sin atascos
  - La tabla ya no renderiza la fila de chips de filtros activos: el indicador del header de columna es la única señal (los chips seguían duplicando la info).
  - La tabla re-sincroniza sus filtros cuando el router del host reescribe la query string sin remontar (p. ej. entradas hermanas del sidebar que deep-linkean distintos `f_` sobre la misma ruta); antes quedaba mostrando el filtro anterior.
  - El sentinel de scroll infinito encadena la siguiente página cuando una carga termina y el sentinel sigue visible (pantallas pequeñas / páginas cortas); antes se atascaba hasta que el usuario movía el scroll.

## 23.9.1

### Patch Changes

- 3db80ab: fix(data-table/kanban): indicadores de filtro sin duplicados y tarjetas kanban con relaciones resueltas
  - El botón "Limpiar filtros" del toolbar ya no muestra badge de conteo y solo aparece para el estado propio de la tabla (column filters / búsqueda); los filtros dinámicos ya tienen su fila de chips con "Limpiar todo".
  - El icono de filtro del header de columna ya no superpone un badge de conteo: el icono en color primary es el único indicador activo.
  - `f_<col>=eq:<valor>` en la URL se desenvuelve al valor plano, por lo que el chip muestra la etiqueta de la opción ("Estado: Recepción") en vez de `eq:reception`.
  - Las tarjetas del kanban resuelven columnas FK (`<rel>_id`) al objeto hermano resuelto por el backend (nombre/label) en vez del UUID crudo, y un FK UUID-cero se muestra como vacío (—).

- Updated dependencies [3db80ab]
  - @asteby/metacore-ui@2.9.2

## 23.9.0

### Minor Changes

- 0c41860: DynamicKanban: per-lane configuration gear (⚙). Every board lane — declared
  stages (Backlog, Done…) included, not just custom ones — now carries a subtle
  gear next to the search/filter/⚡ header icons that opens a "Configurar etapa"
  dialog to rename the lane, recolor it, and attach extra CONDITIONS (a
  field/operator/value builder reusing the same eq/neq/contains/in component as
  custom stages).
  - Declared lanes persist through a new `/stage-overrides` endpoint
    (`useStageOverrides`), with a "Restablecer etapa" action that drops the
    override; custom real stages persist through their existing `/custom-stages`
    CRUD (which now also accepts `filters`). The gear unifies both behind one UI.
  - A lane that carries conditions queries its data — and counts its header —
    with the stage scope PLUS those conditions (serialized like smart-lane
    filters), and shows a filter indicator + tooltip listing them. Cards can still
    be dragged into the lane (the drop only sets the stage value).
  - The dialog pre-populates the whole form from the lane's live metadata (label,
    color and every condition, editable) and opens with a "Condiciones actuales"
    chip row summarizing the effective query: a locked base "Etapa = <label>" chip,
    an "Etapa final" chip (with tooltip) for terminal stages, and one
    editable/removable chip per extra condition. An overridden lane shows a
    "Personalizada" badge and a two-step "Restablecer al original" that spells out
    exactly what reverts (from `metadata.stages[].original` when the host serves it).
  - Non-intrusive: when `/stage-overrides` is absent the gear simply doesn't
    render on declared lanes. All copy goes through `t('dynamic.stage_config.*')`
    with Spanish defaults.

  New exports: `useStageOverrides`, `StageConfigDialog`, `StageConditionBuilder`,
  `cardMatchesStageFilters`, and their types. `StageMeta` gains optional
  `overridden` and `filters`.

## 23.8.0

### Minor Changes

- a3d3fdf: DynamicKanban: reordenar las columnas del tablero arrastrándolas por su encabezado (estilo Trello/Bitrix). Aplica a todas las lanes —etapas declaradas, etapas custom y smart lanes— con reorden optimista y persistencia por organización vía el endpoint `/stage-layout` del host (`GET`/`PUT` orden completo/`DELETE` restablece). Si el host no expone el endpoint, el drag de columnas queda deshabilitado en silencio y el tablero funciona igual. Se agrega el hook `useStageLayout` y un affordance "Restablecer orden" cuando existe un orden custom.

## 23.7.1

### Patch Changes

- a3538da: fix(runtime-react): translate addon action labels at render (toolbar + modal)

  `ModelActionToolbar` and `ActionModalDispatcher` rendered an action's `label`
  (and each field's `label`) verbatim. For an addon's custom action these are i18n
  keys (e.g. `integration_github.action.create_issue.label`) whose locale bundle
  loads asynchronously, so the create button, the modal title/submit, and the
  field labels showed the raw key — and never re-derived once the bundle landed.
  They now translate at render with `t(label, { defaultValue: label })`, so the
  label resolves the moment the addon i18n arrives (via the i18next store `added`
  event) and an already-localized string passes through unchanged.

## 23.7.0

### Minor Changes

- 7611284: DynamicKanban: etapas personalizadas estilo Bitrix. Columna fantasma "+ Agregar etapa", diálogo de nombre/color/tipo y constructor de condiciones para etapas inteligentes (lanes virtuales por filtros, solo lectura), menú Editar/Eliminar en lanes custom, e integración con las automatizaciones de etapa. No intrusivo: sin el endpoint `/custom-stages` la UI no se renderiza y el tablero queda intacto.

  Alineado al contrato del backend (ops #704): las lanes se pintan desde la metadata (`stages[]` con `custom: true` y `smart_lanes[]`), con el CRUD `/custom-stages` como fuente del diálogo de gestión. Los filtros de las etapas inteligentes se serializan como `f_<field>=OP:valor` (`EQ`, `NEQ`, `HAS` para membresía en arrays jsonb, `IN` para listas). En edición, `model`/`type`/`key` son inmutables. El borrado de una etapa real con tarjetas responde 409 con `meta.cards`; el diálogo muestra el conteo y ofrece reasignar las tarjetas a otra columna vía `?reassign_to=<key>`.

- 20cb58f: Pule el layout de los modales de create/acción: grid responsivo de dos columnas compartido (`FieldGrid`/`FieldCell`/`FieldLabel`) para el modal de `placement:create` (p. ej. "Crear Issue" del addon github) y el create/edit automático (CRUD). Los campos escalares fluyen en dos columnas (una sola en móvil), textareas/line-items ocupan el ancho completo, y cada celda lleva `min-w-0` para que un valor largo de select/input no reviente las columnas ni genere scroll horizontal. Ancho del dialog de acción a `sm:max-w-xl`, labels con estilo consistente y asterisco de requerido unificado.

## 23.6.0

### Minor Changes

- 88214d1: DynamicKanban: automatizaciones de etapa (estilo Bitrix). Cada lane suma un botón ⚡ que abre un diálogo para configurar reglas "al entrar a esta etapa → agregar tag / quitar tag / setear campo = valor", genéricas para cualquier modelo. Las reglas viven en el backend vía el cliente HTTP existente (`/stage-automations`), con toggle de activación, eliminación e indicador de conteo activo en el header del lane. La feature es no-intrusiva: si el endpoint no existe (404/error) el afford ⚡ simplemente no se muestra y el tablero sigue funcionando. Todo el texto pasa por `t('dynamic.automations.*')` con `defaultValue` en español.

## 23.5.1

### Patch Changes

- 36e7cb8: DynamicKanban: las lanes ahora aprovechan el ancho del viewport. Crecen (flex-1) para llenar el contenedor cuando todas caben, con un ancho mínimo legible (280px) y un máximo razonable (420px); el scroll horizontal solo aparece cuando ya no caben. Elimina el espacio muerto a la derecha y las columnas angostas al reducir la ventana.

## 23.5.0

### Minor Changes

- beb7af1: DynamicKanban: los contadores de cada columna muestran el total real de la etapa desde el primer render, sin necesidad de scrollear. Tras la carga inicial del tablero se dispara en paralelo una consulta liviana (`per_page=1`) por etapa, respetando la búsqueda y los filtros activos, para leer su total. El header ahora se lee `N` cuando ya están cargadas todas las tarjetas (antes `N/N`) y `N/M` cuando la etapa está parcialmente cargada. Los totales se refrescan al cambiar filtros/búsqueda y mantienen el ajuste optimista tras arrastrar una tarjeta.

## 23.4.0

### Minor Changes

- edfa5a9: Render "pro" de URLs, imágenes y archivos: una URL nunca se muestra cruda. Nuevas primitivas compartidas en `rich-url.tsx` (`MediaValue`, `UrlChip`, `FileChip`, `ImageThumbnail`, `RichText`, `linkifyText`, `classifyUrl`, …) que consumen por igual la CELDA de la tabla/kanban (`dynamic-columns.tsx`) y el DETAIL DIALOG (`dynamic-record.tsx`) — cero copy-paste.
  - URL de página (ej. `github_url` con la issue completa) → chip compacto con icono `ExternalLink` + label corto (hostname, ej. "github.com", o el nombre de archivo si aplica); URL completa en el tooltip; abre en pestaña nueva. Ya no se ve la URL de 120 caracteres.
  - URL de imagen (jpg/png/gif/webp/avif/svg y rutas `…/storage/media/…` sin extensión) → THUMBNAIL inline redondeado y clickeable que abre la imagen completa; `onError` degrada a link chip (nunca un icono de imagen rota). En la celda el thumbnail es chico (~h-8) para no romper la altura de fila; en el dialog es más grande.
  - URL de archivo (pdf/zip/docx/mp4/…) → chip con icono `FileText` + nombre del archivo.
  - URLs embebidas en texto largo (body, textarea, long-text) → se linkifican con el mismo estilo (bare o markdown `[label](url)`), recortando puntuación final y respetando paréntesis balanceados; imágenes y archivos embebidos también se renderizan inline.

  Sin llamadas de red para renderizar (nada de servicio de favicons — CSP/privacidad): el icono es un glyph lucide local.

## 23.3.0

### Minor Changes

- 40a1e8e: Soporte de campos `readonly` (kernel v0.64.0) en el diálogo de registro dinámico. Un campo generado por el servidor/sistema (p. ej. `number`/`github_url` que el addon de GitHub rellena tras el create outbound) ahora se OCULTA en el formulario de creación y se muestra DESHABILITADO (input muted, valor visible) en edición. Las vistas de lectura (tabla/kanban/detalle) no cambian.
- d0eb423: El modal de detalle de registro (`ViewRecordDialog` / `DynamicRecordDialog`) ahora renderiza los valores con los MISMOS display types "pro" que la tabla, en vez de texto plano genérico. Las primitivas de render de la tabla (`OptionBadge`, `RelationThumbnail`, `statusColorFor`, `useIsDarkTheme`) se extrajeron a un módulo compartido `display-value.tsx` que tabla y dialog consumen (cero copy-paste).

  El dialog ahora resuelve cada valor por el display type declarado (`cellStyle ?? type`), igual que la tabla:
  - opciones/select → Badge con color resuelto y label localizado
  - `cellStyle:'status'`/`'badge'` (ej. stage de kanban) → pill con color semántico y label traducido vía i18n del manifest, en vez de "backlog" crudo
  - `cellStyle:'url'`/`'link'` en columna de texto (ej. `github_url`) → enlace clickeable en pestaña nueva, truncado
  - `cellStyle:'datetime'` en columna numérica/epoch (ej. `synced_at`) → fecha formateada con timezone de la org, no dígitos crudos
  - arrays de labels/tags → fila de badges (con color cuando el label trae `color`)
  - creator/avatar → nombre + avatar

## 23.2.1

### Patch Changes

- d578fe0: Localiza los toasts de CRUD estándar (eliminar, crear, actualizar, borrado masivo, subida de imagen) al español vía i18n con `defaultValue`, en lugar de mostrar el `message` en inglés que devuelve el backend. Los mensajes de acciones declarativas de addons ahora pasan por `t()` por si son claves i18n.

## 23.2.0

### Minor Changes

- 68a6844: Scroll infinito con carga incremental en DynamicKanban y DynamicTable,
  respetando la búsqueda y los filtros activos. Cero cambios de backend: se apoya
  en el `page`/`per_page` que ya expone `/data/:model`.
  - **Primitivos compartidos (`use-infinite-scroll`):** `dedupeById` (append puro
    que descarta ids ya presentes, estable en identidad cuando no hay altas) y
    `useInfiniteScrollSentinel` (IntersectionObserver sobre un sentinel; lee
    `onLoadMore`/`disabled` por ref para no recrear el observer en cada render;
    degrada a no-op donde no hay IntersectionObserver). Los usan ambas vistas.
  - **Kanban incremental por lane:** una página global inicial (`pageSize`, 50 por
    defecto) pinta el tablero agrupado —y captura naturalmente la lane
    "sin asignar"— y luego cada lane rellena SU propia etapa al acercarse el
    scroll al fondo (`f_<group_by>=<stage>&page=n&per_page=lanePageSize`, 25 por
    defecto, sobre los filtros activos), con dedup por id y un skeleton chico al
    fondo. El contador del header muestra el total real de la etapa cuando la
    respuesta trae `meta.total` (`count/total`), si no el cargado. Cambiar
    filtros/búsqueda resetea la paginación de todas las lanes. El drag&drop
    optimista ajusta los totales de origen y destino (`applyLaneTotalsOnMove`)
    para que las lanes parciales sigan mostrando un `count/total` veraz, y los
    revierte si el PUT falla.
  - **Tabla opt-in (`infiniteScroll?: boolean`, default `false`):** la paginación
    clásica queda intacta salvo que se active. Con el flag, un sentinel al fondo
    del contenedor de scroll pide la siguiente página y APPENDEA filas (dedup por
    id); el pager clásico se reemplaza por un indicador "N de total". Cambiar
    filtros/orden/búsqueda resetea a la página 1 y limpia el acumulado. El footer
    de totales (`/aggregate`) no cambia.

### Patch Changes

- Updated dependencies [68a6844]
  - @asteby/metacore-ui@2.9.1

## 23.1.0

### Minor Changes

- 08e18bf: Paridad de la experiencia pro de filtros en DynamicTable (vista tabla de los
  módulos dinámicos), igualando al kanban.
  - **Prefetch de facetas en la tabla:** al resolver la metadata se precargan en
    paralelo (dedup por firma, `allSettled`) las facetas de todos los campos facet,
    sembrando sus `options`. Abrir el filtro de una columna de texto en el header
    ya muestra el combobox con valores + counts al instante, sin "Cargando…"; el
    spinner queda solo para el refetch con búsqueda.
  - **i18n de opciones en la tabla:** las opciones (stages y cualquier key i18n del
    manifest) se traducen con `t(label, {defaultValue})` en runtime-react antes de
    pasarlas al ui package, tanto en los filtros de header como en los chips y
    resúmenes de valor.
  - **Fila de chips de filtros activos sobre la tabla:** debajo de la toolbar,
    removibles ("Campo: valor(es) ×" + "Limpiar todo"), con el color del valor
    cuando aplica (p.ej. la etapa). Extraído a un componente compartido
    `FilterChipsRow` (con `summarizeFilterValues`/`chipValueColor`/
    `translateOptionLabels`) reusado por el kanban y la tabla — sin duplicar.
  - **Stage-select en la tabla:** la columna `group_by`/stage sin opciones propias
    ofrece el select con las etapas del pipeline (traducidas, con color), no un
    cuadro de texto — sale del motor compartido; confirmado con test.
  - **Header de lane del kanban:** los botones de búsqueda y embudo se ven SIEMPRE
    (se quitó el hover-reveal, que nadie descubría) en muted con hover a foreground.
    El embudo muestra un badge numérico con la cantidad de valores/filtros
    aplicados en esa lane (como el badge del botón Filtros de la toolbar); la lupa
    tiñe a primary + dot cuando hay búsqueda activa.

## 23.0.0

### Patch Changes

- 25a78e7: Fixes del embudo por columna del kanban (LaneFilterButton).
  - **Precarga de opciones dinámicas:** el value-picker del embudo ahora usa el
    MISMO combobox pro que el Sheet — si el campo elegido tiene options estáticas
    o `loadOptions` (facet), renderiza el combobox multi-select con carga lazy
    (counts, buscador "Buscar valores...", estados de carga). Antes un campo facet
    (p.ej. "Repo") caía al input crudo "Valor..." porque sus options aún no
    estaban cargadas. Solo cae a input de texto cuando el campo es texto libre sin
    facets. Nuevo componente compartible `FilterValueCombobox` en
    `@asteby/metacore-ui`. El filtrado del lane sigue client-side: igualdad/IN
    para valores de select/facet, substring para texto libre.
  - **Traducción de opciones:** las opciones de Stage (y cualquier option con key
    i18n del manifest) se traducen con `t(label, {defaultValue})` en runtime-react
    ANTES de pasarlas al control (ColumnFilterControl vive en ui, sin i18n). Aplica
    al embudo, al Sheet, a los chips y a los resúmenes de valor; el valor activo de
    stage se muestra traducido y con su color.
  - **Diseño del popover del embudo:** select de campo y control de valor a ancho
    completo, popover más ancho (`w-72`), combobox con borde redondeado, botones
    Limpiar/Aplicar full-width en fila — al nivel del resto del rediseño.
  - **Prefetch de facetas:** al resolver la metadata se precargan en paralelo las
    facetas de TODOS los campos facet (un `api.get` por campo, dedupeado por firma,
    `allSettled` para que un campo con error no rompa el resto), sembrando el cache
    del loader y poblando las `options` del `ColumnFilterConfig`. Así el popover
    del Sheet y el value-picker del lane abren instantáneos con valores + counts,
    sin "Cargando…"; el spinner queda solo para el refetch con búsqueda (`q`).
    `useFacetLoaders` ahora expone `prefetchFacets` y `facetOptions`.

- Updated dependencies [25a78e7]
  - @asteby/metacore-ui@2.9.0

## 22.0.0

### Minor Changes

- bd30e57: Filtros pro para tabla y kanban dinámicos.
  - **Etapa como select (kanban/tabla):** una columna `group_by` sin opciones
    propias hereda las etapas del pipeline (`metadata.stages`, con su color) como
    un select real en lugar de caer a un cuadro de texto "Contiene...".
  - **Filtros por facetas:** las columnas de texto filtrables se convierten en un
    selector de valores (`filterType: 'facet'`) que carga de forma perezosa los
    valores distintos + su conteo desde `GET /data/:model/facets` al abrir el
    popover, con búsqueda server-side. Degrada con gracia al input "Contiene..."
    (ILIKE) si el endpoint falla, devuelve vacío o no está disponible, y mantiene
    ese affordance de texto libre incluso cuando hay opciones. Las columnas de
    texto largo (`body`/`description`, `cellStyle: truncate-text`, tipos
    json/long_text) se quedan como texto plano. Nuevo `ColumnFilterControl`
    `loadOptions` y `FilterOption.count` en `@asteby/metacore-ui`; hook compartido
    `useFacetLoaders` y `filterType: 'facet'` en `@asteby/metacore-runtime-react`.
  - **Búsqueda por columna del kanban:** cada lane tiene un icono de búsqueda que
    expande un input inline (autofocus, colapsa con Escape) filtrando client-side
    las tarjetas de esa columna por título y valores de campo visibles. Convive y
    se combina (AND) con el embudo por campo, que ahora ofrece un select de
    valores cuando el campo tiene opciones conocidas.
  - **Panel de filtros rediseñado (nivel Linear/Notion):** el Sheet deja de ser
    una lista de botones grises idénticos: cada campo es una fila tipo settings
    con icono por tipo de dato (Hash número, Calendar fecha, CircleDot etapa, Tag
    select/facet, ToggleLeft boolean, Type texto), label y resumen del valor
    activo a la derecha ("Cualquiera" en muted si no hay). Nueva variante
    `ColumnFilterControl` `variant='row'` con props `icon` y `valueSummary`.
    Popovers con `rounded-xl`, sombra, header del campo (el input "Contiene..."
    nunca es contenido crudo sin jerarquía), opciones con checkbox + dot de color
    - count a la derecha. Filtros con selección agrupados arriba, resto
      alfabético, footer sticky con conteo. Fila de chips activos removibles bajo la
      toolbar (con dot de color del valor, p.ej. color de la etapa) y "Limpiar
      todo". Header de lane del kanban con acciones (buscar/embudo) en hover-reveal
      para un board limpio. Pensado dark-mode-first (muted/accent del theme).

  La URL del endpoint de facetas se deriva como el endpoint de agregados de
  DynamicTable: `<endpoint>/facets` (o `/data/<model>/facets` como fallback), así
  funciona tanto con `endpoint="/data/:model/me"` como sin él.

### Patch Changes

- Updated dependencies [bd30e57]
  - @asteby/metacore-ui@2.8.0

## 21.1.0

### Minor Changes

- 2f21e1e: feat(kanban): agrupar filtros globales en un sheet lateral + filtro por columna
  - **Filtros globales** dejan de spillear como chips inline: ahora un botón "Filtros"
    (con contador de activos) abre un **sheet lateral** con todos los controles apilados
    (mismo motor server-side `useDynamicFilters`). La búsqueda global queda inline.
  - **Filtro por lane (stage):** cada columna tiene un icono de embudo → elige un campo
    - un valor y **filtra solo las cards de ese stage** (client-side, instantáneo, sin
      refetch). Un indicador bajo el header muestra el filtro activo (campo: valor) con
      un botón para limpiarlo; el header muestra `filtradas/total`.

## 21.0.0

### Minor Changes

- 84aeaf2: feat(kanban): dynamic column filters on DynamicKanban

  The board now filters like its DynamicTable sibling. A filter bar above the
  lanes exposes a global search box plus one chip per filterable field (from
  `metadata.filters[]` and every `filterable` column), driving the SAME
  server-side `f_<key>=<op>:<value>` / `search` params — so a model's table and
  kanban views filter identically.
  - **ui**: extracted the per-column filter popover into a new, TanStack-agnostic
    `ColumnFilterControl` (select/boolean/dynamic_select/text/number_range/
    date_range). `FilterableColumnHeader` now delegates its filter UI to it
    (behavior unchanged); it also powers the kanban's labeled filter chips.
  - **runtime-react**: new `useDynamicFilters(metadata)` hook owning the filter
    state, option prefetch, config derivation and param serialization (factored
    out of DynamicTable's inline logic). `DynamicKanban` consumes it and gains a
    `defaultFilters` prop for parity with DynamicTable.

### Patch Changes

- Updated dependencies [84aeaf2]
  - @asteby/metacore-ui@2.7.0

## 20.1.7

### Patch Changes

- 649de1b: fix(kanban): card "…" actions (Ver / Editar / Eliminar / custom) now work and are permission-gated

  The per-card kebab menu on the kanban board forwarded the raw action object to a
  no-op, so clicking Ver/Editar/Eliminar did nothing, and the menu was not filtered
  by permission. The dispatch logic was extracted from `DynamicTable` into a shared
  `useDynamicRowActions` hook (delete-confirm dialog, view/edit → host `onAction`
  string contract or the built-in record dialog, link → navigate, custom →
  ActionModal) that both renderers now use, so a kanban card behaves identically to a
  table row. The card actions are resolved through the new `resolveRowActions` helper
  — the same capability gate (`useCan`/`gateTableMetadata`) and implicit View/Edit/
  Delete trio materialization the table's action column uses — so an action the user
  lacks permission for no longer appears. `DynamicKanban` gains an optional
  `onAction(action: string, row)` prop mirroring `DynamicTable`.

## 20.1.6

### Patch Changes

- 0ff3d4e: fix(kanban): fixed-width lanes (horizontal scroll, no squish) + drag preview matches card

  Lanes were `flex-1 min-w-[220px] max-w-[320px]`, so with many stages they compressed
  to a cramped width. They're now a fixed `w-[300px] shrink-0` so columns keep a
  comfortable width and the board scrolls horizontally instead of squishing. The drag
  overlay was a fixed `w-72` that no longer matched the in-lane card; it's now
  `w-[284px]` (lane width minus the column padding) so a dragged card is the same size
  as it sits in the column.

## 20.1.5

### Patch Changes

- 5b7fd84: fix(kanban): constrain cards to the lane width so they stop spilling out of the stage

  The lane used a Radix ScrollArea whose viewport wraps content in a `display:table`
  element that shrink-to-fits the widest card. Once card text wrapped freely (no
  line-clamp) the cards grew to their natural content width and overflowed the
  column. Replaced the ScrollArea with a plain `overflow-y-auto` block and gave the
  card `w-full min-w-0`, so every card fits the lane and its text wraps inside it.

## 20.1.4

### Patch Changes

- 9e50db5: fix(kanban): cards stretch to fit their content instead of clamping

  The card title and field values were `line-clamp-2` (cut to two lines + ellipsis).
  Per product feedback the cards should grow DOWNWARD to show their full content and
  never cut text. Removed the clamps so title and fields wrap fully (`break-words`
  keeps long tokens from overflowing horizontally) and the card grows as tall as it
  needs; the column's ScrollArea already scrolls when a lane gets long.

## 20.1.3

### Patch Changes

- 8c6635c: fix(dynamic-table): preserve `view`/`group_by` in the URL when the table syncs its state

  The table's url-sync rebuilt the query string from scratch (only its own
  page/sort/filter keys) and `replaceState`d it, wiping the route-owned
  `view`/`group_by` params. On a same-model board↔list pair (e.g. github's Board
  `?view=kanban` vs Issues `?view=table`) this stripped `?view` on mount, so the
  URL went bare and the sidebar active-state fell back to the model default —
  highlighting the wrong sibling until you clicked again. The sync now carries
  `view`/`group_by` through so the open entry stays highlighted on a single click
  and `?view` deep-links survive table interaction.

## 20.1.2

### Patch Changes

- 3d0a624: fix(kanban): wrap long card field values to 2 lines + ellipsis instead of a 1-line hard cut

  Kanban card fields rendered each value on a single `truncate` line, so a long
  text field — e.g. a github Issue whose title lands in a _field_ because the first
  text column (`repo`) is picked as the card title — was hard-cut mid-line and lost
  most of its content. Field values now `line-clamp-2 break-words`, so they grow to
  two lines and then ellipsis cleanly, matching the title's treatment.

## 20.1.1

### Patch Changes

- eb6c65f: Kanban responsive board + cards truncate; sidebar nav lights the default view on a view-less landing

  Two frontend UX fixes reported against the ops board.

  **Kanban now adapts instead of overflowing (`@asteby/metacore-runtime-react`).**
  `DynamicKanban` lanes were fixed-width (`w-72 shrink-0`), so with 4+ stages the
  last lane was clipped off-viewport and long card text was cut by the card edge
  with no ellipsis. Lanes are now responsive — `flex-1 min-w-[220px] max-w-[320px]`
  — so they shrink to fit the available width and only scroll horizontally when
  they genuinely can't fit. Card titles now `line-clamp-2 break-words` and the
  secondary field rows carry `min-w-0` so long values ellipsize _inside_ the card
  rather than being clipped by the border. The optimistic drag-to-move (PUT
  `<base>/<id>`) is untouched.

  **Sidebar nav active-state on the default/view-less landing (`@asteby/metacore-ui`,
  `@asteby/metacore-starter-core`).** Landing on a model's bare list surface
  (e.g. `/m/github_issues?per_page=15` — a transient param, no `view`) lit
  _neither_ the "Tablero" (`?view=kanban`) nor the "Issues" (`?view=list`) nav
  item, because the empty view bucket matched neither sibling's explicit view.
  `checkIsActive` now treats the empty/`view=list`/`view=table` buckets as
  "default-equivalent": a view-less current URL lights the list/default item while
  the board (`?view=kanban`, never a default bucket) stays mutually exclusive. The
  prior Board-vs-Issues exclusivity, `f_` filter and transient (page/sort/search)
  behaviour are all preserved (18 matcher tests, +4 new). Ported to the
  `starter-core` scaffold's embedded copy for parity.

- Updated dependencies [eb6c65f]
  - @asteby/metacore-ui@2.6.1

## 20.1.0

### Minor Changes

- 8de09a9: DynamicKanban: traduce el label de cada etapa via i18n (`t(stage.label)` con fallback al valor crudo) — antes mostraba la key cruda (ej. `integration_github.stage.backlog`) en vez de "Backlog". Y da min-height a las lanes para que el scroll horizontal del board quede abajo en vez de flotar cuando las columnas están vacías.

### Patch Changes

- 8de09a9: fix(kanban): el drag-to-move ya no duplica `/me` en el PUT (causaba 404 "No se pudo mover la tarjeta"); el board respeta el ancho del padre (`min-w-0`) y deja de desbordarse horizontalmente.

## 20.0.0

### Minor Changes

- dcd95c3: DynamicKanban: traduce el label de cada etapa via i18n (`t(stage.label)` con fallback al valor crudo) — antes mostraba la key cruda (ej. `integration_github.stage.backlog`) en vez de "Backlog". Y da min-height a las lanes para que el scroll horizontal del board quede abajo en vez de flotar cuando las columnas están vacías.
- 3f41073: Sidebar nav: exact, view-aware active-state so sibling navs over the same model light up one at a time

  The `NavGroup` active-state matcher (`checkIsActive`) now treats `view`/`group_by`
  query params as the _identity_ of a view-style nav item. Two navs over the same
  model that differ only by their view — e.g. a "Board" (`?view=kanban&group_by=stage`)
  and an "Issues" (`?view=list`, or a query-less default list) — are mutually
  exclusive: only the item whose view identity equals `currentHref` stays active,
  fixing the bug where both lit up at once.
  - `@asteby/metacore-ui`: the matcher is extracted into a pure, React-free
    `layout/nav-active` module (`checkIsActive`, `splitHref`, `declaredFiltersMatch`,
    `VIEW_PARAMS`) and re-exported from `@asteby/metacore-ui/layout` for hosts and
    unit tests. `f_` filter and transient (page/sort/search) highlight behaviour is
    unchanged — a query-less link still highlights under filters/pagination, and
    per-status entries still light up one at a time.
  - `@asteby/metacore-starter-core`: the scaffold's `nav-group` matcher gains the
    same view/query/filter-aware logic.
  - `@asteby/metacore-runtime-react`: `DynamicView` now reads the active view from
    the per-nav signal — an explicit `view` prop (host router) or the `?view=`
    query — and prefers it over the model-level `metadata.view_type`, so the same
    model can route `?view=kanban` to `DynamicKanban` and `?view=list` to
    `DynamicTable` with no per-model metadata change. New pure helpers
    `readViewFromSearch` / `resolveActiveView` are exported.

### Patch Changes

- Updated dependencies [3f41073]
  - @asteby/metacore-ui@2.6.0

## 19.0.0

### Major Changes

- feat(kanban): new `DynamicKanban` view-type renderer, a sibling of `DynamicTable` sharing the same contract (`model` + `endpoint` + injected `ApiProvider`). Reads `view_type`/`group_by` from the table metadata (RFC §1.2) and derives board lanes from the model-level `stages[]` (or, as a fallback, the `group_by` column's status `options`). Records are fetched through the same `/data/:model` path and bucketed by `row[group_by]`; cards render through the existing `ActivityValueRenderer` (title + 2-3 fields) and reuse the `ActionModalDispatcher`/`useModelActions('row')` plumbing for the per-card action menu.

  Drag-to-move (via `@dnd-kit/core`) is **optimistic**: dropping a card into another lane mutates local state immediately and fires `PUT /data/:model/me/:id { <group_by>: <dest> }`; on failure the move reverts and a toast surfaces — sidestepping the "refetch loses scroll/selection" gap. When the metadata declares `transitions[]`, a card may only drop into a stage reachable from its current one (disallowed lanes dim and reject the drop; the kernel still validates server-side).

  Also adds `DynamicView`, a metadata-driven dispatcher that routes `view_type === 'kanban'` → `DynamicKanban`, else → `DynamicTable`, plus the pure helpers `deriveStages`, `groupByStage`, `isTransitionAllowed`, `applyOptimisticMove`, `selectCardColumns`, `resolveViewRenderer`. New `TableMetadata` fields (`view_type`, `group_by`, `stages`, `transitions`) and `StageMeta`/`StageTransition` types are purely additive. New deps: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

## 18.28.3

### Patch Changes

- e5e9fca: feat(action-modal): a field-action modal now renders the acted-on record's related-lists (model metadata.relations) below the form, as read-only context — e.g. the reception history of a transfer shown right inside the "Recibir" modal. Create actions (no record) render nothing; reuses the same DynamicRelations the detail view uses.

## 18.28.2

### Patch Changes

- 1896101: fix(line-items): non-select cells (number/text/date/switch/select/textarea) now honor a per-field `readonly` flag (set via PrefillSpec.lock), rendering disabled. Lets a receive-goods modal show read-only progress columns (ordered / already-received) alongside the editable qty.

## 18.28.1

### Patch Changes

- f346352: fix(line-items): a locked dynamic_select no longer flashes the raw id while its label is resolving — it shows a loading hint, then the name + thumbnail, instead of String(value).

## 18.28.0

### Minor Changes

- d3b7060: feat(line-items): a PrefillSpec can `lock` item-field columns — locked dynamic_select cells render as a resolved, read-only NAME (eager option fetch, never the raw id) instead of an editable picker. Used for receive-goods/partial-reception lines whose product is dictated by the source document; the create flow (no prefill) stays fully editable.

## 18.27.0

### Minor Changes

- b71dcc0: feat(action-modal): line-items fields can prefill their rows from the acted-on record. A field whose `default` is a `PrefillSpec` (`{$prefillFromRecord, map, remaining}`) seeds one row per record array entry, copying mapped keys and computing a remaining quantity (`of - minus`), dropping fully-satisfied rows. Enables receive-goods/partial-reception modals (e.g. inventory transfers) to open pre-loaded with the pending lines instead of empty. Decoupled: the SDK only projects a record array into the field's item_fields.

## 18.26.0

### Minor Changes

- d0056f1: Activity log (record history) renders jsonb line items as a table and localizes
  relation field labels.
  - **Line-items render as the shared `CollectionCell` mini-table** instead of raw
    `JSON.stringify`. A jsonb array-of-objects value (e.g. a transfer's `items`,
    directly or JSON-string-encoded) now shows a localized mini-table with
    resolved relation chips (when the backend injects the `{value,label,image}`
    siblings into the snapshot) — matching the detail view. Uses the column's
    declared `item_fields` when present.
  - **Relation field labels localize.** `resolveColumn` now matches the `*_id`
    twin of a resolved relation key (`destination_warehouse` →
    `destination_warehouse_id`), so the diff "Campo" uses the localized column
    label ("Almacén destino") instead of humanizing the key in English
    ("Destination Warehouse").

## 18.25.0

### Minor Changes

- adb1c52: `CollectionCell` renders resolved relation references as "pro" chips in EVERY
  path — including the schema-less generic one.

  Previously only the declared-`item_fields` path resolved a jsonb line-item ref
  (e.g. `product_id`) to a relation chip. The generic path (used by the full-page
  record detail and any jsonb without a declared schema) dumped the
  backend-injected resolved sibling object as raw `"{…}"` AND showed the raw uuid
  in a duplicate column. Now the generic path:
  - detects the backend-injected `{ value, label, image }` ref siblings,
  - renders them as the same relation chip (subtle tint + thumbnail or entity icon
    - name) the FK table columns use, and
  - hides the raw `<key>_id` twin column,

  so an unconfigured jsonb line-items blob reads as first-class relations
  (foto/nombre) instead of uuid soup. The shared chip is extracted as `RefChip`
  and reused by the schema (`ItemFieldCell`) and generic paths.

## 18.24.0

### Minor Changes

- 39c43ea: jsonb line-item `ref` cells render as relation chips (icon/photo + name).

  In `CollectionCell` (table popover, inline detail view, and the read-only edit
  field), a resolved ref sub-field — e.g. `product_id` inside a transfer's `items`
  — now renders with the same "pro" relation look the FK table columns use: a
  subtle deterministic tint, the resolved record's thumbnail (product photo / logo
  / avatar, resolved via the threaded `getImageUrl`) or a generic entity icon
  fallback, and the resolved name — instead of a truncated uuid.

  `CollectionCell` gains an optional `getImageUrl` prop, threaded from the columns
  factory and from the record dialog's `ImageUrlContext`. Backend-agnostic: it
  drives off the backend-injected `{ value, label, image }` sibling; an unresolved
  ref still falls back to the scalar value.

## 18.23.0

### Minor Changes

- dc5e552: Polish the generic record EDIT dialog (`DynamicRecordDialog` mode='edit'),
  fixing two prod issues that affected every module using it (transfers, orders,
  customers):
  - **jsonb line-items render read-only instead of "[object Object]".** A field
    that is a jsonb line-items column (declares `item_fields`, or its value is an
    array/plain object) is no longer rendered as a broken text input. The edit
    form now renders it read-only with the same inline `CollectionCell` table the
    detail view uses — localized headers + resolved ref labels — plus a
    translatable "Solo lectura" hint (`datatable.readOnly`). These are
    action-built documents; field-by-field array editing stays out of scope.
  - **FK selects show the related record's name, not the raw uuid.** A
    `dynamic_select` / `ref` field in edit mode now seeds its trigger from the
    backend-injected relation sibling (`source_warehouse_id` →
    `source_warehouse: { value, label }`, the key without `_id`) via the existing
    `DynamicSelectField` `seedOption` prop, so an existing selection displays the
    label immediately without waiting for a lookup. Falls back to the raw value
    (today's behaviour) when no sibling is present; creating/changing the
    selection is unchanged.

  `EditField`, `isLineItemsField`, and `fkSeedOption` are exported from the
  dialogs module.

## 18.22.0

### Minor Changes

- 24cced0: The read-only record detail view now renders jsonb line-items with the same pro
  rendering as the table instead of raw `JSON.stringify`. `CollectionCell` gains a
  `variant?: 'badge' | 'inline'` prop (default `'badge'` = unchanged behaviour);
  `'inline'` renders the mini-table / pair-list / scalar-list directly, with no
  badge or popover, for the full-width detail dialog. The detail view's
  `StructuredViewValue` delegates to `<CollectionCell variant="inline" …>`,
  threading the field's `item_fields` schema plus locale + translator: an
  `item_fields` schema drives localized headers + resolved ref labels (the
  injected `{ value, label }` sibling — product name instead of the raw uuid),
  and without a schema it falls back to a localized mini-table / pair list. The
  "—" empty marker is preserved.

## 18.21.0

### Minor Changes

- 53950ed: CollectionCell renders jsonb line-items from a declared sub-field schema when
  the column carries one (`col.itemFields` / snake `col.item_fields`, kernel v3
  `item_fields`). Headers use the schema's already-localized `label` verbatim (in
  the declared order, no prettify/translate); `ref` columns resolve to the
  backend-injected sibling label — the FK key without `_id` (`product_id` →
  `product`), else `<key>_label` — showing the resolved name instead of the raw
  uuid (`{ value, label }` → `label`, bare string → itself, missing → truncated
  uuid fallback). The badge count noun stays locale-aware. When no schema is
  present the generic dict/prettify behaviour is unchanged. `itemFields` is
  threaded from the dynamic columns factory callsite.

## 18.20.0

### Minor Changes

- 6ec7baf: CollectionCell is now locale-aware: jsonb/array popover headers and the item
  count noun render in the org's language. Resolution per key: host `t(rawKey)`
  override → built-in es/en dictionary of common data/commerce keys (product_id,
  quantity, price, total, name, sku, …) → snake→Title prettify fallback. Count
  noun localizes (es: ítem/ítems). Locale + translator are threaded from the
  dynamic columns factory; defaults to English when absent.

## 18.19.0

### Minor Changes

- de0b4bb: Add a generic `CollectionCell` renderer for jsonb / array / object table-cell values.

  Previously the `default:` branch of `defaultGetDynamicColumns` rendered such
  values as raw `JSON.stringify(value)`, which was unreadable. Every jsonb column
  now renders a compact, brand-neutral, dark-mode-friendly cell with no per-addon
  config:
  - **Array of objects** (e.g. line items): a count Badge (`2 ítems`) that opens a
    Popover mini-table — columns are the prettified union of row keys, cells go
    through a shared `formatScalar` (uuid/long strings truncated, booleans as
    ✓/✗, nested shapes summarized).
  - **Array of scalars**: first few joined inline with a `+N` overflow, full list
    in the popover.
  - **Plain object**: first few `key: value` pairs inline, all pairs in the popover.
  - **null / empty**: muted `-`.
  - JSON-string values are defensively parsed; unparseable strings are truncated.

  Exports `CollectionCell`, `formatScalar`, `prettifyKey`, and `CollectionCellProps`.

## 18.18.0

### Minor Changes

- be0d2b8: Dependent (cascading) options for declarative pickers. A field/item_field may
  declare `dependsOn` (camelCase) / `depends_on` (snake_case) naming another field
  in the same action form — a header field (e.g. `source_warehouse_id`) or a
  sibling row cell — whose current value scopes this picker's options. The value
  is forwarded to the options endpoint as `filter_value` (`useOptionsResolver`
  gains a `filterValue` arg) and the picker re-fetches when it changes, clearing
  the stale selection. While the depended-on field is empty the picker is disabled
  with an overridable hint. Header form context flows down through
  `DynamicLineItems` → `CellRenderer`/`RefCell` so a line-items cell can depend on
  a header field, not just same-row values. Option `description` (e.g. available
  qty) is now shown in the line-items `RefCell` select as well as
  `DynamicSelectField`.

  A field/item_field may also carry an `optionsConfig` (camelCase) /
  `options_config` (snake_case) object — the kernel's enriched options routing,
  shaped `{ type, source, filter_by, value, label_ref, description }`. When it
  declares a `source`, the picker queries that SOURCE model instead of the field's
  `ref`: URL `/options/<source>` with query field `<value ?? field.key>` and the
  cascade `filter_value`. Without `optionsConfig.source` the picker keeps its
  `ref`-based behaviour (retrocompat). New `getOptionsConfig` / `resolveOptionsSource`
  helpers (and `FieldOptionsConfig` type) are exported. Fully generic — no domain
  knowledge in the SDK.

## 18.17.3

### Patch Changes

- d2c92e1: Fix React #310: move flatten/order useMemo before the empty-state early return (conditional hook crashed on empty→populated)

## 18.17.2

### Patch Changes

- 714cc34: Dashboard: masonry (balanced CSS columns) layout — no blank cells; charts fixed-height, compact stat cards

## 18.17.1

### Patch Changes

- 211484b: Dashboard grid: compact KPI stat cards, dense fixed-row packing (charts span 2 rows), charts fill card height

## 18.17.0

### Minor Changes

- a6f5b98: Add the modular dashboard surface: `DashboardGrid` plus built-in widget
  renderers (stat, bar, line, area, pie, donut, list, progress) and a federated
  `kind:"custom"` path that renders through the `dashboard.widgets` slot inside the
  same card chrome.

  `DashboardGrid` renders the union of declarative + federated widgets in a
  responsive 4-column grid, honouring per-widget `size`, grouping/ordering, batch
  data loading with per-widget skeletons, isolated per-widget errors, a pro global
  empty state, and permission gating via `useCan` (no provider / `isAdmin` ⇒
  everything visible). Charts use recharts with theme CSS-var colors (dark-mode
  safe); numbers reuse the org currency + locale formatting.

  New exports: `DashboardGrid`, `normalizeGroups`, the widget renderers, the
  `WidgetRenderer`/`WidgetSkeleton`/`WidgetCard`/`DeltaChip` primitives, the
  `formatWidgetValue`/`accentClasses` helpers, and the types `WidgetKind`,
  `WidgetSize`, `WidgetFormat`, `WidgetAccent`, `DashboardWidgetSpec`,
  `DashboardWidgetQuery`, `WidgetData`, `WidgetSeriesPoint`,
  `DashboardWidgetGroup`, `DashboardGridProps`, `DashboardGridStrings`,
  `LoadWidgetData`. Adds `recharts` as a dependency.

## 18.16.1

### Patch Changes

- c53d68f: PermissionsManager: the module picker is now a grouped combobox (same Popover + Command pattern as the role selector) instead of an always-visible flat list. The long list felt heavy in the left column; the combobox is compact, opens to the grouped+searchable modules (GENERAL, CLIENTES, PUNTO DE VENTA…), and shows the selected module with its icon. Selecting an option reveals its action grid on the right. Granted-count badges appear per option.

## 18.16.0

### Minor Changes

- cc4851a: PermissionsManager: la elección de módulo pasa de un **árbol con acordeones/folders** a una **lista plana idéntica al sidebar**.
  - Cada grupo se dibuja como un **header gris no colapsable** (uppercase tracking, estilo "Módulos"/"Sistema" del sidebar) seguido de sus módulos como **filas clickeables** (ícono + label + badge contador N/M). El click directo en una fila selecciona el módulo y muestra su grid de acciones a la derecha. CERO Collapsible/acordeón/folder. La búsqueda filtra las filas (accent/case-insensitive por label de módulo o título de grupo) y oculta los grupos sin coincidencias.
  - **Nuevo shape de entrada (desacoplado)**: `loadModules()` ahora puede devolver `{ groups: ModuleGroup[]; general: GeneralPermissionDef[] }` donde `ModuleGroup = { title: string; modules: ModuleDef[] }` (`title: ''` → sin header) y cada módulo es `{ key, label, icon?, kind: 'model' | 'screen', actions: ActionDef[] }`. La capability final es `${module.key}.${action.key}`; para pantallas no-modelo el host manda `key: 'screen.<navKey>'` + una acción `{ key: 'access', label: 'Acceder', icon: 'Eye', kind: 'screen' }` → capability `screen.<navKey>.access`.
  - **Retrocompat**: si `loadModules` devuelve el shape viejo `{ modules, general }` (flat, sin `kind`), se envuelve en grupos (agrupados por `addon_label`/`addon_key`, fallback "Sistema") y cada módulo se trata como `kind: 'model'`. Los hosts que aún mandan el shape viejo siguen funcionando.
  - Tipos exportados nuevos: `ModuleGroup`, `GroupedPermissionsCatalog`, `FlatPermissionsCatalog` y `kind` en `PermissionModuleDef`/`PermissionActionDef`. Helpers exportados: `normalizeCatalogGroups`, `flattenGroups`, `filterModuleGroups` (firma actualizada a `ModuleGroup`). Se eliminó `groupModules` (reemplazado por `normalizeCatalogGroups`).
  - Intacto: selector de rol limpio (edit/delete inline), permisos generales, dirty tracking + guardar (sync = set completo), guard de cambios sin guardar, i18n español, `createRole`/`updateRole`/`deleteRole` opcionales.

## 18.15.0

### Minor Changes

- cbcedd9: PermissionsManager: rediseño de UX para que la elección de módulo refleje el sidebar.
  - El selector de módulo plano se reemplaza por un **árbol jerárquico** agrupado por `addon_label` (acordeón colapsable, ícono por módulo, badge de acciones otorgadas N/M, búsqueda que filtra el árbol). Los módulos sin addon caen en el grupo "Sistema".
  - El selector de **rol** queda limpio: combobox con acciones de **editar** y **eliminar** inline (íconos lápiz/basurero a la derecha), sin el chip removible separado.
  - Estados claros del panel de acciones: "elige un rol" / "elige un módulo" / skeleton de carga; el grid se habilita en cuanto hay rol + módulo. El panel titula con el módulo activo y su addon.
  - Nuevo campo opcional `icon` en `PermissionModuleDef` (lucide) para mostrar el ícono del módulo en el árbol y el panel.
  - Helpers exportados nuevos: `groupModules`, `filterModuleGroups` (+ tipo `ModuleGroup`).

  Sin cambios en la firma de props de `PermissionsManager` (solo render interno; `PermissionModuleDef.icon` es aditivo/opcional).

## 18.14.0

### Minor Changes

- 184afb8: Permisos dinámicos rol × módulo × acción (Pieza C del contrato de permisos dinámicos).

  **Primitivas de runtime (`permissions-context`)**
  - `<PermissionsProvider permissions={string[]} isAdmin={boolean}>` — el host carga `/permissions/me` y monta el provider una vez en el root.
  - `useCan(): (capability: string) => boolean` — `isAdmin` ⇒ todo permitido; la lista permite la capability exacta o el wildcard `*`. **Sin provider montado devuelve siempre `true`**, así que los hosts existentes no cambian de comportamiento hasta que opten por el gating.
  - `usePermissionsActive()`, `makeCan()`, `modelCapability()`, `capabilityForActionKey()` (mapea `view→index`, `edit→update`) y `gateTableMetadata()` exportados para hosts con tablas propias.

  **`<PermissionsManager>` — vista pro "Permisos y Roles"**

  Transport-agnostic (loaders/mutators por props: `loadModules`, `loadRoles`, `loadRolePermissions`, `syncRolePermissions`, `createRole?/updateRole?/deleteRole?`). Panel de rol con selector buscable + chip removible y CRUD de rol (oculto si faltan los mutators), sección "Permisos Generales" (`general.*` del mismo rol), selector de módulo agrupado por addon y buscable, grid "Acciones permitidas" con ícono + label por acción, contador N/M, marcar-todo/limpiar, estado dirty visible y guardado que sincroniza el set completo del rol activo. Textos en español, estética shadcn del SDK.

  **Gating en las superficies dinámicas (solo con provider activo)**
  - `DynamicTable`: Exportar/Importar requieren `model.export|import`; las row actions (custom y el trío implícito Ver/Editar/Eliminar) se filtran por `can(lowercase(model).<action>)`.
  - `DynamicCRUDPage`: botón Crear/Exportar/Importar gated por `model.create|export|import`.
  - `ModelActionToolbar`: actions `table`/`create` filtradas por capability.

  Sin `<PermissionsProvider>` todo queda visible exactamente como hoy.

## 18.13.3

### Patch Changes

- b45b5b1: ActivityDiff: created/deleted events render as a true two-column grid (Campo + Valor) — the old layout emitted a placeholder cell plus a col-span-2 value into a 3-column grid, overflowing the row so the value wrapped below its label. RecordHistory gains `moduleLabel` so the event-header badge can show the localized model title (e.g. "Clientes") instead of the raw addon_key.

## 18.13.2

### Patch Changes

- b37e1d7: RecordHistory: event headers show the actor's photo, not just initials — `ActivityEvent` gains `actor_avatar` and the component renders it via the new `resolveAvatarUrl` prop (host resolves the storage path, e.g. ops' `getStorageUrl(path, 'avatars')`; identity fallback for absolute paths).

## 18.13.1

### Patch Changes

- 6b8f7b2: ActivityDiff: drop noise rows from history diffs — raw FK keys (`created_by_id`) are hidden when their resolved sibling (`created_by: {name,…}`) is present in the same snapshot (covers before/after and the changes {from,to} shape), and `deleted_at` joins the meta-key filter alongside id/created_at/updated_at/organization_id.

## 18.13.0

### Minor Changes

- bd619da: Activity/history polish + lucide icon cells:
  - `ActivityValueRenderer`: backend-resolved entity objects ({name,avatar,email} users, {value,label} relations) render as an avatar/name chip instead of raw JSON — covers the "Created By" row in a record's history diff. Relation chips also unwrap resolved objects.
  - `ActivityDiff`: a diff key now matches dotted display columns by base segment (`created_by` → `created_by.avatar`), inheriting the served label and rich renderer.
  - `RecordHistory`: new optional `onOpenEvent(event)` prop — shows an "open in activity log" button per event so hosts can deep-link to `/activity/:id`.
  - Image cells (`dynamic-columns` + record detail `ViewValue`): a value that is a lucide icon name (an addon's `icon` column, e.g. "Banknote") renders the glyph via `DynamicIcon` instead of a broken `<img>` (empty grey box). New `isLucideIconName` export.

## 18.12.1

### Patch Changes

- e568344: ViewValue: render structured jsonb values (objects/arrays without a label/name/title) as readable key→value pairs instead of "[object Object]" — e.g. a `fiscal_data` jsonb column on the record detail page. Plain objects become a humanized key/value list, primitive arrays a comma-joined line, nested structures a pretty-printed JSON block; empty structures render the "—" empty marker.

## 18.12.0

### Minor Changes

- e661c1f: Add `onRowClick` prop to `DynamicTable` — when provided, each data row becomes clickable (cursor-pointer) and calls `onRowClick(row)` on click. Clicks on the checkbox (select column) and action buttons are stopped from propagating so they do not trigger the row handler. Behaviour is unchanged when the prop is not supplied.

## 18.11.0

### Minor Changes

- 2cdb047: Add Activity / Time Machine components: `ActivityDiff`, `RecordHistory`, and
  `ActivityTimeline`.
  - `ActivityDiff` — renders the field-level diff of a single `ActivityEvent`
    (created/updated/deleted states, before→after per field, toggle all/changed).
  - `RecordHistory` — chronological timeline of all events for a single record,
    collapsible cards, embeddable in a record dialog "Historial" tab.
  - `ActivityTimeline` — global feed grouped by `correlation_id`, with client-side
    filters (model, actor, action, date range) and injectable `resolveColumns(model)`
    resolver so hosts supply metadata without any internal fetch.

  All three components are transport-agnostic (no fetch, no API calls) and reuse
  the existing display-type renderers (currency, status, date, boolean, relation
  chips, tags, color, url) via the new `ActivityValueRenderer` helper, keeping
  table cells and diff cells visually consistent.

  Also exports `ActivityValueRenderer` as a standalone pure renderer for use
  outside the activity components.

## 18.10.2

### Patch Changes

- 530ad31: The totals footer is now pinned to the bottom of the table box even with few
  rows (the table fills its container height and a spacer row absorbs the slack),
  instead of floating right under the last row.

## 18.10.1

### Patch Changes

- ea5e587: The dynamic table totals footer is now sticky (pinned to the bottom of the
  scroll area) so the column totals stay visible while scrolling the rows.

## 18.10.0

### Minor Changes

- 35289f7: feat(dynamic-table): table footer totals — a declarative per-column SUM over the FILTERED set

  A column opts into a footer total via its manifest `display_config.aggregate: "sum"` (mapped by the kernel to `styleConfig.aggregate` at runtime). `DynamicTable` now fetches those totals from a separate `${endpoint}/aggregate` endpoint that reuses the SAME filter/search params as the list (no sort, no pagination) — so the footer reflects the whole filtered set, not the visible page — and refetches whenever filters/search change.

  `<TableFooter>` renders one cell per visible column: aggregate-flagged columns show the total formatted with the SAME helpers the body cells use (currency columns → org currency via `resolveCurrency` + `formatNumber`, number columns honour `styleConfig.decimals`), every other column gets an empty cell, and the first column carries a "Total" label. The footer only renders when at least one column opts in and totals are present.

  New exports from `dynamic-columns`: `aggregateOf(col)` and `formatAggregateTotal(col, value, currency, locale)`.

## 18.9.0

### Minor Changes

- 5becc8e: Add a `reference` display type for SAP-style polymorphic source-document columns.

  A column declared `display: "reference"` (e.g. `inventory_movements.source_id`,
  whose target document varies by a `source_kind` discriminator) now renders a
  navigable chip resolved by the backend. The new `ReferenceCell` reads the
  resolved sibling `row[<key w/o _id>] = { value, label, kind, table }`: it shows
  the `label` when present, else a short id (first 8 chars of the value), and —
  when the sibling carries a target `table` and `value` — wraps the chip in a
  plain `<a href="/m/<table>/<value>">` so the host router navigates to the source
  document. Mirrors `RelationCell`'s chip look (subtle tint, dark-mode aware) and
  is domain-agnostic: any polymorphic FK carrying the `reference` renderer works
  without per-addon code.

## 18.8.0

### Minor Changes

- 266e3da: Add `OrgRuntimeProvider` (+ export `CurrencyContext`/`TimeZoneContext`/`useCurrency`/`useTimeZone`) so host apps can feed the org's display config (timezone, currency, image-url resolver) to EVERY nested renderer from one place. Standalone surfaces like the full-page detail view — which mount `DynamicRelations`/`DynamicTable` outside the record dialog — previously had no provider, so money fell back to USD and datetimes to the browser zone. Wrap the authenticated app root once for app-wide org consistency.

## 18.7.0

### Minor Changes

- 3b16664: `DynamicRecordDialog` now refetches its own parent record after a child relation
  row (line item, etc.) is created/updated/deleted, so server-recomputed
  declarative rollups (sub_total, tax_amount, total) appear in place without a
  manual page reload. Also exposes an optional `onChange` callback so hosts can
  invalidate their own list/detail query underneath the dialog.

## 18.6.0

### Minor Changes

- ed63683: Record dialog date fields use the real shadcn Calendar (react-day-picker) from
  `@asteby/metacore-ui` instead of the dependency-free native `<input type="date">`
  shim, and match datetime/timestamp(tz) types too. Empty/Go-zero dates
  (0001-01-01) now show the "Seleccionar fecha" placeholder instead of
  "31 de diciembre de 1".

## 18.5.0

### Minor Changes

- d7c792d: Render one_to_many relations as a rich table (headers + currency/image/date/badge cells)

  `OneToManyRelation` now renders the child list as a real metadata-driven table
  using the same metacore-ui `<Table>` primitives and the exact
  `makeDefaultGetDynamicColumns` cell factory as `<DynamicTable>`, instead of a
  bare flex grid of unlabeled values. Line items now get column headers, money in
  the org currency right-aligned (e.g. `100,00 MXN`), FK thumbnails + labels,
  dates in the org timezone, status/option badges and creator names — matching
  the main dynamic table. The inline edit (DynamicForm dialog) and delete
  (AlertDialog) actions are preserved as a trailing actions column.

  The org `timeZone`/`currency` contexts were extracted from
  `dialogs/dynamic-record` into a shared `org-runtime-context` module so the
  relation table can consume them without a circular import. `ManyToManyRelation`
  is unchanged.

## 18.4.0

### Minor Changes

- c7fb1ad: Org-currency-aware money formatting in dynamic tables + the record dialog.

  `<DynamicTable>` and `<DynamicRecordDialog>` now accept an optional `currency`
  prop (the org's ISO-4217 code, e.g. `MXN`, threaded from org config like
  `timeZone`). Money columns (`type:'number'` + `cellStyle:'currency'`) without an
  explicit per-column currency now fall back to the org currency instead of
  hardcoded `USD` — `resolveCurrency(col, orgCurrency)`. The record dialog, which
  previously showed raw numbers, now formats money fields as a currency string in
  the view renderer: a field is treated as money when the backend stamps
  `cellStyle:'currency'`, or — as a robustness fallback mirroring the backend's
  `inferDisplayCellStyle` — when it's numeric and its key matches the money
  heuristic (`price`/`amount`/`total`/`cost`/`subtotal`/`balance`/`paid`, as the
  whole key or a `_<m>`/`<m>_` affix). Editable inputs stay numeric.

## 18.3.0

### Minor Changes

- fc14b4f: Relation (one_to_many) cells now show the FK product image: when an FK column's backend-resolved sibling carries an `image`, the relation row renders a thumbnail + label instead of plain text. The nested line-item edit form drops server-managed/audit columns (`id`, `created_at`, `updated_at`, `deleted_at`, `created_by(_id)`, `updated_by(_id)`) so they no longer render as `[object Object]` inputs, and the nested `dynamic_select` is seeded with the existing value's label/image from the initial record so the trigger shows the name + thumbnail instead of a raw UUID. The image-url resolver context moved to its own `image-url-context` module to avoid a circular import.

## 18.2.0

### Minor Changes

- 3cd35a1: Consolidate the record dialog into the SDK: tz-aware dates + FK image/label in
  view & edit; ops consumes.

  `DynamicRecordDialog` (the single, SDK-owned declarative record modal) absorbs
  the improvements that had diverged into the ops fork and adds parity-plus:
  - **tz-aware dates** — date/datetime/timestamp fields render via the SDK's
    `formatDateCell(value, renderAs, locale, timeZone?)`; a new optional
    `timeZone` prop pins instants to the org IANA zone (pure `date` to UTC) instead
    of hand-rolled `toLocaleDateString`.
  - **FK image/label** — relation fields (`ref`/`searchEndpoint`/`dynamic_select`
    or any `*_id`) render a read-only `OptionLead` (thumbnail / icon / color dot) +
    resolved label in **view** mode, and the searchable `DynamicSelectField` picker
    in **edit** mode. Resolution prefers the table-served sibling object, falling
    back to the canonical options endpoint.
  - **resolved objects, nil-UUID, created_by avatar** — `{value,label}` / `{name}`
    relation & user objects render their label (never raw JSON); the nil UUID
    elides to an em-dash; `created_by`/avatar resolvers show name + avatar.
  - **pro option badges** — enum/option fields render the served color/icon.
  - **one_to_many child panels** — `DynamicRelations` (line items, etc.) below the
    scalar fields in view (read-only) and edit (add/edit/delete), skipped on create.
  - **instant render** via `initialRecord` seeding, `onOpenFullPage` footer link,
    localized titles/messages, and `onSaved(record)` handing back the persisted row.

  New optional props: `getImageUrl`, `timeZone`, `onOpenFullPage`, `initialRecord`.
  `onSaved` now receives the persisted record. `ViewValue` and the `FieldDef` /
  `FieldOption` / `GetImageUrl` types are exported so hosts can reuse the view
  renderer (e.g. a full detail page). Fully backward compatible.

## 18.1.0

### Minor Changes

- 4e601ec: Org-timezone-aware date display in dynamic tables.

  `formatDateCell` and the column factory (`defaultGetDynamicColumns` /
  `makeDefaultGetDynamicColumns`) now accept an optional IANA `timeZone`, and
  `DynamicTable` exposes a matching `timeZone` prop. When provided, datetime /
  timestamp(tz) cells are rendered in that zone via the native
  `Intl.DateTimeFormat` (instead of the viewer's browser zone), so instants no
  longer day-shift; pure `date` columns are pinned to UTC so they never roll to
  the previous/next day. Omitting `timeZone` preserves the exact legacy date-fns
  formatting (fully backward-compatible).

## 18.0.0

### Patch Changes

- ce9dd72: `DynamicSelectField` (the searchable FK / option picker) now renders each
  option's leading visual: a photo thumbnail (FK relations with an image), else a
  declared icon, else a colored dot for enum/status options that carry a `color`.
  Previously only image thumbnails showed, so enum selects (state, origin, …) read
  as plain text. Plain options with no image/color/icon stay plain.
- Updated dependencies [8439e9e]
  - @asteby/metacore-ui@2.5.0

## 17.0.4

### Patch Changes

- a745f5c: Relation/option thumbnails: resolved FK relation chips and option badges now
  render a small thumbnail when the backend stamps an `image` on the sibling
  `{ value, label }` object or the option (brand logo, product photo, customer
  avatar), with a graceful initials fallback when the image is missing or fails to
  load. Applies to the table `relation`/`select`/`status`/`badge` cells; the
  searchable picker (`DynamicSelectField`) and the detail-view picker already
  rendered option images. Adds a pure `resolveRelationImage` helper (+ tests).

## 17.0.3

### Patch Changes

- b5c8f5f: Pro datetime columns: `datetime`/`timestamp`/`timestamptz` columns now use the
  date cell renderer instead of falling through to the raw-ISO fallback. Datetime
  variants show day + time with a full-precision tooltip on hover (the 7Leguas
  pattern); plain `date` columns stay day-only. Null and the Go zero-time render
  an em-dash. Date-typed columns (including the timestamp variants) now infer the
  `date_range` filter. Adds a pure `formatDateCell` helper (+ tests).
- Updated dependencies [b5c8f5f]
  - @asteby/metacore-ui@2.4.2

## 17.0.2

### Patch Changes

- 3e45754: Humanize unmatched enum/status/option tokens as a scalable fallback. When a
  column value has no matching declared `option`, dynamic cells (table, record
  detail, relation rows) now render a humanized label (`in_progress` → "In
  Progress", `pos` → "POS") instead of the raw token. A matched `option.label`
  (the addon-localized source of truth) still wins; this only affects the
  previously-raw fallback.

## 17.0.1

### Patch Changes

- 957b024: Resolve pro siblings in `DynamicRelation` line-item cells. The relation
  sub-tables on a detail view (e.g. a sales order's lines) rendered raw values
  where the parent table already renders nicely: a `*_id` FK showed the raw uuid,
  a resolved relation/user object (`{ value, label }` / `created_by = { name }`)
  was `JSON.stringify`'d, and the unset nil/zero UUID leaked as a string of zeros.

  `formatCell` is replaced by the pure, tested `formatRelationCell(row, col)` (in
  `dynamic-relation-helpers`) which: prefers the backend-resolved FK sibling keyed
  by the column key with the trailing `_id` stripped (`product_id` → `row.product`),
  shows a value-object's `label`/`name`/`title` instead of raw JSON, and maps the
  nil UUID (via the shared `isNilUuid`) to the empty marker "—". Domain-agnostic —
  benefits every addon that renders relation panels.

## 17.0.0

### Patch Changes

- c834e67: Render the nil UUID (`00000000-0000-0000-0000-000000000000`) as empty in
  dynamic tables and the detail view.

  A nullable FK that a backend serializes as the all-zeros UUID instead of `null`
  used to leak into cells and read-only fields as a long string of zeros. The
  table cell renderer (`defaultGetDynamicColumns`) and the record detail view
  (`DynamicRecordDialog`/`ViewRecordDialog`) now treat the nil UUID as "no value",
  falling through to their existing empty markers (`-` / `—`). This covers
  relation/ref chips, `creator`/`url`/`status`/`dynamic_select` and any generic
  UUID-bearing column. A new shared guard (`NIL_UUID`, `isNilUuid`,
  `normalizeNilUuid`) is exported for hosts that render values themselves.

- Updated dependencies [8a4a315]
  - @asteby/metacore-sdk@3.2.0

## 16.0.1

### Patch Changes

- cde025c: Fix intermittent `#RUNTIME-009` ("Please call createInstance first") addon load
  errors.

  When an addon mounts before `@module-federation/vite`'s asynchronous runtime
  init lands at host boot, `registerRemotes`/`loadRemote` throw RUNTIME-009. The
  runtime is on its way — it's a boot race — so `AddonLoader` now treats that
  specific error as transient and retries with a short backoff (~10 × 60ms) until
  the host's federation runtime is ready, instead of surfacing a dead "Addon load
  error" to the user. Genuine failures (bad URL, missing export, 404) still
  rethrow immediately.

## 16.0.0

### Minor Changes

- 5f864d9: Make declarative dynamic-table option badges and relation chips feel alive.

  Options/select/status badges that ship without an explicit `color` from the
  backend now get a deterministic, cohesive color derived from the option value
  (fallback label) instead of rendering as dead gray text. Same value always maps
  to the same hue, and equal words share a color.
  - `@asteby/metacore-ui/lib` adds `optionColor(key)` (curated 16-hue Tailwind-500
    palette, FNV-1a hash, light/dark safe), plus `optionColorBadgeStyles`,
    `relationChipStyles`, and the exported `OPTION_PALETTE`.
  - `OptionBadge` uses the explicit `color` when present, otherwise derives one via
    `optionColor`, and renders the option's lucide `icon` before the label.
  - `RelationCell` (resolved FK chips for category/brand/supplier/…) now gets a
    subtle deterministic color keyed on the related label — kept lighter than enum
    badges (soft tint, no heavy fill) so the two remain distinguishable.

  All colors come from hex-derived inline styles, so they render correctly
  regardless of the host's tailwind safelist.

### Patch Changes

- Updated dependencies [5f864d9]
  - @asteby/metacore-ui@2.4.0

## 15.0.0

### Minor Changes

- ab41d75: Make declarative dynamic-table option badges and relation chips feel alive.

  Options/select/status badges that ship without an explicit `color` from the
  backend now get a deterministic, cohesive color derived from the option value
  (fallback label) instead of rendering as dead gray text. Same value always maps
  to the same hue, and equal words share a color.
  - `@asteby/metacore-ui/lib` adds `optionColor(key)` (curated 16-hue Tailwind-500
    palette, FNV-1a hash, light/dark safe), plus `optionColorBadgeStyles`,
    `relationChipStyles`, and the exported `OPTION_PALETTE`.
  - `OptionBadge` uses the explicit `color` when present, otherwise derives one via
    `optionColor`, and renders the option's lucide `icon` before the label.
  - `RelationCell` (resolved FK chips for category/brand/supplier/…) now gets a
    subtle deterministic color keyed on the related label — kept lighter than enum
    badges (soft tint, no heavy fill) so the two remain distinguishable.

  All colors come from hex-derived inline styles, so they render correctly
  regardless of the host's tailwind safelist.

### Patch Changes

- Updated dependencies [ab41d75]
  - @asteby/metacore-ui@2.3.0

## 14.0.0

### Minor Changes

- 6299af7: Pro dynamic-table cells + relation/option multi-select filters

  `DynamicTable` now renders resolved FK relations and option/type columns, and
  filters them server-side — generically, for every declarative addon.

  **Cells (`dynamic-columns.tsx`)**
  - `relation` renderer: a column carrying a `ref` (belongs_to FK) or
    `cellStyle: 'relation'` renders the backend-resolved sibling
    `row[<key without _id>] = { value, label }` as a clean truncated chip
    (e.g. `category_id` → `row.category.label`). Falls back to the raw id, then
    to an empty marker. Mirrors how `created_by` ships as a `{ name, avatar }`
    sibling for the `creator` renderer.
  - option/type badge: a `select`-style column shipping inline localized
    `options: [{ value, label, color, icon }]` renders the matched option's label
    as a colored `OptionBadge` (e.g. `product_type: "storable"` → the
    "Almacenable" badge), reusing the same badge path as `badge`/`status`.

  **Filters (`dynamic-table.tsx` + `FilterableColumnHeader`)**
  - New `dynamic_select` filter type: a `filterable` `ref` column loads its
    options from `searchEndpoint = /options/<ref>` (prefetched + cached into
    `filterOptionsMap`) and renders the same multi-value checkbox combobox as
    `select`. The backend's explicit `column.filterType` wins; otherwise it is
    inferred from the column shape.
  - `select` and `dynamic_select` filters support MULTIPLE selected values
    (already Set-based in the header; the gate/active-count/loading states were
    generalized to cover `dynamic_select`).

### Patch Changes

- Updated dependencies [6299af7]
  - @asteby/metacore-ui@2.2.0

## 13.10.2

### Patch Changes

- 2813c61: fix(native-form): render rich widgets from column metadata (ref→searchable picker, image/upload→dropzone)

  The native create/edit modal (`DynamicRecordDialog`, the one `CreateRecordDialog`
  wraps and fetches `/metadata/modal/:model` for) only routed FK columns to its
  searchable picker when they shipped a legacy `searchEndpoint` / `type: "search"`.
  Now that the kernel serves a belongs_to column's `ref` (and an explicit
  `widget`) on modal fields, a plain `ref` column degraded to a raw uuid text input.

  `EditField` now honors:
  - `field.ref` (or the snake_case `source`/`relation` aliases, or
    `widget: "dynamic_select"`) → renders `DynamicSelectField`: an async typeahead
    against `/api/options/<ref>?field=id` with option thumbnails when the remote
    rows carry an `image` (e.g. a brand logo). Static inline `options` still take
    the enum `<Select>` path — a `ref` column ships no inline options, so the FK
    branch never shadows a static enum.
  - `widget: "upload"` (alongside the existing `type: "image"`) → the themed file
    dropzone, same control as the Brand logo.

  Also fixes `deriveRelationFormFields` (the column→field mapper for
  `DynamicRelation` inline child forms): it now carries `col.ref` through to the
  field so a belongs_to column resolves to `dynamic_select`, and maps
  `image`/`media-gallery` columns to media field types so they resolve to the
  `upload` widget instead of a text input.

## 13.10.1

### Patch Changes

- 9107b10: Fix create-placement action submit hitting `/me/undefined/action/...` (400 Invalid record ID). `buildActionUrl` now omits the record segment when there is no record, posting to the collection route `/data/:model/me/action/:action`, so create modals declared as `placement:create` actions work.

## 13.10.0

### Minor Changes

- da8139d: feat(dynamic-form,nav): FK→searchable picker, image thumbnails, media→upload, query-aware nav
  - **resolveWidget**: a field that declares an FK target (`ref`, or the
    snake_case `source`/`relation` the kernel may serve) now resolves to
    `dynamic_select` BEFORE the type switch, so any declared relation renders a
    searchable picker instead of a raw text input — regardless of the column's
    SQL type. `image`/`media`/`file` types resolve to the `upload` widget.
  - **DynamicSelectField**: renders the option's `image` as a small thumbnail in
    the trigger (selected option) and in each dropdown row, with a neutral
    placeholder fallback. Thumbnails only appear when the resolved options carry
    images, so image-less relations keep their plain text list. Also tolerates
    the `source`/`relation` ref aliases for option resolution and inline-create.
  - **NavGroup.checkIsActive**: now query-aware. Order-status style items that
    share a path but differ only by a query param (`?status=reception` vs
    `?status=delivery`) light up one at a time instead of all together; an item
    that declares query params must match the current href's query exactly
    (after normalization, with transient `f_` filter params stripped), while
    query-less links keep matching on path alone.

### Patch Changes

- Updated dependencies [da8139d]
  - @asteby/metacore-ui@2.1.2

## 13.9.0

### Minor Changes

- 27b37f3: feat(dynamic-columns): declarative pro cell renderers for dynamic tables

  Adds a library of declarative cell renderers so columns are rendered
  beautifully out of the box instead of raw text. Driven by `col.cellStyle`
  (or `col.type`), resolved via the existing `renderAs = col.cellStyle ?? col.type`.
  Config is read from `col.styleConfig`, tolerating both snake_case (kernel) and
  camelCase (compiled models).

  New cellStyles:
  - `url` / `link` — clickable link with an `ExternalLink` icon. `styleConfig`:
    `{ label_field?, url_field?, icon?, new_tab? }`. Shows `label_field` text or
    the URL hostname; opens in a new tab for external URLs (or `new_tab`);
    prefixes `https://` when the scheme is missing.
  - `email` — `mailto:` link with a `Mail` icon.
  - `currency` — `Intl.NumberFormat` currency formatting, right-aligned.
    Currency from `styleConfig.currency` (default `USD`), decimals from
    `styleConfig.decimals` (default 2). No hardcoded MXN.
  - `number` — thousands-separated number, right-aligned.
  - `percent` / `progress` — progress bar (shadcn `Progress`) + `NN%` label.
  - `badge` (generic) — pills a plain value even without `options`/`searchEndpoint`.
  - `status` — badge with semantic color by value (active/paid→green,
    pending/draft→amber, cancelled/failed→red, else grey); explicit
    `options` colors win.
  - `tags` — array / comma-separated string → row of small badges.
  - `color` — color swatch + hex code.
  - `code` / `truncate-text` — monospaced, truncated (`styleConfig.max_length`)
    with a hover copy button.
  - `creator` / `user` — avatar + name + subtitle, generalising the existing
    `avatar`/`search` renderer (name from `styleConfig.name_field`, photo from a
    sibling `.avatar`/`.photo` or `base_path + value`, initials fallback).

  Also improves the existing `boolean` cell (green `Check` / muted `Minus` icon)
  without breaking the `avatar`/`search`, `date`, `phone`, `image`,
  `media-gallery`, `badge+options` and `relation-badge-list` renderers.

## 13.8.5

### Patch Changes

- acb5dcc: fix: every basic `select` field fills its column (`w-full`). shadcn's SelectTrigger defaults to `w-fit`, so enum/option selects shrank to their content instead of aligning with text inputs and FK comboboxes. Covers the declarative action modal (`ActionModalDispatcher`), the record dialog, and line-item rows — the actual renderers behind a model's `placement:create` modal.

## 13.8.4

### Patch Changes

- 7465943: fix(dynamic-form): basic `select` fields fill their column (`w-full`). shadcn's SelectTrigger defaults to `w-fit`, so enum/option selects shrank to their content instead of lining up with text inputs and FK comboboxes. Applies to both the plain `select` renderer and `RefSelect`.

## 13.8.3

### Patch Changes

- dc3d079: fix(dynamic-select): constrain the combobox+"+" row to its grid cell. The wrapper lacked `w-full min-w-0`, so in a 2-column form the row sized to its content (the long empty-state placeholder) and overflowed the column, pushing the inline-create "+" off-screen — it only fit once a short value was selected. Add `w-full min-w-0`.
- 177415d: fix(dynamic-select): repair JSX syntax broken in #332 — the wrapper-row comment was a sibling of the root element inside `return (`, which is invalid and failed the release build (TS1005). Moved it to a `//` comment above `return`. The `w-full min-w-0` grid-cell constraint (the actual `+`-overlap fix) is unchanged.

## 13.8.2

### Patch Changes

- 9bc3870: fix(dynamic-select): truncate the placeholder/value so it never overlaps the inline-create "+". The label span lacked `min-w-0`, so a long empty-state placeholder ("Buscar categoría (opcional)…") grew past the trigger and overlapped the "+". Add `min-w-0 flex-1 truncate`.

## 13.8.1

### Patch Changes

- efac939: fix(dynamic-select): the inline-create "+" no longer overlaps the combobox. The trigger used `w-full` which, in the flex row beside the "+", forced 100% width and overlapped the button in narrow (2-column) modal grids. Use `flex-1 min-w-0` so it grows to fill the space left for the "+".

## 13.8.0

### Minor Changes

- ab80937: feat(dynamic-select): inline "+" to create the referenced record. A dynamic_select with a `ref` now shows a "+" button that opens the referenced model's OWN create modal (via a decoupled `metacore:create-record` window event the host handles) and auto-selects the newly created record. Lets users add a missing Category/Brand/etc. without leaving the form.

## 13.7.0

### Minor Changes

- 33165d2: feat(dynamic-table): card-per-row layout on mobile. On phones the multi-column data table forced a wide horizontal scroll; below the `sm` breakpoint the table is now replaced by a stacked card list (one card per row, columns shown as label : value pairs, row actions pinned at the bottom). Desktop keeps the classic table.

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

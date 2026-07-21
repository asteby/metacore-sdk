# @asteby/metacore-ui

## 2.12.1

### Patch Changes

- 33e0e3b: Avatares de referencia con esquina visible: `rounded-sm` (2px) a 24px se percibe
  como círculo; pasa a `rounded-md` en la inicial (`InitialsAvatar`) y en el thumb
  de imagen (`RelationThumbnail`), para que imagen e inicial lean como cuadrado
  redondeado. `rounded='full'` queda para avatares de persona/marca.

## 2.12.0

### Minor Changes

- 9bd4d4e: Relation avatars render monochrome instead of one color per row.

  `InitialsAvatar` gains a `tone` prop. `auto` (the default, unchanged) keeps the
  per-name palette hash, which is meaningful for a small stable value set such as
  a category or a status. The three relation surfaces — the dynamic-table relation
  cell, the select options and the read-only detail dialog — now pass `neutral`,
  which paints every imageless avatar the same muted surface. For open-ended
  references like products or warehouses the derived color carried no meaning and
  a listing rendered as a rainbow. Records that have an image are unaffected.

## 2.11.0

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

## 2.10.1

### Patch Changes

- fd1f51c: fix(sidebar): only the most-specific sibling highlights on a filtered view

  Two nav items over the same model — a bare one (`/m/transfers`) and a per-status
  one (`?f_status=eq:completed`) — both lit up on a filtered URL, because a
  filter-less item matches on path alone (so a manual filter keeps the base lit).
  New `resolveActiveItemUrls` breaks the tie among siblings: when a sibling
  declares exactly the active filter it wins and the bare item is not highlighted,
  while manual filtering (no sibling declares it) still lights the base.

## 2.10.0

### Minor Changes

- 0704d54: Add `Modal` and `Wizard` primitives (AST-18 Phase 0c). New subpath entries `@asteby/metacore-ui/modal` (`Modal`, `FormModal`) and `@asteby/metacore-ui/wizard` (`Wizard`, wizard context) for building multi-step flows and form dialogs on top of the shared dialog primitives.

## 2.9.3

### Patch Changes

- 1b0ac90: fix(nav): el matcher activo del sidebar trata `f_col=eq:valor` y `f_col=valor` como el mismo filtro — las entradas por estado vuelven a pintarse activas después de que la tabla normaliza la URL.

## 2.9.2

### Patch Changes

- 3db80ab: fix(data-table/kanban): indicadores de filtro sin duplicados y tarjetas kanban con relaciones resueltas
  - El botón "Limpiar filtros" del toolbar ya no muestra badge de conteo y solo aparece para el estado propio de la tabla (column filters / búsqueda); los filtros dinámicos ya tienen su fila de chips con "Limpiar todo".
  - El icono de filtro del header de columna ya no superpone un badge de conteo: el icono en color primary es el único indicador activo.
  - `f_<col>=eq:<valor>` en la URL se desenvuelve al valor plano, por lo que el chip muestra la etiqueta de la opción ("Estado: Recepción") en vez de `eq:reception`.
  - Las tarjetas del kanban resuelven columnas FK (`<rel>_id`) al objeto hermano resuelto por el backend (nombre/label) en vez del UUID crudo, y un FK UUID-cero se muestra como vacío (—).

## 2.9.1

### Patch Changes

- 68a6844: El popover de facetas ya no muestra dos inputs de texto: el buscador de
  valores dobla como filtro "contiene" (fila `Contiene: "…"` que aplica un
  match ILIKE), eliminando el input "Contiene texto…" duplicado.

## 2.9.0

### Minor Changes

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

## 2.8.0

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

## 2.7.0

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

## 2.6.2

### Patch Changes

- cefba67: Nav active-state resolves a view-less URL to the model's real default view_type; new responsive `HeaderActions` overflow for the mobile header

  **Sidebar nav: view-less landing now lights exactly the right sibling.** The
  previous fix (2.6.1) hardcoded "no `?view`" as the list/table surface
  (`DEFAULT_VIEW_BUCKETS`), which is wrong for a model whose default `view_type`
  is `kanban`: landing on `/m/github_issues?per_page=15` (no `?view`, but it
  RENDERS the board because the model default is kanban) could light BOTH the
  "Tablero" (`?view=kanban`) and the "Issues" (`?view=list`) nav items. The
  matcher now resolves an absent `?view=` to the **model's actual default
  view_type** (mirroring `DynamicView.resolveActiveView`), so a view-less URL
  lights the board on a kanban-default model and the list on a list-default model
  — never both, never the wrong one. Explicit `?view=kanban`/`?view=list` URLs
  match their item directly.
  - `checkIsActive(href, item, mainNav?, defaultView?)` gains an optional
    `defaultView` (the model's `view_type`). `NavLinkItem` gains an optional
    `defaultView` field; `NavGroup` threads it into every `checkIsActive` call.
    Hosts populate it from `metadata.view_type`. Omitted → an absent `?view`
    resolves to `''` (a view-less URL only matches a view-less item, never two
    explicit-view siblings). Ported to the `starter-core` scaffold copy.
  - Tests: 21 matcher cases (covers default=kanban → only board, default=list →
    only list, explicit `?view=kanban`/`?view=list`, and the no-default fallback).

  **Mobile header overflow (`HeaderActions`).** On phones the secondary header
  toggles (search, dark-mode, print, settings, update badge, notifications…)
  overflowed and looked cramped. New `HeaderActions` component (exported from
  `@asteby/metacore-ui/layout`): renders its children inline on `sm:`+ and, below
  `sm`, collapses them into a single kebab overflow trigger that opens a popover
  with the toggles stacked. A pending count bubbles onto the trigger via
  `overflowBadge` so notifications stay visible while collapsed. Purely
  Tailwind-driven (`hidden sm:flex` / `flex sm:hidden`) — no resize listeners; a
  Popover (not a DropdownMenu) hosts the overflow so toggles that open their own
  menus still work. Hosts wrap their `headerChildren` with `<HeaderActions
overflowBadge={…}>…</HeaderActions>`; the avatar stays a sibling outside it.

## 2.6.1

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

## 2.6.0

### Minor Changes

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

## 2.5.2

### Patch Changes

- 28e1939: Header: hide the vertical separator next to the sidebar trigger on phones — in the compressed mobile header it sat visually glued to the next control (search, icons) and read as a stray line behind it.

## 2.5.1

### Patch Changes

- 0d0d652: Column sort menu gains a "Quitar orden" item (shown only when the column is
  sorted) that clears the column's sort via `column.clearSorting()`, returning it
  to the neutral unsorted (↕) state.

## 2.5.0

### Minor Changes

- 8439e9e: NavGroup: nav items now accept a numeric `badge` (`badge?: number | string`),
  rendered as a small pill to the right of the label. A numeric `0` is treated as
  "no badge" and renders nothing, so consumers can pass a raw count without
  guarding the falsy-zero JSX case. Works on link, collapsible and collapsed
  dropdown items.

## 2.4.2

### Patch Changes

- b5c8f5f: Data-table filter polish:
  - The selected-option checkbox in the column filter dropdown now uses the
    contrast-guaranteed `foreground`/`background` pair, so the checkmark stays
    legible in dark mode even when a brand's `primary`/`primary-foreground` pair
    collapses to dark-on-dark.
  - `FilterableColumnHeader` (`@asteby/metacore-ui`) gains the `date_range`
    filter: a compact range calendar for date/datetime columns (react-day-picker,
    already a dependency), emitting a `"YYYY-MM-DD_YYYY-MM-DD"` value.

## 2.4.1

### Patch Changes

- 5047fb9: Fix sidebar active-state for per-status nav entries. `checkIsActive` /
  `splitHref` previously stripped ALL `f_` filter params as "transient table
  state", so addon nav entries that encode their identity in an `f_` filter
  (e.g. an Orders group with Reception / In Progress / Ready / Delivered each
  pointing at `/m/orders?f_status=eq:<status>`) collapsed to the same path and
  ALL highlighted at once. Now `f_` filters an item declares in its OWN url are
  treated as its identity (must be present in the current href), while items
  that declare no filter still highlight on path alone — so a manually-filtered
  table keeps its base item lit. One status entry lights up at a time.

## 2.4.0

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

## 2.3.0

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

## 2.2.0

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

## 2.1.2

### Patch Changes

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

## 2.1.1

### Patch Changes

- bd5981a: fix(data-table): responsive toolbar on mobile. The toolbar was a single non-wrapping `justify-between` row, so on a phone the search input plus the Exportar/Importar action buttons overflowed off-screen. It now stacks vertically on mobile (full-width search on top, wrapping action buttons below) and keeps the horizontal layout from `sm` up.

## 2.1.0

### Minor Changes

- 3b40ed5: Helpers genéricos de navegación de addons en `@asteby/metacore-ui/layout`: `resolveIconName` (resuelve cualquier ícono Lucide con fallback neutro), `humanizeNavKey`/`translateNavTitle` (red de seguridad i18n: una key namespaced sin traducir degrada al último segmento humanizado en vez de filtrar la key cruda) y `addonGroupToCollapsibleItem` (convierte un grupo de addon en un item padre colapsable con ícono e hijos indentados, la forma que `<NavGroup>` renderiza como dropdown). Con esto cualquier addon de terceros se ve pro por defecto, sin que el autor declare íconos ni i18n.

## 2.0.1

### Patch Changes

- 8ce56cb: fix(layout): prevent horizontal overflow on mobile in authenticated shell

  The authenticated shell could overflow horizontally on narrow viewports
  (~390px), cutting off the search button under the SidebarTrigger and
  pushing dashboard cards out of view.

  Root causes:
  - `SidebarInset` is a flex item but lacked `min-w-0`, so its children
    could expand it beyond the viewport (flex items default to
    `min-width: auto`).
  - The `Header` inner row used a fixed `gap-3 p-4` even on small screens,
    and `SidebarTrigger` + `Separator` were not marked `shrink-0`, allowing
    the layout to negotiate widths unpredictably.
  - The `headerChildren` wrapper in `AuthenticatedLayout` did not establish
    `min-w-0`, so wide children (e.g. a search button with `w-full flex-1`)
    could push the header beyond the inset.

  Fixes are purely stylistic and backward compatible: added `min-w-0` to
  `SidebarInset`, the header inner row, and the `headerChildren` wrapper;
  tightened mobile padding to `px-3 py-2` (full padding restored at `sm:`);
  marked `SidebarTrigger` and the vertical `Separator` as `shrink-0`.

## 2.0.0

### Minor Changes

- 64de425: Promote shared app components into `@asteby/metacore-ui/shared`:
  - `DatePicker` — a `react-day-picker`-backed popover field, brand-neutral.
  - `ComingSoon` — translated placeholder for routes that aren't built yet. Translation keys: `coming_soon.default_title`, `coming_soon.default_description`, `coming_soon.access_soon`.
  - `Search` — header search trigger button. Now decoupled from `useSearch`; consumers pass an `onOpen` callback (typically wired to `useSearch().setOpen(true)` from `@asteby/metacore-app-providers`).

  `date-fns` is now an optional peer dependency (already pulled in transitively via `react-day-picker`; declaring it explicitly avoids module-resolution surprises in apps that shake out the transitive copy).

  Existing `LongText`, `PasswordInput`, and `SelectDropdown` (already shipped under `./dialogs`) cover three of the components that were duplicated in `link/` and `ops/` — apps should drop their local copies and import from `@asteby/metacore-ui` instead.

## 0.7.0

### Minor Changes

- 3450876: Add `getInitials(name)` helper to `@asteby/metacore-ui/lib`.

  Pulls a duplicated 6-line snippet (`name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()`) out of every avatar across the platform — chat headers, profile dropdowns, dynamic-table avatar cells, sidebar nav. Trims whitespace, caps token count, and falls back to a single character when the input is empty.

  `runtime-react`'s avatar cell renderer now uses it; visually identical, one less inline lambda.

## 0.6.0

### Minor Changes

- 1c93e68: Widen `ColumnFilterMeta` to cover every filter shape metacore apps use today.
  - New `ColumnFilterType` export — canonical union for `filterType`, now
    including `'date_range'` (used by date-picker-backed columns in
    dynamic-table).
  - New optional `filterSearchEndpoint` field — async server-driven option
    lookup for large option sets, consumed by the app's
    `/api/options/:model?field=` endpoint (as produced by
    `kernel/dynamic.Service.Options`).

  Both additions are backwards compatible: existing `ColumnFilterMeta`
  consumers keep compiling, the new variants are opt-in. Apps that were
  widening the type locally (e.g. with
  `ColumnFilterMeta & { filterSearchEndpoint?: string }`) can drop the
  intersection.

## 0.5.0

### Minor Changes

- 317b021: Add two new subpath exports that apps were maintaining as byte-duplicated
  local copies:
  - **`/icons`**, **`/icons/brand`**, **`/icons/custom`** — 16 brand icons
    (Discord, Docker, Facebook, Figma, GitHub, GitLab, Gmail, Medium,
    Notion, Skype, Slack, Stripe, Telegram, Trello, WhatsApp, Zoom) and
    9 custom icons (layout variants, sidebar variants, theme variants).
    `IconDir` stays in the apps for now — it consumes a direction
    provider that is a separate promotion candidate.
  - **`/error-pages`** — `NotFoundError`, `GeneralError`, `UnauthorisedError`,
    `ForbiddenError`, `MaintenanceError`. Standard full-page error
    components using `@tanstack/react-router`. Apps drop their copies in
    `features/errors/*` and import from here.

## 0.3.0

### Minor Changes

- e23eede: Publicación inicial a npm del ecosistema metacore.

  Propaga los 13 paquetes del SDK al registry público para que las host applications consumidoras migren de `file:` a semver y Renovate pueda propagar updates.

## 0.2.0

### Minor Changes

- Add primitives: accordion, calendar, card, context-menu, multi-select, progress, radio-group. Descartados por no ser genéricos: image-upload (host-app-específico), code-editor (Monaco pesado), phone-input (i18n hardcoded).
- 6d243b0: Initial release of the metacore frontend ecosystem.

  11 packages extracted from host application frontends into a publishable monorepo with auto-propagation via Changesets + Renovate.

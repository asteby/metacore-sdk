# @asteby/metacore-ui

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

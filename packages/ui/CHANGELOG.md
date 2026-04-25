# @asteby/metacore-ui

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

  Propaga los 13 paquetes del SDK al registry público para que apps consumidoras (ops, link) migren de `file:` a semver y Renovate pueda propagar updates.

## 0.2.0

### Minor Changes

- Add primitives: accordion, calendar, card, context-menu, multi-select, progress, radio-group. Descartados por no ser genéricos: image-upload (link-específico), code-editor (Monaco pesado), phone-input (i18n hardcoded).
- 6d243b0: Initial release of the metacore frontend ecosystem.

  11 packages extracted from ops/link frontends into a publishable monorepo with auto-propagation via Changesets + Renovate.

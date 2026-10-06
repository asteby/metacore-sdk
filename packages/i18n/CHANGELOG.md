# @asteby/metacore-i18n

## 29.1.0

### Minor Changes

- 4d97e6b: «Crear desde» con renglones y cantidad pendiente en el DocumentEditor. Una fuente (`document_forms.types[].sources[]`) que declara `line_link_field`, `remaining_qty_field` o `remaining_endpoint` precarga sus renglones desde lo que sirve el host (`<endpoint>/source-lines`, kernel ≥ v0.191): la cantidad sugerida y el tope son lo pendiente (cantidad − lo ya facturado/devuelto, calculado en el servidor), los renglones ya cubiertos se omiten con un aviso breve y cada renglón guarda `source_line_id`, que se envía en la columna `line_link_field` para que el servidor valide al guardar (su rechazo en español se muestra tal cual). Sin `source-lines` (404) cae a la relación como antes. Un tipo con `sources` usa el editor salvo `layout: "wizard"`; `DocumentFormDialog` abre el editor cuando recibe `initialSource`, y `DynamicCRUDPage` acepta `initialCreate` para abrir el alta con tipo y origen (p. ej. desde la URL). Las acciones de fila `type: "link"` con query (`?create=…&from_id={id}`) navegan con `search` (antes la query quedaba en el path y la ruta no casaba); los valores interpolados van codificados. `serializeLineItems(lines, { sourceLineField })`, `sourceLoadSummary` y `sourceTracksRemaining` exportados del modelo del editor; cada renglón serializado lleva además `subtotal` y `tax_amount` calculados (modelos de renglón sin tasa no pierden el IVA) y `linesFromSource` respeta `discount_mode: "amount"`. i18n es/en de los avisos de carga.

### Patch Changes

- f9616d1: Un solo registro para modales, slots y acciones, y acciones secundarias fuera de la vista principal:

  - `@asteby/metacore-sdk` es la única fuente de verdad: `registerModalComponent` (modales por slug, con addon dueño y `load` perezoso), `registerRecordAction` (acciones secundarias sobre registros con su proveedor `requires: { addon | capability }`) y `slotStore`. `Registry.scope(addon).registerModal/registerAction/registerSlot` escriben ahí (antes `registerModal` no tenía lector) y `unbind` lo retira todo. `adaptActionProps` entrega a un remote ambos contratos de props (ActionModalProps y recordId/payload/close).
  - `registerFederatedModal` queda como alias deprecado y compatible de `registerModalComponent`; `slotRegistry` y `<Slot>` de runtime-react leen el `slotStore` del SDK y no pintan contribuciones de addons no instalados.
  - Acciones primarias/secundarias: `priority` del manifest v3 (o convención por clave: print, share, email, mail, whatsapp, chat, download, pdf, xml, acuse). `RowActionsMenu` (menú «…» por defecto de DynamicTable) muestra una primaria destacada y agrupa las secundarias y las aportadas por addons en «Más…»; las acciones por capacidad sin proveedor activo no se ofrecen. `DocumentPage` manda las secundarias de su layout a `DocumentSecondaryBar` (pie) y `resolveActions` devuelve el nuevo grupo `footer`.
  - i18n: `datatable.more_actions`, `datatable.open_menu`, `datatable.secondary_actions` (es/en).

## 29.0.0

### Patch Changes

- Updated dependencies [4371f2c]
  - @asteby/metacore-ui@2.24.0

## 28.0.0

### Patch Changes

- Updated dependencies [afce99b]
- Updated dependencies [80ff0ba]
  - @asteby/metacore-ui@2.23.0

## 27.0.0

### Minor Changes

- 9292ef9: Los toasts se cierran con una "x" al estilo de macOS. El `Toaster` de `@asteby/metacore-ui/primitives` agrega a cada toast (success, error, info, warning, loading, con acción y `toast.custom`) un botón circular de 18 px en la esquina superior izquierda, de vidrio con los tokens del tema, que aparece con fade y escala al pasar el mouse o enfocar con teclado y queda siempre visible en pantallas táctiles. El auto-cierre sigue pausado mientras el mouse está encima. Se desactiva con `closeButton={false}` (o por toast con `closeButton: false` / `dismissible: false`); `closeButtonLabel` fija el `aria-label`, que por defecto sale de la clave `toast.dismiss` ("Cerrar notificación" / "Dismiss notification"), nueva en `@asteby/metacore-i18n`. El `Toaster` de `@asteby/metacore-starter-core` ahora envuelve el de `@asteby/metacore-ui`.

### Patch Changes

- Updated dependencies [7128a39]
- Updated dependencies [9292ef9]
  - @asteby/metacore-ui@2.22.0

## 26.0.0

### Patch Changes

- Updated dependencies [bd81d54]
  - @asteby/metacore-ui@2.21.0

## 25.0.0

### Patch Changes

- Updated dependencies [d78aacf]
  - @asteby/metacore-ui@2.20.0

## 24.0.0

### Patch Changes

- Updated dependencies [5f872f0]
  - @asteby/metacore-ui@2.18.0

## 23.0.0

### Patch Changes

- Updated dependencies [6fb08b7]
  - @asteby/metacore-ui@2.17.0

## 22.0.1

### Patch Changes

- 7bff072: Locale-aware FilePickButton: hide native file chrome so labels follow app language (es/en). UploadField and ImportDialog use it.

## 22.0.0

### Patch Changes

- Updated dependencies [5c51b7f]
  - @asteby/metacore-ui@2.16.0

## 21.0.0

### Patch Changes

- Updated dependencies [d122ae0]
  - @asteby/metacore-ui@2.15.0

## 20.0.0

### Patch Changes

- Updated dependencies [30fe202]
  - @asteby/metacore-ui@2.14.0

## 19.0.0

### Patch Changes

- Updated dependencies [e801041]
  - @asteby/metacore-ui@2.13.0

## 18.0.0

### Patch Changes

- Updated dependencies [9bd4d4e]
  - @asteby/metacore-ui@2.12.0

## 17.0.0

### Patch Changes

- Updated dependencies [ee5f7e8]
  - @asteby/metacore-ui@2.11.0

## 16.0.0

### Patch Changes

- Updated dependencies [0704d54]
  - @asteby/metacore-ui@2.10.0

## 15.0.0

### Patch Changes

- Updated dependencies [25a78e7]
  - @asteby/metacore-ui@2.9.0

## 14.0.0

### Patch Changes

- Updated dependencies [bd30e57]
  - @asteby/metacore-ui@2.8.0

## 13.0.0

### Patch Changes

- Updated dependencies [84aeaf2]
  - @asteby/metacore-ui@2.7.0

## 12.0.0

### Patch Changes

- Updated dependencies [3f41073]
  - @asteby/metacore-ui@2.6.0

## 11.0.0

### Patch Changes

- Updated dependencies [8439e9e]
  - @asteby/metacore-ui@2.5.0

## 10.0.0

### Patch Changes

- Updated dependencies [5f864d9]
  - @asteby/metacore-ui@2.4.0

## 9.0.0

### Patch Changes

- Updated dependencies [ab41d75]
  - @asteby/metacore-ui@2.3.0

## 8.0.0

### Patch Changes

- Updated dependencies [6299af7]
  - @asteby/metacore-ui@2.2.0

## 7.0.1

### Patch Changes

- a9db218: fix(addon-i18n): never overwrite a cached bundle with an empty fetch result

  useAddonI18n re-validates the addon i18n bundle from the Hub in the background.
  fetchAddonI18n returns `{}` on a 404 or empty response, and the hook applied it
  unconditionally — so a transient Hub hiccup blanked the live labels AND wrote `{}`
  to localStorage, poisoning the cache for 6h. The sidebar then fell back to
  humanized keys (e.g. "accounting.nav.group" → "Group") intermittently. An empty
  result is now treated as "no update", leaving the cached/installed bundle intact.

## 7.0.0

### Patch Changes

- Updated dependencies [3b40ed5]
  - @asteby/metacore-ui@2.1.0

## 6.0.0

### Patch Changes

- Updated dependencies [64de425]
  - @asteby/metacore-ui@2.0.0

## 5.1.0

### Minor Changes

- 0d1a6f5: Add `useAddonI18n` + `useAddonNames` hooks under `@asteby/metacore-i18n/addon-i18n` that fetch each addon's manifest i18n bundle from the Hub and stay reactive to `useLocale()`. Memory + localStorage cache with 6h TTL. The starter sidebar now uses `useAddonNames` so the installed-addon list shows the localised display name and live-updates on language switch — no reinstall required.

  Resolution order in the sidebar: Hub-published manifest i18n → install-time `row.name` (set by the Hub iframe at click time) → raw `addon_key`.

  Pairs with `asteby-hq/hub#73` adding the `/v1/addons/{key}/i18n/{lang}.json` endpoint.

## 5.0.1

### Patch Changes

- db1a224: Fix raw i18n keys leaking into the auto-generated CRUD actions dropdown.

  The auto-Actions column shipped in 7.1.0 looked up `datatable.view_record`, `datatable.edit` and `datatable.delete` — keys that didn't exist in `@asteby/metacore-i18n/locales`, so i18next fell back to the key string and the dropdown rendered "datatable.view_record" instead of "Ver".

  Two fixes:
  - `@asteby/metacore-i18n`: add `datatable.edit` and `datatable.delete` to the base ES/EN bundles (alongside the pre-existing `datatable.view`).
  - `@asteby/metacore-runtime-react`: lookup `datatable.view` (the real key) and pass `{ defaultValue }` to every action label so a missing bundle never leaks the key into the UI.

## 5.0.0

### Patch Changes

- Updated dependencies [3450876]
  - @asteby/metacore-ui@0.7.0

## 4.0.0

### Patch Changes

- Updated dependencies [1c93e68]
  - @asteby/metacore-ui@0.6.0

## 3.0.0

### Patch Changes

- Updated dependencies [317b021]
  - @asteby/metacore-ui@0.5.0

## 2.0.0

### Minor Changes

- e23eede: Publicación inicial a npm del ecosistema metacore.

  Propaga los 13 paquetes del SDK al registry público para que las host applications consumidoras migren de `file:` a semver y Renovate pueda propagar updates.

### Patch Changes

- Updated dependencies [e23eede]
  - @asteby/metacore-ui@0.3.0

## 1.0.0

### Minor Changes

- 6d243b0: Initial release of the metacore frontend ecosystem.

  11 packages extracted from host application frontends into a publishable monorepo with auto-propagation via Changesets + Renovate.

### Patch Changes

- Updated dependencies
- Updated dependencies [6d243b0]
  - @asteby/metacore-ui@0.2.0

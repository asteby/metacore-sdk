# @asteby/metacore-notifications

## 26.0.0

### Patch Changes

- Updated dependencies [d1ffa4f]
  - @asteby/metacore-websocket@1.0.0

## 25.0.1

### Patch Changes

- 768e15b: Derive a deterministic notification id (ntf:<event>:<record_id> from the
  payload metadata) before falling back to randomUUID in ingestWsPayload —
  the same notification arrives over both WS and SSE by design, and the
  random fallback on one path made seenIdsRef unable to collapse the pair,
  rendering every declarative notification twice.

## 25.0.0

### Patch Changes

- Updated dependencies [6fb08b7]
  - @asteby/metacore-ui@2.17.0

## 24.0.9

### Patch Changes

- 431f813: Strip trailing zeros on quantity tokens in notification bodies (e.g. `-1.0000 ud` → `-1 ud`).

## 24.0.8

### Patch Changes

- d26f5ad: Make toast action buttons (Recargar / Actualizar) reliably clickable: pointer-events, defer handler after dismiss.

## 24.0.7

### Patch Changes

- d3c3cd6: Bell dropdown: drop the left accent bar and vertically center the icon against the text block.

## 24.0.6

### Patch Changes

- ae83011: Polish bell dropdown + toast: compact rows, high-contrast white icons, straight accent bar, and rich body text (safe HTML + auto-emphasis for folios/quantities).

## 24.0.5

### Patch Changes

- 0048532: Clean up the notifications bell dropdown: remove scalloped left borders, flatter rows, readable module chips, quieter badge.

## 24.0.4

### Patch Changes

- 9bf2beb: Restore toast action/cancel buttons (Recargar, Actualizar) and use a fixed 360px card width for every unified toast.

## 24.0.3

### Patch Changes

- 205cb4b: Center toast title vertically when there is no description (or module chip).

## 24.0.2

### Patch Changes

- ff08865: Toast stack without ghost card (unstyled), unique ids for concurrent toasts, and optional persist hook so control toasts land in the bell inbox.

## 24.0.1

### Patch Changes

- b7c5480: Republish SSE stream, unified toast, and dynamic visuals — npm already had a stale 24.0.0 (Aug 23) so the major release could not publish the new code under that version.

## 24.0.0

### Major Changes

- 3ae1afb: Unified next-level notifications: SSE stream, canonical card toast (installUnifiedToasts), dynamic Lucide icons / severity colors / module chips (addon_key).

## 23.0.1

### Patch Changes

- 7Leguas wave: registry action bridge, dynamic record/columns display, addon-loader error UX, notifications dropdown polish.

## 23.0.0

### Patch Changes

- Updated dependencies [d122ae0]
  - @asteby/metacore-ui@2.15.0

## 22.0.0

### Patch Changes

- Updated dependencies [30fe202]
  - @asteby/metacore-ui@2.14.0

## 21.0.0

### Patch Changes

- Updated dependencies [e801041]
  - @asteby/metacore-ui@2.13.0

## 20.0.0

### Patch Changes

- Updated dependencies [46f4cce]
  - @asteby/metacore-websocket@0.5.0

## 19.0.0

### Patch Changes

- Updated dependencies [9bd4d4e]
  - @asteby/metacore-ui@2.12.0

## 18.0.0

### Patch Changes

- Updated dependencies [ee5f7e8]
  - @asteby/metacore-ui@2.11.0

## 17.0.0

### Patch Changes

- Updated dependencies [0704d54]
  - @asteby/metacore-ui@2.10.0

## 16.0.0

### Patch Changes

- Updated dependencies [25a78e7]
  - @asteby/metacore-ui@2.9.0

## 15.0.0

### Patch Changes

- Updated dependencies [bd30e57]
  - @asteby/metacore-ui@2.8.0

## 14.0.0

### Patch Changes

- Updated dependencies [84aeaf2]
  - @asteby/metacore-ui@2.7.0

## 13.0.0

### Patch Changes

- Updated dependencies [3f41073]
  - @asteby/metacore-ui@2.6.0

## 12.0.0

### Patch Changes

- Updated dependencies [8439e9e]
  - @asteby/metacore-ui@2.5.0

## 11.0.0

### Patch Changes

- Updated dependencies [5f864d9]
  - @asteby/metacore-ui@2.4.0

## 10.0.0

### Patch Changes

- Updated dependencies [ab41d75]
  - @asteby/metacore-ui@2.3.0

## 9.0.0

### Patch Changes

- Updated dependencies [6299af7]
  - @asteby/metacore-ui@2.2.0

## 8.0.0

### Patch Changes

- Updated dependencies [3b40ed5]
  - @asteby/metacore-ui@2.1.0

## 7.0.0

### Patch Changes

- Updated dependencies [0f3efbe]
  - @asteby/metacore-websocket@0.4.0

## 6.0.0

### Patch Changes

- Updated dependencies [64de425]
  - @asteby/metacore-ui@2.0.0

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
  - @asteby/metacore-websocket@0.3.0

## 1.0.0

### Minor Changes

- 6d243b0: Initial release of the metacore frontend ecosystem.

  11 packages extracted from host application frontends into a publishable monorepo with auto-propagation via Changesets + Renovate.

### Patch Changes

- Updated dependencies
- Updated dependencies [6d243b0]
  - @asteby/metacore-ui@0.2.0
  - @asteby/metacore-websocket@0.2.0

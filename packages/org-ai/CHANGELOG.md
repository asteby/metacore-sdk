# @asteby/metacore-org-ai

## 2.0.2

### Patch Changes

- Updated dependencies [2393365]
  - @asteby/metacore-lib@0.11.0

## 2.0.1

### Patch Changes

- 46da5c6: `@asteby/metacore-lib/envelope`: una sola implementación del envelope `{success,data,meta}` y de los mensajes de error. Nuevos `unwrapEnvelope(body)`, `unwrapResponse(res)`, `unwrapList(body)` / `unwrapListResponse(res)` (`items` + `meta.total`), `ApiError` / `isApiError`, `isEnvelope`, `getApiErrorMessage(err, fallback)` e `isAbortError`. Los `unwrap` locales de automations, dataload, org-ai, billing, runtime-react y agent-workspace usan ahora este módulo (agent-workspace sigue re-exportando `getApiErrorMessage`). CI rechaza `.data.data` nuevo (`scripts/check-no-data-data.mjs`, baseline ratcheteado).
- Updated dependencies [46da5c6]
  - @asteby/metacore-lib@0.10.0

## 2.0.0

### Patch Changes

- Updated dependencies [944dd83]
  - @asteby/metacore-ui@2.28.0

## 1.0.0

### Patch Changes

- Updated dependencies [019192d]
- Updated dependencies [bdc8a60]
  - @asteby/metacore-ui@2.27.0

## 0.1.0

### Minor Changes

- 0da485e: Add `@asteby/metacore-permissions` (capability feed, role/grant API factory, screen-implied capabilities registry, nav gating helpers and `PermissionsPage`) and `@asteby/metacore-org-ai` (per-org provider/model/API-key settings and the Claude connect dialog). Both take an injected HTTP client, i18n and notifications.

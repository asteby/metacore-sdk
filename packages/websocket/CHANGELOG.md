# @asteby/metacore-websocket

## 0.4.0

### Minor Changes

- 0f3efbe: Add `useWebSocket` React hook + `ReadyState` enum. Native WebSocket API
  wrapper with auto-reconnect — avoids CJS interop issues that break
  `react-use-websocket` under Vite + module federation.

## 0.3.0

### Minor Changes

- e23eede: Publicación inicial a npm del ecosistema metacore.

  Propaga los 13 paquetes del SDK al registry público para que las host applications consumidoras migren de `file:` a semver y Renovate pueda propagar updates.

## 0.2.0

### Minor Changes

- 6d243b0: Initial release of the metacore frontend ecosystem.

  11 packages extracted from host application frontends into a publishable monorepo with auto-propagation via Changesets + Renovate.

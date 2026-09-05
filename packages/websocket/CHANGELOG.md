# @asteby/metacore-websocket

## 1.0.0

### Minor Changes

- d1ffa4f: Cliente realtime de eventos de datos: `createRealtimeClient` (ref-count de modelos, re-suscripción al reconectar, `resync` sintético tras reconexión o `DATA_EVENTS_DROPPED`), `createSocketTransport` (socket propio `wsUrl?channel=org:<id>&token=<jwt>` con backoff) y `transportFromHostSocket` (reusa el socket autenticado del host). Nuevo peer `@asteby/metacore-sdk` para los tipos del contrato.

### Patch Changes

- Updated dependencies [d1ffa4f]
  - @asteby/metacore-sdk@3.7.0

## 0.5.0

### Minor Changes

- 46f4cce: Upstream de la migración doctores.lat:

  - auth: `BaseAuthUser` + `getTypedAuthStore` — el host tipa su propio user
    sobre el store compartido sin castear en cada consumo.
  - websocket: `createChannelClient` — cliente multi-canal imperativo (suscribir/
    desuscribir canales con reconexión), reemplaza los clientes WS ad-hoc de las
    apps.

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

---
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-sdk": minor
---

Los modals federados de acciones abren siempre el componente del addon, nunca un confirmatorio genérico.

- sdk: `subscribeActionComponents(listener)` en el registry de acciones; registrar o quitar un componente notifica a los suscriptores.
- runtime-react: `ActionModalDispatcher` lee el registry de forma reactiva (`useSyncExternalStore`). Una acción con `modal` muestra "Cargando…" mientras el remote carga, pinta el componente en cuanto se registra y, si no llega en 20 s (`FEDERATED_ACTION_MODAL_TIMEOUT_MS`) o el slug es inválido, muestra el error explícito y lo registra con `console.error`.
- runtime-react: `setFederatedActionLoader(fn)` / `FederatedActionLoader` para que el host cargue el remote; el dispatcher lo invoca con `{ model, actionKey, modal }` al abrir y cada 2 s mientras espera.
- runtime-react: `useDynamicRowActions` y `ModelActionToolbar` pasan la definición completa de la acción (antes se perdía `modal`) y el menú de fila abre el dispatcher también para acciones que solo declaran `modal`.

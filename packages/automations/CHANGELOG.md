# @asteby/metacore-automations

## 2.0.1

### Patch Changes

- 46da5c6: `@asteby/metacore-lib/envelope`: una sola implementación del envelope `{success,data,meta}` y de los mensajes de error. Nuevos `unwrapEnvelope(body)`, `unwrapResponse(res)`, `unwrapList(body)` / `unwrapListResponse(res)` (`items` + `meta.total`), `ApiError` / `isApiError`, `isEnvelope`, `getApiErrorMessage(err, fallback)` e `isAbortError`. Los `unwrap` locales de automations, dataload, org-ai, billing, runtime-react y agent-workspace usan ahora este módulo (agent-workspace sigue re-exportando `getApiErrorMessage`). CI rechaza `.data.data` nuevo (`scripts/check-no-data-data.mjs`, baseline ratcheteado).
- Updated dependencies [46da5c6]
  - @asteby/metacore-lib@0.10.0

## 2.0.0

### Patch Changes

- Updated dependencies [944dd83]
  - @asteby/metacore-ui@2.28.0
  - @asteby/metacore-genui@2.0.0

## 1.0.0

### Minor Changes

- 4039e53: Nuevos paquetes. `@asteby/metacore-genui`: UI generativa segura por metadatos — valida (`parseUISpec`) y dibuja especificaciones `genui/v1` del agente con una lista blanca de componentes (texto, KPI, tarjeta, tabla, enlaces, línea de tiempo, gráfica SVG con resumen accesible y formulario de confirmación), sin HTML ni scripts; `createGenerativeUIResult` la registra en el registro de resultados del agente. `@asteby/metacore-automations`: cliente REST, hooks y pantalla de automatizaciones dinámicas (lista con filtros, detalle con autoría «persona con asistente», confirmación de propuestas, pausa/reanudación, simulación, historial y editor generado del JSON Schema `automation/v1`), más `automationUIActionHandler` para las tarjetas del chat.

### Patch Changes

- Updated dependencies [4039e53]
- Updated dependencies [019192d]
- Updated dependencies [bdc8a60]
  - @asteby/metacore-genui@1.0.0
  - @asteby/metacore-ui@2.27.0

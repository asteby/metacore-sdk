# @asteby/metacore-support-ui

## 1.0.0

### Minor Changes

- be5e368: `SupportThread` muestra el boton de adjuntar solo si recibe `uploadAttachment` (nuevo `allowAttachments` para conservar el envio solo por nombre). `Composer` de inbox suma `attachable` (defecto `true`) para ocultar el boton y el selector de archivos.
- be5e368: Alineado con la API de casos de OPS: `createSupportApi` expone paginación keyset (`listCases`, `getCase({before})`, `listMessages` con `X-Next-Cursor`), `reopen`, `channel` en `createCase` y `supportErrorCode` para los códigos `{error:{code}}`; el transporte devuelve `{ data, headers }`. `SupportThread` carga mensajes anteriores, reabre con `api.reopen` y mapea `support_disabled`, `forbidden`, `not_found`, `rate_limited` y `case_resolved` a estados de UI.
- be5e368: Paquete nuevo con `SupportThread` (hilo de soporte con mensajes de persona, agente e IA, estado del caso, adjuntos con miniatura, visor con descarga, aviso de adjunto caducado y composer) y el hook `useSupportThread`. Compuesto con `@asteby/metacore-inbox` y las primitivas de `@asteby/metacore-ui`; el host inyecta el transporte.

### Patch Changes

- Updated dependencies [be5e368]
- Updated dependencies [be5e368]
  - @asteby/metacore-inbox@0.2.0

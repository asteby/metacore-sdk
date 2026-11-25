# @asteby/metacore-support-ui

## 1.1.0

### Minor Changes

- b9c00bf: Chat de equipo: capacidades por canal y tarjeta de caso de soporte.

  - `TeamChatChannel.capabilities?: { calls, reactions, replies, attachments }` (todas `true` por omision; solo un `false` explicito apaga). `TeamChat` oculta llamadas/unirse, el menu de reacciones y de respuesta, y adjuntos/notas de voz segun lo que declare el servidor. Un canal sin la clave se comporta exactamente como antes. Nuevo `resolveChannelCapabilities` y `DEFAULT_CHANNEL_CAPABILITIES`. `TeamChatChannel.thread` (clave del contacto virtual) queda tipado.
  - Un adjunto `{type:"support_case", status, folio, subject?, solution?}` se pinta como tarjeta de caso (estado abierto/resuelto/cerrado, folio, asunto, solucion) en lugar del texto del cuerpo; con estado invalido o sin folio cae al texto. `ChatAttachment` gana `folio`, `subject` y `solution`.
  - Secciones fijadas genericas: `sections` en la respuesta de canales (`{key,title,hint?,actions:[{id,label,icon?,href?}]}`) y `channel.section`; `TeamChat` gana la prop `onSectionAction(sectionKey, actionId)`. Sin `sections` la lista no cambia.
  - `support-ui`: nuevo `SupportCaseCard` (+ `STATUS_VARIANT`, `isSupportCaseStatus`), reutilizado por `SupportThread` y por el chat. `agent-workspace` pasa a tener `@asteby/metacore-support-ui` como peer dependency.
  - `i18n`: claves `supportThread.card.*` (es/en).

## 1.0.0

### Minor Changes

- be5e368: `SupportThread` muestra el boton de adjuntar solo si recibe `uploadAttachment` (nuevo `allowAttachments` para conservar el envio solo por nombre). `Composer` de inbox suma `attachable` (defecto `true`) para ocultar el boton y el selector de archivos.
- be5e368: Alineado con la API de casos de OPS: `createSupportApi` expone paginación keyset (`listCases`, `getCase({before})`, `listMessages` con `X-Next-Cursor`), `reopen`, `channel` en `createCase` y `supportErrorCode` para los códigos `{error:{code}}`; el transporte devuelve `{ data, headers }`. `SupportThread` carga mensajes anteriores, reabre con `api.reopen` y mapea `support_disabled`, `forbidden`, `not_found`, `rate_limited` y `case_resolved` a estados de UI.
- be5e368: Paquete nuevo con `SupportThread` (hilo de soporte con mensajes de persona, agente e IA, estado del caso, adjuntos con miniatura, visor con descarga, aviso de adjunto caducado y composer) y el hook `useSupportThread`. Compuesto con `@asteby/metacore-inbox` y las primitivas de `@asteby/metacore-ui`; el host inyecta el transporte.

### Patch Changes

- Updated dependencies [be5e368]
- Updated dependencies [be5e368]
  - @asteby/metacore-inbox@0.2.0

# @asteby/metacore-support-ui

## 1.2.0

### Minor Changes

- 5519824: Soporte del lado del cliente: un solo vocabulario de estados, eventos como tarjetas y varios tickets por persona (chat de equipo, widget flotante y embed).

  - `support-ui`: vocabulario unico `Nuevo / En atencion / Esperando tu respuesta / Resuelto / Reabierto / Finalizado` (`SUPPORT_STATE_META`, `clientStateOf`, textos `supportThread.state.*`), nuevos `SupportStatusBadge` (con tooltip), `SupportEventCard` (tarjeta de evento: abierto, resuelto, reabierto, finalizado), `SupportTicketList` (agrupada por estado, no leidos, carga de finalizados bajo demanda), `SupportTicketHeader` (volver + selector de ticket), `SupportNewTicketForm` (avisa si ya hay un ticket abierto), `SupportResolvedPrompt` («¿Se resolvio?»: Reabrir, Finalizar, Abrir otro) y `SupportDuplicateNotice`. `SupportThread` usa el vocabulario nuevo, el prompt de resuelto y props opcionales `onBack`, `others`, `onSwitch`, `showHint`, `onFinalize`, `onOpenAnother`; el hook gana `close`. Cambio visible: la insignia de un caso abierto ahora dice Nuevo / En atencion / Esperando tu respuesta en vez de «Abierto», y «Cerrado» pasa a «Finalizado» en las superficies nuevas.
  - `sdk` (`/support`): `SupportLifecycle`, `lifecycle?` y `unread?` aditivos en `SupportCase` / `SupportCaseSummary`, y `api.close?` (`POST /cases/:folio/close`).
  - `agent-workspace`: un contacto con `channel.sub_threads` muestra la lista de tickets (`GET /internal-chat/channels/:id/threads`) y cada ticket es su propio hilo (`thread_id` en los mensajes en vivo), con encabezado, selector, «Nuevo ticket» (`new_thread`) y pie de resuelto; los adjuntos `support_case` con `event` se pintan como tarjetas de sistema, no burbujas (campos aditivos `event`, `state`, `at`, `actions` con `request` declarado por el servidor). Igual en `TeamChat` y en el widget flotante. Sin `sub_threads` ni `event` todo se ve como antes.
  - `support-embed`: al abrir muestra la lista de tickets del visitante con su estado y no leidos (en vez de un hilo mezclado), «Nuevo ticket» siempre visible, aviso con el folio si ya hay uno abierto, y «¿Se resolvio?» con Reabrir (si el canal lo permite) y Abrir otro. «Finalizar» solo aparece donde el transporte ofrece `close` (el widget del Hub aun no).
  - `i18n`: claves `supportThread.state|action|event|resolvedPrompt|closedPrompt|tickets|duplicate|newTicket` (es/en).

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

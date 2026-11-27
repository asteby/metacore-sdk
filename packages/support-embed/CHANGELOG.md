# @asteby/metacore-support-embed

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

- eeb0a64: El widget de soporte soporta tres modos de presentacion: `floating` (como hasta ahora), `inline` (el iframe se monta dentro de un elemento de la pagina; espera al destino con un `MutationObserver` acotado y falla en silencio) y `push` (riel lateral que empuja el contenido). Los valores salen del perfil publico validado (`display_mode`, `inline_target`, `inline_height`, `panel_width`, `offset`, `launcher_shape`, `launcher_label`) y el cliente los sobrescribe con `data-*` (`data-channel`, `data-mode`, `data-target`, ...) o `MetacoreSupport('init', ...)`. Nuevos comandos `init`, `mount`, `unmount`, `toggle`, `setLanguage` y `reset`. Nuevo embed en codigo: componente `<SupportEmbed>` y `mountSupportEmbed(el, opts)`, que reutilizan `SupportFrame` y `createEmbedTransport` sin iframe.

## 1.0.0

### Minor Changes

- be5e368: Nuevo paquete: widget de soporte para sitios de empresas. `loader.js` (iframe + lanzador sin dependencias, `postMessage` con origen verificado en ambos sentidos) y la aplicacion del frame (`SupportThread` sobre `createEmbedTransport`, tema por `PublicProfile` validado, es/en, modo anonimo o identificado con JWT de la empresa). URLs y rutas las inyecta el Hub por `<meta>`.

### Patch Changes

- Updated dependencies [be5e368]
- Updated dependencies [be5e368]
- Updated dependencies [be5e368]
  - @asteby/metacore-support-ui@1.0.0

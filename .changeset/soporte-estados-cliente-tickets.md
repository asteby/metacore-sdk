---
"@asteby/metacore-support-ui": minor
"@asteby/metacore-agent-workspace": minor
"@asteby/metacore-support-embed": minor
"@asteby/metacore-sdk": minor
"@asteby/metacore-i18n": minor
---

Soporte del lado del cliente: un solo vocabulario de estados, eventos como tarjetas y varios tickets por persona (chat de equipo, widget flotante y embed).

- `support-ui`: vocabulario unico `Nuevo / En atencion / Esperando tu respuesta / Resuelto / Reabierto / Finalizado` (`SUPPORT_STATE_META`, `clientStateOf`, textos `supportThread.state.*`), nuevos `SupportStatusBadge` (con tooltip), `SupportEventCard` (tarjeta de evento: abierto, resuelto, reabierto, finalizado), `SupportTicketList` (agrupada por estado, no leidos, carga de finalizados bajo demanda), `SupportTicketHeader` (volver + selector de ticket), `SupportNewTicketForm` (avisa si ya hay un ticket abierto), `SupportResolvedPrompt` («¿Se resolvio?»: Reabrir, Finalizar, Abrir otro) y `SupportDuplicateNotice`. `SupportThread` usa el vocabulario nuevo, el prompt de resuelto y props opcionales `onBack`, `others`, `onSwitch`, `showHint`, `onFinalize`, `onOpenAnother`; el hook gana `close`. Cambio visible: la insignia de un caso abierto ahora dice Nuevo / En atencion / Esperando tu respuesta en vez de «Abierto», y «Cerrado» pasa a «Finalizado» en las superficies nuevas.
- `sdk` (`/support`): `SupportLifecycle`, `lifecycle?` y `unread?` aditivos en `SupportCase` / `SupportCaseSummary`, y `api.close?` (`POST /cases/:folio/close`).
- `agent-workspace`: un contacto con `channel.sub_threads` muestra la lista de tickets (`GET /internal-chat/channels/:id/threads`) y cada ticket es su propio hilo (`thread_id` en los mensajes en vivo), con encabezado, selector, «Nuevo ticket» (`new_thread`) y pie de resuelto; los adjuntos `support_case` con `event` se pintan como tarjetas de sistema, no burbujas (campos aditivos `event`, `state`, `at`, `actions` con `request` declarado por el servidor). Igual en `TeamChat` y en el widget flotante. Sin `sub_threads` ni `event` todo se ve como antes.
- `support-embed`: al abrir muestra la lista de tickets del visitante con su estado y no leidos (en vez de un hilo mezclado), «Nuevo ticket» siempre visible, aviso con el folio si ya hay uno abierto, y «¿Se resolvio?» con Reabrir (si el canal lo permite) y Abrir otro. «Finalizar» solo aparece donde el transporte ofrece `close` (el widget del Hub aun no).
- `i18n`: claves `supportThread.state|action|event|resolvedPrompt|closedPrompt|tickets|duplicate|newTicket` (es/en).

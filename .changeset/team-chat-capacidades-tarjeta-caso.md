---
"@asteby/metacore-agent-workspace": minor
"@asteby/metacore-support-ui": minor
"@asteby/metacore-i18n": minor
---

Chat de equipo: capacidades por canal y tarjeta de caso de soporte.

- `TeamChatChannel.capabilities?: { calls, reactions, replies, attachments }` (todas `true` por omision; solo un `false` explicito apaga). `TeamChat` oculta llamadas/unirse, el menu de reacciones y de respuesta, y adjuntos/notas de voz segun lo que declare el servidor. Un canal sin la clave se comporta exactamente como antes. Nuevo `resolveChannelCapabilities` y `DEFAULT_CHANNEL_CAPABILITIES`. `TeamChatChannel.thread` (clave del contacto virtual) queda tipado.
- Un adjunto `{type:"support_case", status, folio, subject?, solution?}` se pinta como tarjeta de caso (estado abierto/resuelto/cerrado, folio, asunto, solucion) en lugar del texto del cuerpo; con estado invalido o sin folio cae al texto. `ChatAttachment` gana `folio`, `subject` y `solution`.
- Secciones fijadas genericas: `sections` en la respuesta de canales (`{key,title,hint?,actions:[{id,label,icon?,href?}]}`) y `channel.section`; `TeamChat` gana la prop `onSectionAction(sectionKey, actionId)`. Sin `sections` la lista no cambia.
- `support-ui`: nuevo `SupportCaseCard` (+ `STATUS_VARIANT`, `isSupportCaseStatus`), reutilizado por `SupportThread` y por el chat. `agent-workspace` pasa a tener `@asteby/metacore-support-ui` como peer dependency.
- `i18n`: claves `supportThread.card.*` (es/en).

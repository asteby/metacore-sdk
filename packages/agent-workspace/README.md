# @asteby/metacore-agent-workspace

The complete Metacore agent experience as one package: workspace chat (session
history, search, attachments, voice and dictation, embedded charts, proposals,
live indicator), floating widget with channel inbox, team chat (reactions, voice
notes, WebRTC calls) and agent guidance. Nothing is cut down per app: each host
injects its own plumbing through `<AgentWorkspaceProvider>` and turns product
capabilities on or off.

```tsx
<AgentWorkspaceProvider
  http={api}                         // authenticated axios instance
  realtime={useWebSocketContext()}   // single host socket
  user={user}
  navGroups={navGroups}
  storageNamespace="gobiernos"       // localStorage prefix
  branding={{ name: 'Gobi', skin: 'gobi-navy' }}
  capabilities={{ MapChart, ProviderReconnectDialog }} // omit what the product lacks
>
  <CallProvider>
    <AIChatWidget />
  </CallProvider>
</AgentWorkspaceProvider>
```

Capabilities (`usage`, `ProviderReconnectDialog`, `MapChart`) are optional; an
absent one removes its UI cleanly. `ops` and `gobiernos-ops` consume the same
build, so a feature added here reaches both.

Protocol names shared with the backend (`ops:aby-*` events, `ops.*` tools) are
kept as-is on purpose.

## Chat de equipo: capacidades por canal y tarjetas de caso

`GET /internal-chat/channels` puede declarar por canal lo que soporta (todo `true` si se omite; solo un `false` explicito apaga):

```jsonc
{ "id": "...", "kind": "dm", "thread": "support",
  "capabilities": { "calls": false, "reactions": false, "replies": false, "attachments": true } }
```

`calls` (botones de llamada y "Unirse"), `reactions` (menu de emojis y chips), `replies` (responder / deslizar), `attachments` (adjuntar, pegar archivos y notas de voz).

Un mensaje con el adjunto `{ "type": "support_case", "status": "open|resolved|closed", "folio": "OPS-000123", "subject": "...", "solution": "..." }` se pinta como tarjeta de caso (`SupportCaseCard` de `@asteby/metacore-support-ui`); el `body` queda como texto de respaldo para clientes viejos. Con estado invalido o sin `folio` se muestra el `body`.

### Secciones fijadas de la lista

`GET /internal-chat/channels` puede devolver, junto a `channels`, un arreglo `sections` (primitivo generico: soporte, avisos, facturacion...). Un canal se agrupa bajo una seccion con `channel.section = section.key`; sin `sections` la lista es identica a la de siempre. Un canal con `section` no declarada se queda en la lista normal.

```jsonc
{ "channels": [{ "id": "...", "kind": "dm", "thread": "support", "section": "support", "capabilities": { ... } }],
  "sections": [{
    "key": "support",
    "title": "Soporte",
    "hint": "¿Algo no funciona? Abre un ticket y te atenderemos en su chat.",
    "actions": [
      { "id": "tickets", "label": "Tickets", "icon": "ticket", "href": "/soporte/casos" },
      { "id": "new", "label": "Nuevo ticket", "icon": "plus" }
    ]
  }] }
```

Todos los textos, iconos (nombre lucide) y rutas vienen del descriptor. Una accion con `href` es un enlace; sin `href` llama a `<TeamChat onSectionAction={(sectionKey, actionId) => ...} />` y, si el host no pasa el callback, no se muestra. Accesibilidad: cada seccion es un `<section>` con encabezado (`h3`) y la ayuda enlazada por `aria-describedby`.

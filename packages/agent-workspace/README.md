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
  storageNamespace="mi-app"           // localStorage prefix (optional, see below)
  branding={{ name: 'Asistente', skin: 'hex-navy' }}
  capabilities={{ MapChart, ProviderReconnectDialog }} // omit what the product lacks
>
  <CallProvider>
    <AIChatWidget />
  </CallProvider>
</AgentWorkspaceProvider>
```

`storageNamespace` is optional: when omitted it comes from the product brand
(`storage_namespace` of `/api/brand`, via `ProductBrandProvider` from
`@asteby/metacore-app-providers/brand`) and finally falls back to `ops`. Set it
explicitly when changing a product's brand key must not orphan the users' local
drafts. The assistant name and mascot also default to the product brand.

Capabilities (`usage`, `ProviderReconnectDialog`, `MapChart`) are optional; an
absent one removes its UI cleanly. `ops` and any other app consume the same
build, so a feature added here reaches all of them.

Protocol names shared with the backend (`ops:aby-*` events, `ops.*` tools) are
kept as-is on purpose.

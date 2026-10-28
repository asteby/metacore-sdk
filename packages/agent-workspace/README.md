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
  storageNamespace="mi-app"           // localStorage prefix
  branding={{ name: 'Asistente', skin: 'hex-navy' }}
  capabilities={{ MapChart, ProviderReconnectDialog }} // omit what the product lacks
>
  <CallProvider>
    <AIChatWidget />
  </CallProvider>
</AgentWorkspaceProvider>
```

Capabilities (`usage`, `ProviderReconnectDialog`, `MapChart`) are optional; an
absent one removes its UI cleanly. `ops` and any other app consume the same
build, so a feature added here reaches all of them.

Protocol names shared with the backend (`ops:aby-*` events, `ops.*` tools) are
kept as-is on purpose.

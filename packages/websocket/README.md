# @asteby/metacore-websocket

Typed WebSocket provider for React 18/19 apps in the Metacore ecosystem.

- Native `WebSocket` — no `react-use-websocket` dependency
- Auto-reconnect with exponential backoff (capped at 30s)
- Optional heartbeat (`{ type: 'ping' }` by default)
- Typed messages with a pub/sub registry (`useWebSocketMessage`)
- Token-aware: pass a `getToken` callback; token is appended as `?token=`
  (or customize with `buildUrl`)

## Install

```sh
pnpm add @asteby/metacore-websocket
```

## Usage

```tsx
import {
  WebSocketProvider,
  useWebSocket,
  useWebSocketMessage,
  type WebSocketMessage,
} from '@asteby/metacore-websocket'
import { useAuthStore } from '@/stores/auth-store'

type AppMessage =
  | WebSocketMessage<'NOTIFICATION', { title: string; body: string }>
  | WebSocketMessage<'STATUS_UPDATE', { device_id: string; status: string }>

export function Root({ children }: { children: React.ReactNode }) {
  return (
    <WebSocketProvider<AppMessage>
      url={import.meta.env.VITE_WS_URL}
      getToken={() => useAuthStore.getState().auth.accessToken}
      reconnectInterval={3000}
      maxReconnectAttempts={10}
      heartbeatInterval={30000}
    >
      {children}
    </WebSocketProvider>
  )
}

function MyComponent() {
  const { status, isConnected, send } = useWebSocket<AppMessage>()

  useWebSocketMessage<AppMessage>('NOTIFICATION', (msg) => {
    // msg.payload is typed as { title, body }
    console.log(msg.payload?.title)
  })

  return (
    <button onClick={() => send({ type: 'SUBSCRIBE', conversation_id: '1' })}>
      {isConnected ? 'Connected' : `Status: ${status}`}
    </button>
  )
}
```

## Props

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `url` | `string \| null` | — | Base WebSocket URL. `null` disconnects. |
| `getToken` | `() => string \| Promise<string>` | — | Optional token getter. Token appended as `?token=` unless `buildUrl` is used. |
| `buildUrl` | `(url, token) => string \| null` | — | Custom URL builder. Return `null` to skip. |
| `reconnectInterval` | `number` | `3000` | Base delay in ms. |
| `maxReconnectAttempts` | `number` | `10` | — |
| `exponentialBackoff` | `boolean` | `true` | `base * 2^attempt` capped at 30s. |
| `heartbeatInterval` | `number` | `0` | `0` disables heartbeat. |
| `heartbeatMessage` | `SendPayload` | `{ type: 'ping' }` | — |
| `onOpen` / `onClose` / `onError` / `onMessage` | handlers | — | — |

## Hooks

- `useWebSocket<TMessage>()` — returns `{ status, isConnected, lastMessage, lastEvent, send, disconnect, reconnect, subscribe }`.
- `useWebSocketMessage<TMessage>(type, handler)` — typed subscription; auto-unsubscribes on unmount.

## Realtime data events (`createRealtimeClient`)

The wire protocol behind `host.realtime` / `api.realtime` (contract:
`RealtimeAPI` in `@asteby/metacore-sdk`). The host bridges the kernel's
canonical CRUD events into lean, **org-scoped, value-free** `DATA_EVENT`
frames; addons subscribe by model and refetch what they show. Nothing flows
until somebody subscribes.

```
client → server  {"type":"SUBSCRIBE","models":["SalesOrder","work_orders"]}
                 {"type":"UNSUBSCRIBE","models":["SalesOrder"]}
server → client  {"type":"DATA_SUBSCRIBED","payload":{"models":[...]}}
                 {"type":"DATA_EVENT","payload":{org_id,addon,model,table,action,id,
                                                 stage_from?,stage_to?,actor_id?,at,fields?,coalesced?}}
                 {"type":"DATA_EVENTS_DROPPED","payload":{"dropped":N,"models":[...]}}
```

A subscription token matches a frame when it equals (case-insensitively) the
model key, the table name or `addon.Model`; `"*"` matches everything. The
server coalesces bursts on the same `(model, id)` (~150 ms) and rate-limits
each connection; when frames are dropped the client synthesises one `resync`
event per subscribed model so consumers refetch instead of trusting a stream
with a hole in it. The same happens after a reconnect.

### Own socket (a standalone addon or a non-React host)

```ts
import { createRealtimeClient } from '@asteby/metacore-websocket'

// GET /api/realtime/info → { enabled, ws_url, channels: ['org:<id>'], ... }
const info = await api.get('/realtime/info').then((r) => r.data.data)

const realtime = createRealtimeClient({
  wsUrl: info.ws_url,
  channel: info.channels[0],
  getToken: () => useAuthStore.getState().auth.accessToken,
})

const off = realtime.subscribe({ models: ['SalesOrder'] }, (e) => {
  if (e.action === 'resync' || e.id === currentId) refetch()
})
// later
off()
realtime.close()
```

### Host socket (what ops does — one socket for chat, presence, calls AND data)

```ts
import { createRealtimeClient, transportFromHostSocket } from '@asteby/metacore-websocket'

const realtime = createRealtimeClient({
  transport: transportFromHostSocket({
    subscribe: ws.subscribe, // (type, handler) => unsubscribe
    send: (frame) => ws.sendMessage(JSON.stringify(frame)),
    isConnected: () => ws.isConnected,
    onConnected: (listener) => ws.onConnected(listener),
  }),
})
// hand `realtime` to addons: <Mounted host={{ ..., realtime }} /> or api.realtime
```

`RealtimeClient` also exposes `onStatus(listener)`, `subscribedModels()`,
`serverModels()` (last `DATA_SUBSCRIBED` ack) and `close()`. `subscribe` never
throws and may be called before the socket is open — the `SUBSCRIBE` frame is
sent on the next open. React consumers should use `useRealtime` /
`useRealtimeInvalidate` from `@asteby/metacore-runtime-react` instead of
calling the client directly.

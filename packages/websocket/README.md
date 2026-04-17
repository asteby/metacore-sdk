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

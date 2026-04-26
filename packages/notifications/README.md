# @asteby/metacore-notifications

Metacore notifications kit — a drop-in bell-icon dropdown, app-badge hook
(Badging API) and WebSocket integration for real-time push updates.

## Install

```bash
pnpm add @asteby/metacore-notifications \
  @asteby/metacore-ui @asteby/metacore-websocket \
  date-fns lucide-react sonner @tanstack/react-query react react-dom
```

This package declares its UI, WebSocket, date, icon and toast libraries as
`peerDependencies` — the consumer installs them once at the app level.

## Usage

```tsx
import { NotificationsDropdown } from '@asteby/metacore-notifications/dropdown'
import { WebSocketProvider } from '@asteby/metacore-websocket/provider'
import { api } from '@/lib/api' // your injected axios-compatible client
import { useNavigate } from '@tanstack/react-router'

export function Header() {
  const navigate = useNavigate()
  return (
    <WebSocketProvider url="wss://api.example.com/ws" getToken={getToken}>
      <NotificationsDropdown
        apiClient={api}
        apiBasePath="/data/notifications/me"
        enableBadge
        onNotificationClick={(n) => {
          if (n.link) navigate({ to: n.link })
          else if (n.conversation_id)
            navigate({ to: '/chats', search: { id: n.conversation_id } })
        }}
      />
    </WebSocketProvider>
  )
}
```

`apiBasePath` lets each host application point at its own notifications endpoint, for example:

- `"/data/notifications/me"`
- `"/dynamic/notifications/me"`

## Props

| Prop                       | Type                                      | Default  | Notes |
|----------------------------|-------------------------------------------|----------|-------|
| `apiClient`                | `NotificationsApiClient` (axios-compatible) | —      | Never imported as a singleton — inject it. |
| `apiBasePath`              | `string`                                  | —        | e.g. `/data/notifications/me`. |
| `enableBadge`              | `boolean`                                 | `true`   | Drives `navigator.setAppBadge()`. |
| `onNotificationClick`      | `(n: NotificationItem) => void`           | —        | Navigate however you like. |
| `perPage`                  | `number`                                  | `20`     | Initial fetch size. |
| `locale`                   | `date-fns` `Locale`                       | `es`     | Used by `formatDistanceToNow`. |
| `labels`                   | `Partial<NotificationsDropdownLabels>`    | —        | i18n overrides. |
| `subscribeToNotifications` | `(onMessage) => void \| () => void`       | —        | Bring-your-own subscription (skips `useWebSocketMessage`). |

## Hooks

```ts
import { useAppBadge, useNotifications } from '@asteby/metacore-notifications/hooks'
```

- `useAppBadge()` → `{ badgeCount, setBadge, clearBadge }` — wraps the
  PWA Badging API with a no-op fallback.
- `useNotifications()` → `{ permission, isSupported, requestPermission,
  isGranted, isDenied, isDefault }` — tracks the browser's
  `Notification.permission` state.

## API contract

The component expects the injected HTTP client to behave like axios:

- `GET {apiBasePath}` with query `{ orderBy, orderDir, per_page }`
  returning `{ data: { data: NotificationItem[] } }`.
- `PATCH {apiBasePath}/{id}` with body `{ is_read: true }`.

WebSocket messages are expected under the discriminator `type: 'NOTIFICATION'`
with a payload shaped like `NotificationWsPayload`.

## License

Apache-2.0

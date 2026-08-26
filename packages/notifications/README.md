# @asteby/metacore-notifications

Bell dropdown, **unified toast**, dynamic Lucide icons / severity colors /
module chips, and live ingest over **SSE** (preferred) or WebSocket.

## Install

```bash
pnpm add @asteby/metacore-notifications \
  @asteby/metacore-ui @asteby/metacore-websocket \
  date-fns lucide-react sonner @tanstack/react-query react react-dom
```

## Boot (host app)

```tsx
import { installUnifiedToasts, registerModuleLabel } from '@asteby/metacore-notifications'

installUnifiedToasts() // every toast.success/info/… → same card as the bell
registerModuleLabel('team_chat', 'Equipo') // optional extra chips
```

## Dropdown + SSE

```tsx
import { NotificationsDropdown } from '@asteby/metacore-notifications'

<NotificationsDropdown
  apiClient={api}
  apiBasePath="/data/notifications/me"
  sseUrl="/api/notifications/stream"
  sseAccessToken={accessToken}
  preferSse
  showToastOnIngest
  onNotificationClick={(n) => n.link && navigate({ to: n.link })}
/>
```

### Live transports

| Prop | Role |
|------|------|
| `sseUrl` | `EventSource` to host SSE (`event: notification`) |
| `subscribeToNotifications` | Bring-your-own bus (team-chat bridge, etc.) |
| built-in WS | Used when neither SSE-prefer nor custom subscribe is set |

### Visual contract (payload / metadata)

- `icon` — Lucide kebab name (`shopping-cart`, `clipboard-list`, …)
- `type` — `info` \| `success` \| `warning` \| `error` → default colors
- `metadata.addon_key` / `apartado` — module chip (Inventario, Almacén, POS, …)
- `metadata.color` — optional CSS/hex override for the icon disc

## API

- `GET {apiBasePath}` → `{ data: NotificationItem[] }`
- `PATCH {apiBasePath}/{id}` `{ is_read: true }`
- `GET /api/notifications/stream` — SSE (`?access_token=` for EventSource)

## License

Apache-2.0

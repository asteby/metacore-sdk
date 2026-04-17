# @asteby/metacore-webhooks

Metacore webhooks management UI — list / create / logs / test-replay / signing
secrets. One component, two scopes (`device` or `organization`).

## Install

```bash
pnpm add @asteby/metacore-webhooks \
  @asteby/metacore-ui @tanstack/react-query sonner \
  react-hook-form lucide-react
```

## Quick start

```tsx
import { WebhooksManager } from '@asteby/metacore-webhooks'
import { useApiClient } from '@asteby/metacore-auth'

export function DeviceWebhooksPage({ deviceId }: { deviceId: string }) {
  const api = useApiClient()

  return (
    <WebhooksManager
      apiClient={api}
      scope="device"
      deviceId={deviceId}
      enableTest
      enableReplay
      devices={[{ id: deviceId, name: 'Primary', type: 'whatsapp' }]}
    />
  )
}

export function OrgWebhooksPage() {
  const api = useApiClient()
  return <WebhooksManager apiClient={api} scope="organization" enableTest />
}
```

### What changes between scopes

| Setting             | `scope="device"`         | `scope="organization"`     |
| ------------------- | ------------------------ | -------------------------- |
| Default base path   | `/webhooks`              | `/org-webhooks`            |
| Create payload      | requires `device_id`     | omits `device_id`          |
| List row chip       | shows device name        | hidden                     |
| Header copy         | "del dispositivo"        | "de toda la organización"  |
| `enableReplay`      | recommended `true`       | recommended `false`        |

Override the path at any time with `apiBasePath`.

## Optional i18n

`react-i18next` is an **optional** peer. Pass a `t` prop with the
`(key, defaultValue, vars?) => string` signature — if omitted the defaults in
Spanish are rendered as-is. Example:

```tsx
import { useTranslation } from 'react-i18next'

const { t: rawT } = useTranslation()
const t = (key, defaultValue, vars) => rawT(key, { defaultValue, ...vars })

<WebhooksManager t={t} /* ... */ />
```

## Exports

- `WebhooksManager` — one-liner integration
- `useWebhooks` / `useWebhookLogs` — headless hooks (TanStack Query)
- `StatsBar`, `CreateDialog`, `LogsDialog`, `WebhooksList` — individual pieces
- `DEFAULT_EVENT_PRESETS` — starter preset you can spread into your own array
- Types: `Webhook`, `WebhookLog`, `WebhookStats`, `WebhooksConfig`, …

## API contract

The hooks call the following endpoints (paths use `apiBasePath`, default above):

| Method | URL                                       | Used by                 |
| ------ | ----------------------------------------- | ----------------------- |
| GET    | `{base}` (`?device_id=…` if device scope) | list                    |
| GET    | `{base}/stats`                            | counters                |
| POST   | `{base}`                                  | create (returns secret) |
| PUT    | `{base}/{id}`                             | status toggle           |
| DELETE | `{base}/{id}`                             | delete                  |
| POST   | `{base}/{id}/test`                        | test event              |
| GET    | `{base}/{id}/logs?page=&per_page=`        | logs                    |
| POST   | `{base}/{id}/logs/{logId}/replay`         | replay (device scope)   |

All responses follow the `{ success, data, meta? }` envelope used by the
Metacore backend.

# @asteby/metacore-integrations

Integrations panel (RFC 0003 §4): **Salidas / Entradas / Registro**. It is
headless over an abstract API (`IntegrationsApi`) that the host implements;
the package never does HTTP.

```tsx
import { IntegrationsPanel } from '@asteby/metacore-integrations'

<IntegrationsPanel api={opsIntegrationsApi} locale="es" />
```

- **Salidas**: event checklist grouped by addon with search, destination URL,
  signing profile, write-only credential, filter, visual field mapping (source
  fields come from the event `payload_schema`) with a live preview body, and
  "send test".
- **Entradas**: contract picker, generated URL, **credential shown once**
  (`CredentialOnce`), and an ordered chain of action blocks
  (`record.upsert`, `event.emit`, `notify`, `command.run`). JSON is only an
  opt-in "advanced view", validated against the same closed set.
- **Registro**: deliveries and receipts with direction/status filters, replay
  of failed rows and queue status.

Accessibility: WAI-ARIA tabs (roving tabindex, arrows/Home/End), labelled
fields, `role="alert"` for errors, `aria-live` for status. i18n: `es` (default)
and `en`; pass `messages` to override any key.

The catalog comes from the kernel (`v3.Catalog`, manifest `events.emits[]`).
`IntegrationsApi.listEvents()` must return rows of that shape.

## Playground

`createMemoryIntegrationsApi()` is an in-memory implementation with example
events: use it for demos and tests (see `src/integrations.test.tsx`).

```tsx
import { IntegrationsPanel, createMemoryIntegrationsApi } from '@asteby/metacore-integrations'
export const Demo = () => <IntegrationsPanel api={createMemoryIntegrationsApi()} locale="en" />
```

Building blocks are exported too: `EventPicker`, `MappingEditor`,
`ActionChain`, `CredentialOnce`, and the pure helpers (`flattenSchemaFields`,
`previewBody`, `parseActions`, ...).

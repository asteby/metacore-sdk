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

## Contrato de destinos y acciones de ingesta (v0.3)

Espejo del kernel (`inbound/targets.go`, `inbound/actions.go`) y de OPS
(`eventsint.Block`). Nombres en snake_case, tal cual viajan.

- `IntegrationsApi.listTargets?(): Promise<IngestTarget[]>` sirve el catalogo de
  destinos (`GET /api/integrations/targets` de OPS). Opcional; `listModels?` queda
  `@deprecated`. `parseIngestTargets(json)` valida la respuesta. Campos de v0.272
  (`actions_available`, `stage`, `restorable`, `ingest_cursor`) son opcionales.
- `ActionBlock` (`do`): `record.create` (`idempotency_field` obligatorio, `defaults`),
  `record.update`, `record.upsert`, `record.delete` (`mode?: 'soft'`, `max_rows`),
  `record.action` (`action`, `params`, `on_ineligible?: 'noop'|'fail'`, `max_rows`),
  `record.transition` (`to`), `record.restore`, mas `event.emit`, `notify`, `command.run`.
  `guard {field, path, op: 'gte'|'gt'}` solo en `create|update|upsert|delete`.
  `when` (`Condition`: `path` + exactamente uno de `eq|ne|in|exists`) en cualquier bloque.
- `mode: 'hard'` NO existe: OPS lo prohibe (`hard_delete_disabled`) y `parseActions` lo rechaza.
- `exists` es del kernel; el `BlockWhen` de OPS hoy acepta `eq|ne|in`.
- `parseActions` valida y normaliza (round-trip exacto, sin campos inventados);
  `incompleteActions` marca los bloques vacios; `needsAdvanced(block)` indica que el
  editor visual no puede mostrar el bloque entero (tipos nuevos, `guard`, `defaults`,
  `when` distinto de un `eq` en `notify`): el panel lo muestra de solo lectura y se
  edita en la vista avanzada. `VISUAL_ACTION_KINDS` son los que ofrece el selector.
- Helpers puros: `targetColumnsToMappingRows(target, {requiredOnly?})`, `inferSchema(sample)`.
- `createMemoryIntegrationsApi()` sirve `EXAMPLE_TARGETS` (la fixture del kernel,
  `test/fixtures/targets.json`).

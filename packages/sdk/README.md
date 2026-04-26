# @asteby/metacore-sdk

Frontend SDK for the [Metacore](https://github.com/asteby/metacore-sdk) framework. It is the typed contract every host (Ops, Link, third-party apps) and every addon shares — manifest types, federated addon loader, slot registry, action registry, and a typed API client.

The TypeScript types are mirrored from the Go source of truth (`pkg/manifest/`) via [`tygo`](https://github.com/gzuidhof/tygo); they are guaranteed to match `APIVersion = 2.0.0`.

## Install

```bash
pnpm add @asteby/metacore-sdk
```

Peer dependencies: `react >= 18`, `@tanstack/react-query >= 5` (only required for the React entry).

## Entry points

| Subpath | Exports |
|---|---|
| `@asteby/metacore-sdk` | Manifest types, API client, federation loader, slot/action registries. |
| `@asteby/metacore-sdk/react` | React bindings — provider, hooks, capability gates. |

## Usage

### Manifest types

```ts
import type { Manifest, Capability, ToolDef } from '@asteby/metacore-sdk'
import { METACORE_API_VERSION } from '@asteby/metacore-sdk'

declare const manifest: Manifest // strict structural type, mirrored from Go.
console.log(METACORE_API_VERSION) // "2.0.0"
```

### Federated addon loader

```ts
import { loadAddon } from '@asteby/metacore-sdk'

const addon = await loadAddon({
  scope: 'billing',
  url: '/addons/billing/remoteEntry.js',
})

addon.register({ /* AddonAPI host bindings */ })
```

### Slot and action registries

```ts
import { slotRegistry, actionRegistry } from '@asteby/metacore-sdk'

slotRegistry.contribute('dashboard.widgets', () => <RevenueWidget />)
actionRegistry.register('invoice.send', async (ctx, payload) => { /* … */ })
```

### Typed API client

```ts
import { createMetacoreClient } from '@asteby/metacore-sdk'

const client = createMetacoreClient({
  baseURL: '/api/metacore',
  getToken: () => session.accessToken,
})

const installations = await client.installations.list()
```

## Key types

| Type | Source | What it shapes |
|---|---|---|
| `Manifest` | `src/generated/manifest.ts` | The full manifest document. Mirrored from Go via `tygo`. |
| `ModelDefinition` | `src/generated/manifest.ts` | One entry of `model_definitions[]` — table name, columns, soft-delete and org-scoping flags. |
| `ColumnDef` | `src/generated/manifest.ts` | A column inside a model — name, type, size, default, indices, ref. |
| `Capability` | `src/generated/manifest.ts` | `{ kind, target, reason }`. |
| `ActionFieldDef` | `src/generated/manifest.ts` | A field declared inside a manifest action. Reused by `<DynamicForm>` and the action dispatcher. |
| `ToolDef` | `src/generated/manifest.ts` | LLM-facing tool with `input_schema`, `extraction_hint`, `normalize`, `validation`. |
| `AddonAPI` | `src/api.ts` | Host bindings injected into an addon's `register()` call. |
| `ActionModalProps` | `src/action-registry.ts` | Props passed to action modals registered via `actionRegistry.register()`. |

The `runtime-react` package consumes `AddonAPI`, the action registry and the slot registry from this package. Dynamic UI components live in [`@asteby/metacore-runtime-react`](../runtime-react) and are documented in [`docs/dynamic-ui.md`](https://github.com/asteby/metacore-sdk/blob/main/docs/dynamic-ui.md).

## Regenerating types

When the Go manifest changes:

```bash
pnpm --filter . codegen     # at the repo root — runs tygo
pnpm --filter @asteby/metacore-sdk build
```

`src/generated/manifest.ts` is gitignored when stale; commit the regenerated file alongside the Go change.

## License

Apache-2.0

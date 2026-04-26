# @asteby/metacore-runtime-react

React runtime for [Metacore](https://github.com/asteby/metacore-sdk) hosts. The metadata-driven CRUD layer that turns a manifest declaration into a working UI: dynamic tables, forms, action dispatchers, slot extension points, capability gates, and the federated addon loader.

This is a *runtime*, not a UI kit — visual primitives come from [`@asteby/metacore-ui`](../ui). Hosts inject their HTTP client and (optionally) tenant-branch context via React providers; no bundler aliases are required.

## Install

```bash
pnpm add @asteby/metacore-runtime-react @asteby/metacore-sdk @asteby/metacore-ui
```

Peers: `react`, `react-dom`, `react-i18next`, `i18next`, `@tanstack/react-router`, `@tanstack/react-table`, `date-fns`, `lucide-react`, `sonner`, `zustand`. They're declared as peers so React stays single-instance.

## Exports

| Export | What it does |
|---|---|
| `<DynamicTable model="…" />` | Metadata-driven CRUD table. Sortable, paginated, filterable, URL-syncable, with built-in dialogs. |
| `<DynamicForm fields={…} onSubmit={…} />` | Standalone form renderer over `ActionFieldDef[]`. |
| `<DynamicRecordDialog />` | Create / edit / view modal driven by `/metadata/modal/<model>`. |
| `<ActionModalDispatcher />` | Routes a custom action to its registered component, generic form, or confirm dialog. |
| `<AddonLoader />` | Injects a federated `remoteEntry.js` and calls the addon's `register(api)`. |
| `<Slot name="…" />` / `slotRegistry` | Named extension points contributed by addons. |
| `<CapabilityGate require="…" />` / `<CapabilityProvider />` | Conditional UI by capability. |
| `<NavigationBuilder />` / `useNavigation()` / `mergeNavigation()` | Merges host sidebar with addon `manifest.navigation`. |
| `<I18nProvider />` | Folds `manifest.i18n` namespaces into the host's i18next instance. |
| `<ApiProvider client={axios} />` / `useApi()` | Inject the host's HTTP client. Required by every dynamic component. |
| `<BranchProvider branch={…} />` / `useCurrentBranch()` | Optional tenant-branch context. |
| `useMetadataCache()` | Zustand store for table/modal metadata, persisted to LocalStorage. `prefetchAll(api)` warms it from `/metadata/all`. |
| `defaultGetDynamicColumns` / `makeDefaultGetDynamicColumns(helpers)` | The factory `<DynamicTable>` uses to convert metadata into TanStack column defs. The default reads from `col.key` (matching the kernel contract). |
| `DynamicIcon` | Lucide icon resolver by name. |

## Minimal usage

```tsx
import {
  ApiProvider,
  CapabilityProvider,
  DynamicTable,
} from '@asteby/metacore-runtime-react'
import { api } from './lib/api'

export function App() {
  return (
    <ApiProvider client={api}>
      <CapabilityProvider capabilities={session.capabilities}>
        <DynamicTable model="tickets" />
      </CapabilityProvider>
    </ApiProvider>
  )
}
```

For props, response shapes, customization patterns and the full surface, see [`docs/dynamic-ui.md`](https://github.com/asteby/metacore-sdk/blob/main/docs/dynamic-ui.md).

## How it talks to the kernel

| Endpoint | Used by |
|---|---|
| `GET /metadata/table/<model>` | `<DynamicTable>` (cached). |
| `GET /metadata/modal/<model>` | `<DynamicRecordDialog>` (cached). |
| `GET /metadata/all` | `useMetadataCache().prefetchAll()`. |
| `GET /data/<model>` | `<DynamicTable>` list. |
| `GET /data/<model>/<id>` | `<DynamicRecordDialog>` view/edit. |
| `POST /data/<model>` | Create. |
| `PUT /data/<model>/<id>` | Update. |
| `DELETE /data/<model>/<id>` | Delete (single + bulk). |
| `POST /data/<model>/<id>/action/<key>` | `<ActionModalDispatcher>`. |
| `GET /options/<endpoint>` | Relation pickers + select prefetch. |

All endpoints can be overridden per-component via the `endpoint` prop.

## Build

```bash
pnpm --filter @asteby/metacore-runtime-react build
```

## License

Apache-2.0

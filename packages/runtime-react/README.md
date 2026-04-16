# @asteby/metacore-runtime-react

React runtime for [metacore](https://github.com/asteby/metacore-sdk) hosts. This
package bundles the generic components a host (`ops`, `link`, `hub`) renders
when showing addon contributions — dynamic tables, forms, action dispatchers,
slot extension points and the federated addon loader.

It is a *runtime*, not a UI kit: the actual visual primitives (buttons,
dialogs, tables…) are resolved through the host's bundler aliases. The host
must provide the following modules at build time:

| Alias                              | Purpose                               |
| ---------------------------------- | ------------------------------------- |
| `@/components/ui/*`                | shadcn primitives                     |
| `@/components/data-table`          | DataTableToolbar / Pagination / etc.  |
| `@/components/dynamic/dynamic-columns` | column renderers (`DynamicIcon`, etc) |
| `@/components/dynamic/dynamic-record-dialog` | CRUD dialog (still host-owned) |
| `@/components/dynamic/export-dialog` | Export dialog                       |
| `@/components/dynamic/import-dialog` | Import dialog                       |
| `@/lib/api`                        | axios instance                        |
| `@/lib/utils`                      | `cn()` helper                         |
| `@/stores/metadata-cache`          | zustand store                         |
| `@/stores/branch-store`            | zustand store (optional)              |

## Exports

- `DynamicTable` – CRUD-capable table driven by `manifest.model_definition`.
- `DynamicForm` – renders a form from `fields[]`.
- `ActionModalDispatcher` – routes a custom action to its registered component
  (falls back to confirm dialog / generic form).
- `AddonLoader` – injects a federated `remoteEntry.js` and calls `register(api)`.
- `Slot` / `slotRegistry` – named extension points (`dashboard.widgets`, …).
- `CapabilityGate` / `CapabilityProvider` – conditional UI by capability.
- `NavigationBuilder` / `mergeNavigation` – merges host sidebar with addon nav.
- `I18nProvider` – injects `manifest.i18n` namespaces into the host's i18next.

## Minimal usage

```tsx
import { DynamicTable, Slot, CapabilityGate, AddonLoader } from '@asteby/metacore-runtime-react'

<AddonLoader scope="billing" url="/addons/billing/remoteEntry.js" api={api}>
  <CapabilityGate require="invoice.read">
    <DynamicTable model="invoice" />
    <Slot name="invoice.footer" />
  </CapabilityGate>
</AddonLoader>
```

## Installation

`@asteby/metacore-runtime-react` depends on `@asteby/metacore-sdk` for the
canonical action registry and `AddonAPI` contract. Build order:

```
pnpm --filter @asteby/metacore-sdk build
pnpm --filter @asteby/metacore-runtime-react build
pnpm --filter <host> install
```

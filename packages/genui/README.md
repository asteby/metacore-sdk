# @asteby/metacore-genui

Generative UI for agents, by metadata only. The agent (kernel package
`genui`) returns a `genui/v1` JSON spec; this package validates it again
(`parseUISpec`) and draws it with SDK components. Whitelisted blocks: `text`,
`kpi`, `card`, `table`, `links`, `timeline`, `chart` (dependency-free SVG with
a required text summary) and `confirm` (form + declared actions).

No HTML, markdown-to-HTML or scripts; links are http(s) or app-relative only;
actions are ids plus scalar params that the host maps to real calls.

```tsx
import { registerAgentResultRenderer } from '@asteby/metacore-runtime-react'
import { createGenerativeUIResult } from '@asteby/metacore-genui'

registerAgentResultRenderer('ui', createGenerativeUIResult({
  onNavigate: (path) => navigate({ to: path }),
  onAction: async ({ id, params }) => {
    if (id === 'automations.confirm') await api.post(`/automations/${params.id}/confirm`)
  },
}))
```

## Roadmap: `genui/v2`, the single declarative UI layer

See [ADR 0001](../../docs/adr/0001-genui-ui-declarativa-universal.md)
(Spanish). Summary:

- genui becomes the only runtime declarative UI contract. Its blocks are
  facades over existing components (`DynamicForm`, `DynamicTable`/`DynamicView`,
  `DetailPanels`, `@asteby/metacore-charts`, `metacore-ui` dialogs), never
  re-implementations. Data-bound renderers are registered by
  `@asteby/metacore-runtime-react` through a `GenUIProvider`; this package
  keeps the contract, the validator and presentational blocks only.
- `genui/v2` adds layout (`stack`, `grid`, `tabs`, `section`), `markdown`
  (safe subset, no HTML), `alert`, `empty`, `list`, `stats`, `form`, `wizard`,
  `settings`, `view`, `model_view`, `media`, `slot` and addon `ext` blocks;
  `$ref` bindings to declared read-only query-batch sources (no eval),
  closed action verbs (`navigate`, `invoke`, `submit`, `open`, `close`, `set`,
  `refresh`, `emit`) with server-side authorization and confirmation that can
  only be hardened.
- `genui/v1` stays valid (`Upgrade` v1 → v2); capabilities are negotiated via
  `q:caps`. The JSON Schema in the kernel is the single source; Go and TS types
  are generated and both validators run a shared conformance suite.

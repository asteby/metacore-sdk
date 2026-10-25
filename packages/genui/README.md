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

## `genui/v2` contract (validator only; no renderers yet)

This is the first code PR of the genui/v2 plan (ADR 0001, section 3, row 4):
the contract and the validator. Nothing is drawn for v2 yet: `GenerativeUI`
still renders `genui/v1`.

```ts
import { parseGenUI, parseUISpecV2, upgradeV1, downgrade } from '@asteby/metacore-genui'

parseGenUI(untrusted)                 // v1 or v2 in, normalized v2 out ({ source: 'genui/v1' | 'genui/v2' })
parseUISpecV2(untrusted, { allowExternalLinks: false })   // strict v2 only
downgrade(spec, { versions: ['genui/v1'] })               // what a v1-only client can show
```

- **Source of truth**: `schema/genui-v2.schema.json` (JSON Schema 2020-12).
  `pnpm --filter @asteby/metacore-genui codegen` regenerates
  `src/generated/genui-v2.ts` (types) and `src/generated/genui-v2-schema.ts`
  (embedded schema + allowed/required fields per block). CI fails on a diff.
  The schema lives in this SDK; the Go kernel copies it (and the vectors) until
  the kernel PR lands (`conformance/README.md`). The validator interprets a
  small, whitelisted subset of JSON Schema and fails closed
  (`scripts/schema-keywords.mjs`, enforced by codegen and by a test).
- **Hand-written rules** (what the schema cannot say), each with a vector, are
  listed in `conformance/README.md`: global limits (`GENUI_V2_LIMITS`: 200
  blocks, block depth 6, 32 actions, 200 bindings, 128 KB UTF-8), unique ids,
  `$ref` only in value positions, safe links (external `http(s)` only with
  `allowExternalLinks`), declared sources, existing overlays and forms,
  `rows`/`source` exclusion, route requirements. Rules apply by schema
  position, never by key name. Prototype keys (`__proto__`, `constructor`,
  `prototype`) are rejected anywhere; JSON nesting is capped at 64.
- **Units**: text limits count Unicode code points (an emoji is 1); the
  document size counts UTF-8 bytes.
- **Stable error codes**: `GENUI_ERROR_CODES` (`genui.unknown_block`,
  `genui.field_not_allowed`, `genui.limit.depth`...). They are part of the contract.
- **Compatibility**: `upgradeV1` is structural identity (plus dropping the empty
  fields v1 tolerated). `downgrade` replaces unsupported blocks by their
  `fallback` text, drops actions with unsupported verbs, and returns a valid
  `genui/v1` document when the client only speaks v1. Without caps, v1 is assumed.
- **Conformance vectors**: `conformance/{valid,invalid,upgrade,downgrade}/*.json`,
  shared with the Go kernel; see `conformance/README.md`.

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

## `genui/v2` contract and validator

Contract and validator of the genui/v2 plan (ADR 0001, section 3, row 4).
`GenerativeUI` still renders `genui/v1` only; the v2 renderer is `GenUI`
(see "Renderer" below).

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
  The schema lives in this SDK; the Go kernel (`genui/v2`) copies it and the
  vectors with `scripts/sync-genui-vectors.sh` and pins their hash in
  `conformance.lock` (`conformance/README.md`). Both CIs run the same vectors. The validator interprets a
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

## Renderer (phase 1)

```tsx
import { GenUI, GenUIProvider, registerGenUIBlockRenderer } from '@asteby/metacore-genui'
import { registerGenUIMapBlock } from '@asteby/metacore-maps/genui'      // `map` block (MapLibre, lazy)
import { registerGenUISettingsBlock } from '@asteby/metacore-runtime-react/genui' // `settings` block (pilot)

registerGenUIMapBlock()
registerGenUISettingsBlock()

<GenUIProvider sources={{ points: rows }} onNavigate={go} onAction={handle} t={t}>
  <GenUI spec={untrustedV1OrV2} />
</GenUIProvider>
```

- `GenUI` validates with `parseGenUI` (v1 is upgraded) and draws the closed block
  set. Built in: `stack`, `grid`, `tabs`, `section`, `text`, `markdown` (safe
  subset parsed to React nodes: no HTML, no images, links through `isSafeLink`),
  `alert`, `empty`, `card`, `list`, `metric` (KPI with trend, severity
  thresholds and sparkline), `diagram` (nodes + edges with automatic layered
  layout, drawn as SVG text; there is no mermaid and no HTML path), plus the v1
  blocks. Heavy blocks register themselves: `map` (`@asteby/metacore-maps/genui`:
  facade over MapView with tone-by-status colours, legend by status or group,
  hover tooltip, cluster and a side detail panel), `settings`
  (`@asteby/metacore-runtime-react/genui`). A block with no renderer shows its
  `fallback` text. `GenUIProvider` overrides renderers per tree.
- Data never comes from the spec: blocks with `source` read rows the HOST
  resolved (batch query, with the viewer's permissions) and passed in `sources`.
- Not in phase 1: `$ref`/`when` evaluation, declared-source loading, the action
  engine (only plain `navigate` runs here; every other verb and anything with
  `confirm` goes to `onAction`) and streaming. A block with `when` is not shown.
- Links: external `http(s)` are off unless `allowExternalLinks` (the chat turns it on).

## Page renderers (page@1 / block@1)

Additive layer for declarative addon pages (see `examples/fleet-map.tsx`):
`PageView`/`PageBlocks` render `grid` with `areas` (+ `mobile` order),
`stats`/`kpi_card`, `section` (`mode: declarative | hybrid | custom`,
`chrome: card | bare`, loading/error/empty states, per-section ErrorBoundary,
`permission` + `on_denied`) and a `map` whose selection writes
`state.<select>` and emits a `select` event. `PageProvider` holds the shared
state, an event bus and optional `url_state`. `defineBlock`/`registerPageBlock`
define the custom block contract (`block@1`: props, reads, writes, events);
federation/iframe loading is NOT implemented, an unregistered component renders
a stub. These page-level keys are proposals and are not yet in the shared
genui/v2 JSON Schema; core blocks still go through `parseGenUI`.

### Table block UX (`table`)

`column.format` (incl. `relative_date`, with the host locale) is applied. Optional
column fields: `variant` (`text` | `badge` | `icon_text`), `tones` (value ->
`success|warning|danger|info|muted`), `labels` (value -> text or `{ $t }`
resolved with the host `t`; no label -> the value is humanized, never the raw
key) and `icons` (value -> icon name via `resolveIcon`; unknown icons are
omitted). Block fields: `max_height` (`sm|md|lg` = 16/24/32rem, `TABLE_MAX_HEIGHT`)
for an inner, keyboard-reachable scroll with a sticky header, and
`density: "compact"` for one/two-line rows instead of stacked cards in narrow
containers. `TableView` is exported for direct use. The shared schema
(kernel PR #639) is synced into `schema/genui-v2.schema.json`; `tones`/`labels`/`icons`
require `variant` `badge` or `icon_text` (`genui.invalid_block` otherwise).

### Icons by name (`resolveIcon`)

Option icons of the view switcher (`tabs[].icon`) are resolved by one hook,
`usePageIcon`. Order: the host's `resolveIcon` (on `GenUIProvider`), then the
built-in set (`map`, `cards`, `table`, `dashboard`, `list`, `calendar`, `chart`),
then a neutral icon. It never throws: a resolver that fails is ignored and an
invalid name (not `^[A-Za-z][A-Za-z0-9]{0,63}$`) paints no icon. The component
only receives `className`, so it inherits the theme through `currentColor`.

```tsx
<GenUIProvider resolveIcon={(name) => (lucide as any)[name] ?? null}>
  <PageView ui={ui} can={can} />
</GenUIProvider>
```

See `examples/fleet-switcher-icons.tsx`. Kernel follow-up: the shared schema
still restricts `tabs[].icon` to the closed enum; it must also accept the
pattern `^[A-Za-z][A-Za-z0-9]{0,63}$` for host icon names to pass `parseGenUI`.
The SDK already works with both.

## Page as data (`genui.page-graph/v1`)

A page is a tree of **nodes with a stable `id`**, so a patch (overlay) can address a block by id instead of by
position. Example: `examples/dashboard.page-graph.json`; shape: `page-graph.schema.json` (export of this package).

```ts
import { PageGraphView, parsePageGraph, resolveGraph, indexGraph, pageToGraph } from '@asteby/metacore-genui'

<GenUIProvider sources={sources} t={t}>
  <PageGraphView graph={graph} can={can} settings={orgSettings} onNodeError={report} onResolved={({ hidden }) => explain(hidden)} />
</GenUIProvider>
```

- **Node**: `{ id, type, props?, children?, area?, visible?, fallback?, fallback_node?, origin? }`. `props` is the block's own
  fields (never `type`, `id`, `blocks`, `tabs`, `when`, `area`, `fallback`: the node owns them). `children` become `blocks`;
  in `tabs` the children are `tab` nodes (`props.key`, `props.label`), each with its own blocks.
- **Visibility** (all declared conditions must hold): `permission` (viewer `can`) and `setting` (org/preset setting,
  `{ key, equals | in | not_in | empty }`) prune the node at compile time and are reported in `hidden`
  (`{ id, reason, detail }`, the input of an "Explain: why do I not see this"); `when` is a live predicate on
  `state.*` / `ctx.*` / `data.*`. Without `can`, every declared permission is denied.
- **Isolation per block**: every node is wrapped in a layout-neutral marker (`display: contents`, `data-graph-node="<id>"`)
  and an error boundary. A node that throws shows an alert with retry and reports `onNodeError({ id, error })`; if it
  declares `fallback_node` (e.g. the original block an overlay replaced) that node renders instead. Loading / error / empty of
  a block's data source are per block (`section`, core blocks), not page-wide.
- **Validation**: `parsePageGraph` never throws and returns every error with a stable code (`page_graph.id_duplicate`,
  `page_graph.limit.depth`...). Limits: 500 nodes, depth 8, 64 children, 256 KB, ids `^[A-Za-z][A-Za-z0-9_.:-]{0,95}$`.
- **For overlay engines** (the merge function is NOT here): `indexGraph(graph)` gives id -> `{ node, parentId, index, via }`,
  `graphIds` the ids in document order, and `resolveGraph(graph, env)` compiles to page blocks. A merge only has to
  produce another valid `PageGraph` (re-validate with `parsePageGraph`); `origin` carries who contributed each node.
- **Adopting an existing page**: `pageToGraph({ state, data, blocks }, { id })` assigns `<parent>.<type>-<index>` ids to blocks
  without one and lists them in `generated` (index-based ids move when order changes: set explicit ids before writing overlays).

## Dashboard blocks

KPI cards, deltas, tones and the sparkline are NOT here: use `KpiCard`, `Delta` and `toneClasses` from `@asteby/metacore-ui` and `Sparkline`
(`responsive`, `endDot`) from `@asteby/metacore-charts`. What the kit did not have lives here: `RankedList` (ranking or list; real links;
focusable scroll region; off-screen rows deferred past `RANKED_LAZY_ROWS`; `Tone` badges), `SeriesView` (any chart + an always-reachable
data table and a view toggle, one shared height) and `BlockState` (`DataState` of the UI kit with a fixed minimum height, so loading ->
content does not shift the page; `marker` sets `data-genui-block`).

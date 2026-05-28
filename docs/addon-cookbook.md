<p align="center">
  <img src="./assets/metacore.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Addon Cookbook</h1>

Short recipes for the patterns that come up while building addons. Each entry is a question, the smallest working snippet, and a one-line note about *why*. For deep context on any feature, follow the links to [`manifest-spec.md`](./manifest-spec.md) and [`dynamic-ui.md`](./dynamic-ui.md).

## Table of contents

- [How do I add a foreign-key relation?](#how-do-i-add-a-foreign-key-relation)
- [How do I make a column searchable?](#how-do-i-make-a-column-searchable)
- [How do I add a custom validation?](#how-do-i-add-a-custom-validation)
- [How do I create a custom action with a modal?](#how-do-i-create-a-custom-action-with-a-modal)
- [How do I require a permission for a button?](#how-do-i-require-a-permission-for-a-button)
- [How do I emit an event when a record changes?](#how-do-i-emit-an-event-when-a-record-changes)
- [How do I subscribe to events from another addon?](#how-do-i-subscribe-to-events-from-another-addon)
- [How do I show a different UI for create vs edit?](#how-do-i-show-a-different-ui-for-create-vs-edit)
- [How do I add a soft-delete column?](#how-do-i-add-a-soft-delete-column)
- [How do I scope records per organization?](#how-do-i-scope-records-per-organization)
- [How do I bundle a frontend extension with my addon?](#how-do-i-bundle-a-frontend-extension-with-my-addon)
- [How do I test my addon locally?](#how-do-i-test-my-addon-locally)
- [How do I prefetch metadata at app boot?](#how-do-i-prefetch-metadata-at-app-boot)
- [How do I add a row dropdown action that links to another page?](#how-do-i-add-a-row-dropdown-action-that-links-to-another-page)
- [How do I gate an action on the row's current state?](#how-do-i-gate-an-action-on-the-rows-current-state)

## How do I add a foreign-key relation?

Declare a `foreign_keys[]` entry on the model. The host generates the
`FOREIGN KEY` constraint and exposes a relation-picker options endpoint the
edit modal uses.

```json
{
  "key": "TicketComment",
  "table": "ticket_comments",
  "columns": [
    { "name": "id", "type": "uuid", "primary_key": true, "default": "gen_random_uuid()" },
    { "name": "ticket_id", "type": "uuid", "not_null": true }
  ],
  "foreign_keys": [
    {
      "columns": ["ticket_id"],
      "references": { "model": "tickets.Ticket", "columns": ["id"] },
      "policy": "physical",
      "on_delete": "cascade"
    }
  ]
}
```

The edit dialog renders a searchable combobox for `ticket_id`. `references.model` is the `<addon_key>.<ModelKey>` of the target; `policy` is `"physical"` (a real DB FK) or `"logical"` (app-enforced only).

## How do I make a column searchable?

Searchability is metadata the kernel derives for the model's list view —
a global ILIKE search (the toolbar's free-text input) plus per-column filter
chips. Declare the column normally and the kernel exposes it as a filter;
text columns participate in the `?search=` global search.

```json
{
  "key": "Ticket",
  "table": "tickets",
  "columns": [
    { "name": "title", "type": "text", "not_null": true }
  ]
}
```

## How do I add a custom validation?

For action fields, add `validation` (regex applied after `normalize`):

```json
"input_schema": [
  { "name": "rfc", "type": "string", "required": true,
    "normalize": "uppercase",
    "validation": "^[A-ZÑ&]{3,4}\\d{6}[A-Z0-9]{3}$" }
]
```

For column constraints beyond what the manifest expresses (NOT NULL, UNIQUE, length), validate in your action handler / WASM export. Keep schema-level constraints declarative; keep business rules in code.

## How do I create a custom action with a modal?

Declare the action under `contributions.actions[]` with `fields[]`. In v3 the
action carries its own `handler` (the server side is wired *into the action*,
not a separate `hooks{}` map), and `target_model` is the model `key` it acts on:

```json
"contributions": {
  "actions": [
    {
      "key": "reassign",
      "label": "Reassign",
      "icon": "UserPlus",
      "target_model": "Ticket",
      "handler": { "type": "webhook", "url": "/webhooks/reassign" },
      "fields": [
        { "key": "assignee_id", "label": "New assignee", "type": "user", "required": true },
        { "key": "note", "label": "Note", "type": "text" }
      ]
    }
  ]
}
```

`<DynamicTable>` adds "Reassign" to the row dropdown. Clicking it fires `<ActionModalDispatcher>`, which renders a modal with the declared inputs and dispatches to the action's `handler` — a `webhook` (`{ "type": "webhook", "url": "…" }`) or a `wasm` export (`{ "type": "wasm", "function": "Reassign" }`).

For full custom UI register a component on the modal registry — the
component must accept the canonical `ModalProps` and narrow `payload` at the
entry:

```tsx
import type { AddonAPI, ModalProps } from '@asteby/metacore-sdk'

interface ReassignPayload { ticketId: string }

function ReassignDialog(props: ModalProps) {
  const { ticketId } = props.payload as unknown as ReassignPayload
  // …form, submit, then:
  // props.close({ ticketId })
}

export function register(api: AddonAPI) {
  api.registry.registerModal({ slug: 'tickets.reassign', component: ReassignDialog })
}
```

The action's `modal: "tickets.reassign"` field in the manifest tells the
dispatcher to mount this component instead of the generic field-driven
dialog. See [`docs/modals.md`](./modals.md) for the full contract.

## How do I require a permission for a button?

Wrap the affordance in `<CapabilityGate>`:

```tsx
import { CapabilityGate } from '@asteby/metacore-runtime-react'

<CapabilityGate require="db:write addon_tickets.tickets">
  <Button onClick={createTicket}>New ticket</Button>
</CapabilityGate>
```

The kernel still enforces the same capability server-side — gating UI is purely a UX courtesy. See [`dynamic-ui.md`](./dynamic-ui.md#capability-gates) for `all` / `any` / `invert` modes.

## How do I emit an event when a record changes?

Declare the capability and publish the event under `extension_points.events[]`
(v3 replaces the v2 free-form `events: [...]` list with typed published events
that can carry a `payload_schema`):

```json
"capabilities": [
  { "kind": "event:emit", "target": "ticket.created", "reason": "Notify creation" },
  { "kind": "event:emit", "target": "ticket.resolved", "reason": "Notify resolution" }
],
"extension_points": {
  "events": [
    { "name": "ticket.created",  "description": "A ticket was created." },
    { "name": "ticket.resolved", "description": "A ticket was resolved." }
  ]
}
```

Event names are `<namespace>.<event>` (exactly two underscore-segments per
side). In a webhook / WASM export, call the host's event API with
`{ topic: 'ticket.resolved', payload: {…} }`. The kernel checks the
capability, persists the event, and fans out to subscribers.

For automatic reactions on CRUD operations, declare a subscription under
`contributions.subscriptions[]`:

```json
"contributions": {
  "subscriptions": [
    { "event": "ticket.created",
      "handler": { "type": "webhook", "url": "/webhooks/ticket_created" } }
  ]
}
```

## How do I subscribe to events from another addon?

Declare the capability and a subscription whose `handler` the kernel invokes
when the event fires:

```json
"capabilities": [
  { "kind": "event:subscribe", "target": "invoice.stamped" }
],
"contributions": {
  "subscriptions": [
    { "event": "invoice.stamped",
      "handler": { "type": "wasm", "function": "OnInvoiceStamped" } }
  ]
}
```

The publishing addon declares `invoice.stamped` under its
`extension_points.events[]` so the host knows the schema.

## How do I show a different UI for create vs edit?

`<DynamicRecordDialog>` already swaps title and submit label per `mode`. If you need different fields, branch at the call site and render two distinct components (or two manifest models — one for the create funnel, one for editing the persisted record).

```tsx
{mode === 'create'
  ? <FullCreationWizard onDone={refetch} />
  : <DynamicRecordDialog open mode="edit" model="tickets" recordId={id} />}
```

## How do I add a soft-delete column?

Declare a `deleted_at` column on the model:

```json
{
  "key": "Ticket",
  "table": "tickets",
  "columns": [
    { "name": "id", "type": "uuid", "primary_key": true, "default": "gen_random_uuid()" },
    { "name": "deleted_at", "type": "timestamptz" }
  ]
}
```

The host filters `deleted_at IS NOT NULL` out of default queries and routes a delete to `UPDATE … SET deleted_at = now()`.

## How do I scope records per organization?

Declare an `organization_id` column and set `tenancy` at the top level:

```json
"tenancy": { "isolation": "shared", "rls_column": "organization_id" },
"models": [
  {
    "key": "Ticket",
    "table": "tickets",
    "columns": [
      { "name": "id", "type": "uuid", "primary_key": true, "default": "gen_random_uuid()" },
      { "name": "organization_id", "type": "uuid", "not_null": true }
    ]
  }
]
```

The kernel applies a Postgres RLS policy on `tenancy.rls_column` and stamps it on insert. Cross-tenant reads are denied even if a capability would otherwise allow them.

For regulated data prefer `tenancy.isolation: "schema"` (schema-per-tenant) — see [`manifest-spec.md`](./manifest-spec.md).

## How do I bundle a frontend extension with my addon?

Declare a federation entry in the manifest:

```json
"frontend": {
  "entry": "/api/metacore/addons/tickets/frontend/remoteEntry.js",
  "format": "federation",
  "expose": "./plugin",
  "container": "metacore_tickets"
}
```

Build the frontend with `@originjs/vite-plugin-federation`, wired through
`metacoreFederationShared()` from `@asteby/metacore-starter-config/vite` —
the canonical helper that pre-declares every SDK singleton, including the
ones whose type the upstream plugin recently dropped from its public
`SharedConfig`. See [`docs/federation.md`](./federation.md) for the full
sample and the rationale; the `name` option must match the manifest's
`container`.

The exposed module must export `register(api: AddonAPI)`, which receives the
host SDK and registers slot contributions, action handlers, navigation items,
etc.

```tsx
// frontend/src/plugin.tsx
import type { AddonAPI } from '@asteby/metacore-sdk'

export function register(api: AddonAPI) {
  api.slot.register('dashboard.widgets', RevenueWidget, { priority: 10 })
  api.action.register('tickets', 'reassign', ReassignDialog)
  api.nav.add({ key: 'tickets', label: 'Tickets', to: '/m/tickets' })
}
```

The host loads it via `<AddonLoader>` from `@asteby/metacore-runtime-react`.

## How do I test my addon locally?

```bash
metacore validate         # static checks: regex, semver, capabilities, defaults
metacore build --strict   # produces my-addon-0.1.0.tar.gz
metacore inspect *.tar.gz # prints manifest + migrations + bundle sizes
```

Run a host with a `file:` reference to your addon directory and reload — the kernel re-runs `AutoMigrate` on every restart in dev. Webhooks pointed at `http://localhost:7101/webhooks/...` work straight through; for WASM, use `metacore compile-wasm` to produce a fresh `backend/backend.wasm` before reloading.

## How do I prefetch metadata at app boot?

```tsx
import { useMetadataCache } from '@asteby/metacore-runtime-react'

function PrefetchMetadata() {
  const { prefetchAll } = useMetadataCache()
  const api = useApi()
  useEffect(() => { prefetchAll(api) }, [api])
  return null
}
```

`prefetchAll` issues a single `GET /metadata/all` and seeds both the table and modal caches. Subsequent `<DynamicTable>` mounts render with no network round-trip. The cache is namespaced by `metadataVersion` — when the kernel bumps it, the cache invalidates automatically.

## How do I add a row dropdown action that links to another page?

Declare an action with `type: "link"` and a `linkUrl` template:

```json
{
  "key": "open_invoice",
  "label": "Open invoice",
  "icon": "ExternalLink",
  "type": "link",
  "linkUrl": "/invoices/{invoice_id}"
}
```

Tokens like `{invoice_id}` are replaced with the row's value before navigation. `<DynamicTable>` recognises `type: "link"` and uses the host's TanStack Router `navigate()` instead of opening a modal.

## How do I gate an action on the row's current state?

Use `condition` to hide the action from the dropdown when the row doesn't match, and `requiresState` to assert the same on the server:

```json
{
  "key": "resolve",
  "label": "Resolve",
  "icon": "CheckCircle2",
  "confirm": true,
  "condition": { "field": "status", "operator": "in", "value": ["open", "in_progress"] },
  "requiresState": ["open", "in_progress"]
}
```

`condition` filters the dropdown client-side (`eq`, `neq`, `in`, `not_in`); `requiresState` makes the kernel reject stale executions where the row state changed between fetch and click.

---

Have a recipe to add? Send a PR — recipes live in this file as a flat list, no nesting.

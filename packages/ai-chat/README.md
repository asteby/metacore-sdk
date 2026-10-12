# @asteby/metacore-ai-chat

Copilot chat for metacore apps: floating widget (draggable FAB), chat panel,
starter prompts, proposals (approve/reject) and an injectable chat client.
Everything app-specific is injected; the package imports no stores, API
clients or routes.

## Install

```bash
pnpm add @asteby/metacore-ai-chat @asteby/metacore-app-providers lucide-react
```

Tailwind must scan the package (same as other metacore UI packages):

```css
@source "../node_modules/@asteby/metacore-ai-chat/dist/**/*.{js,mjs}";
```

## What you inject

| Concern | How |
| --- | --- |
| HTTP client | `createHttpChatClient(api, { basePath: '/chat' })` or your own `ChatClient` |
| Permissions | `permissions={{ canChat, canDecideProposals }}` (`canChat: false` hides the widget and shows a denied notice in `CopilotChat`) |
| Branding | `branding={{ name, mascotSkin, avatar }}`; the mascot is `Mascot` from `@asteby/metacore-app-providers` |
| Suggestions | `suggestions={[...]}`, or omit to use `useAgentSuggestions()` (tenant `agent_suggestions`, neutral default) |
| Copy | `labels={{ ... }}` partial override (Spanish defaults) |

Default REST contract (`createHttpChatClient`):

- `POST {base}/send` `{message, session_id, attachments}` -> `{success, session_id, reply|response, proposals?}`
- `GET {base}/sessions`, `GET {base}/history/:id`
- `POST {base}/proposals/:id/decide` `{approve}`

Different backend? Implement `ChatClient` (`send` required; `listSessions`,
`loadHistory`, `decideProposal` optional).

## Proposal format

A reply may carry `proposals`. Both shapes are accepted and normalized (`normalizeProposal`)
on `ChatClient.send`, `loadHistory` and the HTTP client:

```jsonc
// A) display shape
{ "id": "p1", "title": "Archivar hallazgo", "summary": "Motivo…", "status": "pending" }
// B) action shape: title = "action · model", summary = compact JSON of payload
{ "id": "p2", "action": "archive", "model": "finding", "payload": { "id": 7 }, "status": "pending" }
```

`id` is required (string or number, coerced to string); `status` is `pending` (default) | `approved` | `rejected`.
An explicit `title`/`summary` wins over the derived ones. Rows without `id` or without anything to show are dropped.
`action`, `model` and `payload` are kept on the normalized proposal so `decideProposal` hosts can use them.

## Accessibility and states

- `CopilotWidget` panel is `role="dialog"` (`aria-label` = branding name, `aria-modal="false"`: the page stays usable).
  Focus moves to the composer on open and returns to the FAB on close; `Escape` closes (any `CopilotChat` with `onClose`).
- Controls are at least 44x44px with a visible focus ring; animations honour `prefers-reduced-motion`.
- Offline (`navigator.onLine`) shows a status banner and disables sending. Failed turns show an alert with `labels.retry`;
  `loadHistory` and `decideProposal` failures show an alert (history with retry) instead of failing silently.
- `demo` on `CopilotProvider` (or `CopilotChat`) renders the `labels.demo` badge ("Datos demostrativos").
- Optional session picker: `<CopilotChat sessions={list} sessionId={id} onSelectSession={setId} />`
  (get `list` from `client.listSessions()`).

## Adopting it

### ops (ERP)

```tsx
import { CopilotProvider, CopilotWidget, createHttpChatClient } from '@asteby/metacore-ai-chat'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

const client = createHttpChatClient(api) // ops exposes /chat/send, /chat/sessions, /chat/history/:id

export function Copilot() {
  const canChat = useAuthStore((s) => s.can('chat.use')) // adapt to your permission check
  return (
    <CopilotProvider client={client} permissions={{ canChat }}>
      <CopilotWidget />
    </CopilotProvider>
  )
}
```

Mount `<Copilot />` in the authenticated layout, replacing `AIChatWidget`.
Not covered by this package yet (stay in ops until follow-up): voice/live mode,
file upload, guided tours, team-chat embeds, chart/choropleth embeds, Sparks pill.
Use the `CopilotChat` panel directly (`/agent` page) with `className="h-full"`.

### gobiernos-ops

```tsx
<CopilotProvider
  client={createHttpChatClient(api, { basePath: '/api/v1/chat' })}
  branding={{ name: 'Gobi', mascotSkin: 'gobi-navy' }}
  permissions={{ canChat: hasPermission('copilot:use') }}
  suggestions={['Resumen del tablero', 'Hallazgos pendientes de revisión']}
>
  <CopilotWidget defaultPosition={{ bottom: 24, right: 24 }} />
</CopilotProvider>
```

If the gobiernos backend uses a different contract, pass a custom `ChatClient`.
Use `suggestions` to avoid ERP-flavored prompts; omit it to inherit tenant branding.

## Also exported

`useChat` (state machine), `chatReducer`, `useDraggableFab` / `computePanelLayout`,
`useRevealText`, and the `AGENT_*` surface class constants (use theme tokens
`--surface-*`, `--elevation-*`).

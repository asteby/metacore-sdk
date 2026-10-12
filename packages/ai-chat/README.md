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

# @asteby/metacore-org-ai

Per-organization AI settings and the Claude connect flow. Provider, model and
API key are chosen per org; HTTP client, i18n, toasts and the Claude flow are
injected. No billing, credits or hub concepts live here.

## Adoption

```tsx
import {
  OrgAISettings, createOrgAIApi, createClaudeConnectApi,
} from '@asteby/metacore-org-ai'

const api = createOrgAIApi(axiosInstance)            // GET/PUT /organization/ai-config
const claude = createClaudeConnectApi(axiosInstance) // /organization/ai-config/claude/*

<OrgAISettings
  api={api}
  t={t}                                  // optional, i18next-compatible; English built in
  notify={{ success: toast.success, error: toast.error }} // optional
  claudeConnect={{ api: claude }}        // omit to hide the Claude flow
  providers={myProviders}                // optional, see ProviderPreset
/>
```

- `OrgAIApi` is an interface: pass your own object if the backend differs
  (`createOrgAIApi(http, { basePath, userSourcePath: false })` to tune routes).
- Default providers: Anthropic, OpenAI, DeepSeek and an OpenAI-compatible custom
  endpoint. A preset with `seatId` is disabled until `config.seats[seatId].ready`.
- The API key is write-only: the form never receives it, only `has_api_key`.
- The "use my local AI" toggle renders only when `api.updateUserSource` exists and
  the config carries `user_ai_source`.
- Messages: keys `org_ai.*`; defaults in `ORG_AI_MESSAGES_EN`, plus `ORG_AI_MESSAGES_ES`
  to merge into your catalog.
- `ClaudeConnectDialog` is exported on its own (`api`, `open`, `onOpenChange`, `onConnected`, `openUrl`).
  Backend error codes: `binary_missing`, `invalid_code`, `timeout`, `expired`, `busy`, `invalid_token`.
- Accessibility: provider cards are a `radiogroup`; loading is `role=status` + `aria-busy`;
  load/save/connect errors are `role=alert`; the load error offers retry; an empty provider
  list shows an empty state.

Peers: `@asteby/metacore-ui`, `@tanstack/react-query`, `lucide-react`, `react`.

---
"@asteby/metacore-ai-chat": minor
"@asteby/metacore-permissions": patch
---

ai-chat: `CopilotWidget` now accepts and forwards `sessions`, `onSelectSession` and `demo` to `CopilotChat`; Escape closes the open panel from anywhere in the document (e.g. focus on a toast), yielding to other modal dialogs, text fields outside the panel, handled events and IME composition.

permissions: `useMyPermissions` accepts `scope: string | null | undefined`. Without a scope the query still runs but the persisted snapshot is neither read nor written (a scopeless entry could leak between orgs); string scopes behave as before.

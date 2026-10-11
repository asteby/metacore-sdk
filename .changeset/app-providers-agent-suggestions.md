---
'@asteby/metacore-app-providers': minor
---

Copilot starter prompts become tenant branding: `PlatformBranding` gains an optional `agent_suggestions: string[]`, and the new `useAgentSuggestions(fallback?)` hook (plus the pure `resolveAgentSuggestions` and `DEFAULT_AGENT_SUGGESTIONS`) reads them from `PlatformConfigProvider`, ignoring blanks and falling back to a neutral set. A new vertical gets its own empty-state prompts from its backend config instead of hardcoding them in the chat component.

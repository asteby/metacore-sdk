---
"@asteby/metacore-notifications": patch
"@asteby/metacore-pwa": patch
---

Coalesce system prompts (stable toast ids), honor "Ahora no" with a long snooze, run toast actions before dismiss to avoid SSE races, and dispatch the push-permission event at most once per page load.

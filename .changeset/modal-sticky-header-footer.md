---
"@asteby/metacore-runtime-react": patch
---

fix(action-modal): sticky header + footer, scrollable body

A tall declarative form (a journal entry with many line-items rows) used to push
the Cancel/Submit footer below the viewport. The action modal now caps at 90vh
and scrolls ONLY the field area — the title and the action buttons stay pinned
and always reachable.

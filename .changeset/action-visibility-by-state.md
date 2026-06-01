---
'@asteby/metacore-runtime-react': patch
---

Gate per-row table actions by the row's `status` against the action's `requiresState`.

Row actions that declare a non-empty `requiresState` (camelCase or the snake_case
`requires_state` served by the backend) are now hidden in the row-action dropdown
unless the row's `status` value is one of the declared states. For example, an
"Iniciar trabajo" action with `requiresState: ['reception']` no longer appears on an
order already in `in_progress`.

Additive and null-safe: actions without `requiresState` (or an empty array) are always
shown, and rows without a `status` field surface every action, so there is no
regression for existing models.

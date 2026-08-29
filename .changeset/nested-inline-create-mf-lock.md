---
"@asteby/metacore-ui": minor
---

Nested inline-create lock shared across Module Federation remotes: the
depth counter moves to `globalThis.__metacore_nested_inline_create_depth__`
and DialogContent guards its three dismiss handlers with
`guardNestedInlineCreateDismiss`. Before, a federated addon's own Dialog
copy (e.g. workshop's "Procesar" modal) had its own module-level depth
(always 0), so opening the host's sibling "Crear" dialog fired
pointerDownOutside/focusOutside on the parent modal and closed it.
Exposes `useNestedInlineCreateLock` for hosts to arm the lock.

---
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-sdk": minor
---

Acciones con `supervisor_policy` (POS-2 / PER-2): `ActionMetadata.supervisorPolicy` (servido por el host) hace que los modales de acción (confirmación, formulario y wizard) pidan el PIN del supervisor con `useSupervisor().authorize()` antes de despachar y manden la autorización como `approval_id` (`withApproval`). Quien tiene `general.approve_<política>` no ve el diálogo. Los modales federados usan el mismo hook.

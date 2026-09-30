---
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-sdk": minor
---

Motivo obligatorio al eliminar/cancelar (PER-4). Un modelo que declara `reason_required` en su manifest responde 422 `errors.reason` a un DELETE o acción sin motivo; `useReasonPrompt().run({ request })` prueba la petición, y si el servidor lo exige pregunta una vez (`ReasonPromptDialog`) y reintenta con `reason`. Ya cableado en la eliminación de fila, la eliminación masiva (un motivo para el lote) y los modales de acción (confirmación y formulario). `ActivityEvent.reason` se pinta en `ActivityDiff` («Motivo: …»). `useAddonSettings`/`useUpdateAddonSettings` aceptan `branchId` para leer/escribir los ajustes por sucursal (`settings[].scope: branch`, POS-1); `addonSettingsKey`/`addonSettingsUrl` lo respetan.

Acciones con `supervisor_policy` (POS-2 / PER-2): `ActionMetadata.supervisorPolicy` (servido por el host) hace que los modales de acción (confirmación, formulario y wizard) pidan el PIN del supervisor con `useSupervisor().authorize()` antes de despachar y manden la autorización como `approval_id` (`withApproval`). Quien tiene `general.approve_<política>` no ve el diálogo. Los modales federados usan el mismo hook.

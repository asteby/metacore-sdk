---
"@asteby/metacore-runtime-react": minor
---

Aprobación de supervisor con PIN: `ApprovalPinDialog` (motivo + PIN, error inline), `ApprovalGateProvider` / `useApprovalGate` (`requestApproval({policy, label, context})`: quien tiene `general.approve_<policy>` pasa sin prompt; los demás piden PIN a `/approvals/pin-grant`) y `approvalCapability`. `toastServerError` ya no pinta como error una escritura parada con `approval_required`: avisa "Enviado a aprobación" y, con el gate montado, ofrece "Aprobar con PIN" (`/approvals/:id/approve-pin`). Cierra el pendiente de docs/APPROVALS.md (los dispatchers del SDK apilaban el toast de error).

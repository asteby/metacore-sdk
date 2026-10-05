---
'@asteby/metacore-runtime-react': minor
---

Primitivos de negocio para hosts y addons federados:

- `InstalledAddonsProvider` + `useAddonInstalled` / `useCapabilityProvided` / `useInstalledAddons`: una sola respuesta a «¿qué hay instalado?» (sin provider devuelven `undefined`, nunca «ausente»).
- `allocatePayment` / `validateAllocation` (PaymentAllocator) y `computeAging` / `bucketFor` (AgingTable) como funciones puras.
- Bandeja de aprobaciones: `approvalsClient`, `registerApprovalCategory`, `groupApprovals` y el tipo `ApprovalRequestDTO`.
- Contribuciones federadas por documento: `registerDocumentContribution` (con disposer y carga perezosa), `resolveContributions` (pura) y el hook `useDocumentContributions`.
- Modales federados: `registerFederatedModal` / `resolveFederatedModal`. `ActionModalDispatcher` pinta el modal registrado sin esperar al host y, si el addon del `modal` no está instalado, abre el formulario genérico de la acción de inmediato en lugar de esperar 20 s.
- Tipos de documento (`registerDocumentKind`, `CORE_DOCUMENT_KINDS`) y contratos de PartyCard / TotalsPanel / PreviewPanel / ValidationChecklist.
- Manifest `document_forms`: `lines.kind`, `lines.open_documents`, `sources`, `preview` y `submit_action` en los tipos.

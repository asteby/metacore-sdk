// Primitivos de negocio — contrato estable para hosts y remotes federados.
// Las funciones son puras (sin React ni host) salvo use-contributions; la UI y
// el backend (wasm) pueden validar con las mismas reglas.
//
//  allocation       PaymentAllocator: allocatePayment / validateAllocation
//                   (cobro multi-factura, REP, CxC «Registrar abono», CxP «Aplicar pago»).
//  aging            AgingTable: computeAging / daysOverdue / bucketFor (antigüedad de saldos).
//  approvals        ApprovalInbox: approvalsClient (rutas /approvals del kernel),
//                   registerApprovalCategory / groupApprovals.
//  contributions    Secciones y modales federados: registerDocumentContribution,
//                   resolveContributions (pura), registerFederatedModal /
//                   resolveFederatedModal. Todo register* devuelve su disposer.
//  document-kinds   registerDocumentKind / listDocumentKinds / CORE_DOCUMENT_KINDS.
//  panels           Tipos de PartyCard / TotalsPanel / PreviewPanel /
//                   ValidationChecklist / LoadFromDocument + blockingChecks.
//  use-contributions  Hooks: useDocumentContributions, useIsAddonInstalled.
export * from './allocation'
export * from './aging'
export * from './approvals'
export * from './contributions'
export * from './document-kinds'
export * from './panels'
export * from './use-contributions'

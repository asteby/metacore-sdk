// API de Loom que expone el índice principal del paquete. Igual que `./loom` (subpath), salvo que
// los componentes con UI (`Seam`, `ProposalReview`, `SeamInspector`) son envoltorios perezosos:
// así el chunk compartido de federación del host no arrastra la UI de Loom.
export * from './types'
export {
    registerGraft,
    registerPart,
    getPart,
    listGrafts,
    unregisterLoomByAddon,
    clearLoom,
    subscribeLoom,
    loomVersion,
} from './store'
export { effectiveApply } from './apply'
export { useProposalQueue, type ProposalQueue } from './queue'
export { LoomProvider, useLoomConfig, type LoomProviderProps, type LoomConfig } from './provider'
export { useSeam, useHasGrafts, type SeamHostContext } from './use-seam'
export { resolveSeam, attenuatePatch, matchesWrite, projectLenses, sensitiveClasses, redactMessage } from './resolve'
export { Seam, ProposalReview, SeamInspector } from './lazy'
export type { SeamProps } from './seam'
export type { ProposalReviewProps } from './proposals'
export {
    applyOverlays,
    mergeConfig,
    type PageBlock,
    type BlockGraph,
    type OverlayOp,
    type OverlayScope,
    type OverlayLayer,
    type OverlayConflict,
    type OverlayConflictReason,
    type OverlayResult,
    type BlockProvenance,
} from './overlay'
export {
    RECORD_DIALOG_HEADER,
    RECORD_FORM_SECTION,
    recordDialogHeaderContract,
    type RecordDialogHeaderLenses,
    type RecordFormSeam,
} from './seams'

// Loom — sistema de contribuciones de UI (RFC 0005 del kernel).
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
export { resolveSeam, attenuatePatch, matchesWrite, projectLenses, sensitiveClasses, redactMessage } from './resolve'
export { LoomProvider, useLoomConfig, type LoomProviderProps, type LoomConfig } from './provider'
export { Seam, SeamInspector, useSeam, type SeamProps, type SeamHostContext } from './seam'
export { useProposalQueue, ProposalReview, type ProposalQueue, type ProposalReviewProps } from './proposals'
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

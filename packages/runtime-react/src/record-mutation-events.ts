// record-mutation-events — a tiny window-level bus that tells every mounted
// list (DynamicTable, DynamicKanban) "a record of model X just changed".
//
// Why: the lists only reloaded when the *caller* bumped `refreshTrigger`. A
// create/edit/delete done from a dialog the shell opens (the dynamic record
// dialog, a federated action modal, a wizard, a confirmation) never reached
// the table, so the row stayed stale until a manual refresh (#1020). Emitting
// here decouples the mutation site from the list that displays the model.

export type RecordMutationKind = 'create' | 'update' | 'delete'

export const RECORD_MUTATION_EVENT = 'metacore:record-mutated'

export interface RecordMutationDetail {
    /** Model key as the emitter knows it (matched case-insensitively). */
    model: string
    kind: RecordMutationKind
}

const norm = (m: string | undefined | null) => (m ?? '').trim().toLowerCase()

/** Announce a successful mutation. Safe to call outside a browser (no-op). */
export function emitRecordMutation(model: string | undefined | null, kind: RecordMutationKind): void {
    if (!model || typeof window === 'undefined' || typeof CustomEvent === 'undefined') return
    try {
        window.dispatchEvent(
            new CustomEvent<RecordMutationDetail>(RECORD_MUTATION_EVENT, { detail: { model, kind } }),
        )
    } catch {
        /* a listener must never break the save flow */
    }
}

/**
 * Listen for mutations of `model` (case-insensitive). Returns an unsubscribe.
 */
export function subscribeRecordMutations(
    model: string | undefined | null,
    cb: (detail: RecordMutationDetail) => void,
): () => void {
    if (typeof window === 'undefined') return () => {}
    const want = norm(model)
    const handler = (e: Event) => {
        const d = (e as CustomEvent<RecordMutationDetail>).detail
        if (!d || !want || norm(d.model) !== want) return
        cb(d)
    }
    window.addEventListener(RECORD_MUTATION_EVENT, handler)
    return () => window.removeEventListener(RECORD_MUTATION_EVENT, handler)
}

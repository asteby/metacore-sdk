/**
 * Branch scoping of option pickers (relation selects).
 *
 * The kernel already narrows every options lookup to the ACTIVE branch (and its
 * market) when the host sends `X-Branch-ID`; with "all branches" it narrows
 * nothing. Two things belong to the client and live here, once, for every picker:
 *
 *  1. {@link useActiveBranchSignature}: a stable string for "which branch is
 *     active right now". A picker that is already mounted (a form or an action
 *     modal left open) must refetch its options when the operator switches the
 *     branch in the sidebar; without it the dropdown keeps listing the previous
 *     branch's rows until the form is closed.
 *  2. {@link useSoleOptionPreselect}: when the (already branch-filtered) options
 *     of a REQUIRED, still-empty picker are exactly one, that one is the only
 *     possible answer, so it is selected for the operator (who can still change
 *     it). It never overwrites a value the operator chose or one that came from
 *     an existing record, and it clears a value IT put there when a branch
 *     switch makes it stop being valid.
 */
import { useEffect, useRef } from 'react'
import { useCurrentBranch } from './api-context'
import type { OptionsMeta, ResolvedOption } from './use-options-resolver'

/** The branch the host session marks as active (`''` = "all branches" / unknown). */
export function readActiveBranchId(): string {
    try {
        return typeof localStorage === 'undefined' ? '' : (localStorage.getItem('active_branch_id') ?? '')
    } catch {
        return ''
    }
}

/**
 * Active branch of the host as a string, `''` for "all branches". Prefers the
 * host's `BranchProvider` (React state, re-renders the consumers on a switch) and
 * falls back to the session key the options cache already keys on, so hosts
 * without a provider keep working (they re-render on their own navigation).
 * Read it in the render of a picker and put it in the deps of the effect that
 * loads the options.
 */
export function useActiveBranchSignature(): string {
    const { id } = useCurrentBranch()
    return id != null && String(id) !== '' ? String(id) : readActiveBranchId()
}

export interface SoleOptionInput {
    /** Auto-selection is allowed for this picker (create-like form, not read-only). */
    enabled: boolean
    required: boolean
    /** Current value of the field (`''`/null/undefined = empty). */
    value: unknown
    /** The operator picked or cleared this field already. */
    touched: boolean
    /** Options of the unfiltered, settled lookup (no search text, not loading). */
    options: readonly ResolvedOption[]
    meta?: OptionsMeta | null
    loading: boolean
    /** A search text is active: the list is a filtered view, not the full answer. */
    searching: boolean
}

function isEmpty(value: unknown): boolean {
    return value === undefined || value === null || value === ''
}

/**
 * The one option to preselect, or `null`. Pure so the rule is testable without
 * a DOM: required + empty + untouched + a settled, unfiltered lookup that holds
 * exactly one option (and the server did not say there are more).
 */
export function soleOptionToPreselect(input: SoleOptionInput): ResolvedOption | null {
    if (!input.enabled || !input.required || input.touched) return null
    if (!isEmpty(input.value)) return null
    if (input.loading || input.searching) return null
    if (input.options.length !== 1) return null
    const total = input.meta?.count
    if (typeof total === 'number' && total > 1) return null
    return input.options[0] ?? null
}

export interface AutoSelectionCheck {
    /** Id of the option this hook selected on its own (`null` = the operator chose). */
    autoId: string | null
    value: unknown
    options: readonly ResolvedOption[]
    meta?: OptionsMeta | null
    loading: boolean
    searching: boolean
}

/**
 * What to do with a value the hook selected itself once the options settle again
 * (a branch switch refetches them): keep it while it is still offered, move to
 * the new sole option, or clear it. A value the operator chose is never touched
 * here (`autoId` is null for it).
 */
export function reconcileAutoSelection(check: AutoSelectionCheck): 'keep' | 'clear' | { replaceWith: ResolvedOption } {
    const { autoId, value, options, meta, loading, searching } = check
    if (autoId == null || loading || searching) return 'keep'
    if (isEmpty(value) || String(value) !== autoId) return 'keep'
    if (options.some((o) => String(o.id) === autoId)) return 'keep'
    const total = meta?.count
    const sole = options.length === 1 && !(typeof total === 'number' && total > 1) ? options[0] : null
    return sole ? { replaceWith: sole } : 'clear'
}

export interface UseSoleOptionPreselectArgs extends Omit<SoleOptionInput, 'touched'> {
    onChange: (value: string) => void
    /** The picker remembers the label of what was auto-picked (no UUID flash). */
    onAuto?: (option: ResolvedOption | null) => void
    /** Branch signature: a switch re-arms the preselection for an empty field. */
    branch: string
}

/**
 * Wires {@link soleOptionToPreselect} and {@link reconcileAutoSelection} to a
 * picker. Returns `markTouched`, which the picker calls when the OPERATOR picks
 * or clears a value (a cascade reset or the hook's own writes are not touches).
 */
export function useSoleOptionPreselect(args: UseSoleOptionPreselectArgs): { markTouched: () => void } {
    const { enabled, required, value, options, meta, loading, searching, onChange, onAuto, branch } = args
    const touchedRef = useRef(false)
    const autoIdRef = useRef<string | null>(null)
    const branchRef = useRef(branch)
    const onChangeRef = useRef(onChange)
    const onAutoRef = useRef(onAuto)
    onChangeRef.current = onChange
    onAutoRef.current = onAuto

    useEffect(() => {
        if (branchRef.current !== branch) {
            branchRef.current = branch
            // A new branch is a new question: an empty, untouched field may be
            // answered again; what the operator chose stays theirs.
            if (autoIdRef.current == null && isEmpty(value)) touchedRef.current = false
        }
        const reconcile = reconcileAutoSelection({ autoId: autoIdRef.current, value, options, meta, loading, searching })
        if (reconcile === 'clear') {
            autoIdRef.current = null
            onAutoRef.current?.(null)
            onChangeRef.current('')
            return
        }
        if (typeof reconcile === 'object') {
            autoIdRef.current = String(reconcile.replaceWith.id)
            onAutoRef.current?.(reconcile.replaceWith)
            onChangeRef.current(String(reconcile.replaceWith.id))
            return
        }
        const sole = soleOptionToPreselect({ enabled, required, value, touched: touchedRef.current, options, meta, loading, searching })
        if (sole) {
            autoIdRef.current = String(sole.id)
            onAutoRef.current?.(sole)
            onChangeRef.current(String(sole.id))
        }
    }, [enabled, required, value, options, meta, loading, searching, branch])

    return {
        markTouched: () => {
            touchedRef.current = true
            autoIdRef.current = null
        },
    }
}

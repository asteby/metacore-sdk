import type { QuickFilterDef, ViewState } from './types'

export const EMPTY_VIEW_STATE: ViewState = { search: '', quick: '', filters: {} }

/**
 * URL <-> ViewState. Same param names DynamicTable already reads/writes
 * (`search`, `f_<col>`, `sortBy`, `order`) plus `q` for the quick filter, so
 * the URL is the single source of truth and the table adopts the shell's
 * filters (and vice versa) with no extra wiring.
 */
export function parseViewState(search: string): ViewState {
    const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    const filters: Record<string, string> = {}
    p.forEach((v, k) => {
        if (k.startsWith('f_') && k.length > 2) filters[k.slice(2)] = v
    })
    const sortBy = p.get('sortBy')
    return {
        search: p.get('search') ?? '',
        quick: p.get('q') ?? '',
        filters,
        sort: sortBy ? { field: sortBy, dir: p.get('order') === 'desc' ? 'desc' : 'asc' } : undefined,
    }
}

/** Writes the ViewState onto an existing search string, leaving unrelated params (view, page...) alone. */
export function serializeViewState(state: ViewState, base = ''): string {
    const p = new URLSearchParams(base.startsWith('?') ? base.slice(1) : base)
    for (const k of [...p.keys()]) if (k.startsWith('f_') || k === 'search' || k === 'q' || k === 'sortBy' || k === 'order') p.delete(k)
    if (state.search) p.set('search', state.search)
    if (state.quick) p.set('q', state.quick)
    for (const [k, v] of Object.entries(state.filters)) if (v) p.set(`f_${k}`, v)
    if (state.sort) {
        p.set('sortBy', state.sort.field)
        p.set('order', state.sort.dir)
    }
    const s = p.toString()
    return s ? `?${s}` : ''
}

/**
 * The effective server params for a state: quick-filter columns + explicit
 * filters (explicit wins) as `f_<col>`, `search`, sort. Used by cards/map; the
 * table gets the same via the URL.
 */
export function viewStateToParams(state: ViewState, quickDefs: QuickFilterDef[] = []): Record<string, string> {
    const out: Record<string, string> = {}
    const quick = quickDefs.find((q) => q.key === state.quick)
    for (const [k, v] of Object.entries(quick?.params ?? {})) out[`f_${k}`] = v
    for (const [k, v] of Object.entries(state.filters)) if (v) out[`f_${k}`] = v
    if (state.search) out.search = state.search
    if (state.sort) {
        out.sortBy = state.sort.field
        out.order = state.sort.dir
    }
    return out
}

export function isViewStateEmpty(s: ViewState): boolean {
    return !s.search && !s.quick && Object.keys(s.filters).length === 0
}

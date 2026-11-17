import { useCallback, useEffect, useState, type ComponentType } from 'react'
import { DynamicTable, type DynamicTableProps } from '../dynamic-table'
import { CardsView } from './cards-view'
import { parseViewState, serializeViewState, viewStateToParams } from './view-state'
import { DEFAULT_MODES, useViewMode } from './use-view-mode'
import { useSavedViews, type SavedViewsAdapter } from './saved-views'
import { ViewSwitcher } from './view-switcher'
import { ViewToolbar } from './view-toolbar'
import type { CardSpec, QuickFilterDef, SortSpec, ViewModeDef, ViewState } from './types'

export interface ModelViewRendererProps {
    model: string
    /** Server params for the active filters — identical across modes. */
    params: Record<string, string>
    state: ViewState
}

export interface ModelViewProps extends DynamicTableProps {
    /** Modes declared by the module's manifest; default Tarjetas | Datos. A host adds `map` here. */
    modes?: ViewModeDef[]
    card?: CardSpec
    quickFilters?: QuickFilterDef[]
    /** Plural noun for the counter. */
    noun?: string
    sort?: SortSpec
    userId?: string
    savedViewsAdapter?: SavedViewsAdapter
    /** Extra mode renderers keyed by mode key (e.g. `map`, supplied by the maps work). */
    renderers?: Record<string, ComponentType<ModelViewRendererProps>>
    onOpenRecord?: (row: Record<string, unknown>) => void
}

function currentSearch() {
    return typeof window === 'undefined' ? '' : window.location.search
}

/**
 * The generic list surface: ViewSwitcher + ViewToolbar over ONE ViewState that
 * lives in the URL, so cards / table / map show the same filtered data.
 * Table mode is DynamicTable (it adopts the same `search`/`f_*` URL params).
 */
export function ModelView({ modes, card, quickFilters, noun, sort, userId, savedViewsAdapter, renderers, onOpenRecord, ...table }: ModelViewProps) {
    const { model } = table
    const effModes = (modes ?? DEFAULT_MODES).filter((m) => m.key !== 'cards' || card)
    const [state, setState] = useState<ViewState>(() => parseViewState(currentSearch()))
    const [total, setTotal] = useState<number | undefined>()
    const urlView = typeof window === 'undefined' ? undefined : new URLSearchParams(currentSearch()).get('view') ?? undefined
    const [mode, setMode] = useViewMode(model, effModes, {
        userId,
        urlView,
        defaultKey: effModes[0]?.key,
        onUrlChange: (v) => {
            const p = new URLSearchParams(currentSearch())
            p.set('view', v)
            window.history.replaceState(null, '', `${window.location.pathname}?${p}`)
        },
    })
    const saved = useSavedViews(model, { userId, adapter: savedViewsAdapter })

    const apply = useCallback((next: ViewState) => {
        setState(next)
        if (typeof window !== 'undefined') {
            const s = serializeViewState(next, currentSearch())
            window.history.replaceState(null, '', `${window.location.pathname}${s}`)
        }
    }, [])
    useEffect(() => {
        const on = () => setState(parseViewState(currentSearch()))
        window.addEventListener('popstate', on)
        return () => window.removeEventListener('popstate', on)
    }, [])

    const params = viewStateToParams(state, quickFilters)
    const Extra = renderers?.[mode]
    return (
        <div className='flex h-full min-h-0 flex-col gap-3'>
            <div className='flex flex-wrap items-start justify-between gap-2'>
                {mode !== 'table' && (
                    <div className='min-w-0 flex-1'>
                        <ViewToolbar
                            state={state}
                            onChange={apply}
                            quickFilters={quickFilters}
                            total={total}
                            noun={noun}
                            sort={sort}
                            savedViews={saved.views}
                            onSaveView={(name) => saved.save({ name, state, mode })}
                            onApplySavedView={(v) => apply(v.state)}
                            onRemoveSavedView={saved.remove}
                        />
                    </div>
                )}
                <ViewSwitcher modes={effModes} active={mode} onChange={setMode} className='ms-auto' />
            </div>
            {mode === 'cards' && card ? (
                <CardsView model={model} endpoint={table.endpoint} card={card} params={params} onOpen={onOpenRecord} onTotal={setTotal} refreshTrigger={table.refreshTrigger} />
            ) : Extra ? (
                <Extra model={model} params={params} state={state} />
            ) : (
                <DynamicTable {...table} enableUrlSync={table.enableUrlSync ?? true} />
            )}
        </div>
    )
}

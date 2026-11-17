import { useEffect, useState } from 'react'
import { Bookmark, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import { useDebouncedValue } from '../use-debounced-value'
import { isViewStateEmpty } from './view-state'
import type { QuickFilterDef, SavedView, SortSpec, ViewState } from './types'

export interface ViewToolbarProps {
    state: ViewState
    onChange: (next: ViewState) => void
    quickFilters?: QuickFilterDef[]
    /** Filtered total; when set renders "7,358 hallazgos · ordenados por prioridad". */
    total?: number
    /** Plural noun for the counter ("hallazgos"). */
    noun?: string
    sort?: SortSpec
    savedViews?: SavedView[]
    onSaveView?: (name: string) => void
    onApplySavedView?: (v: SavedView) => void
    onRemoveSavedView?: (id: string) => void
    locale?: string
}

/** Search + quick chips + counter/sort + saved views. Pure view over `state`; the shell owns it so every mode shares it. */
export function ViewToolbar(p: ViewToolbarProps) {
    const { state, onChange, quickFilters = [], total, noun, sort, savedViews = [] } = p
    const { t, i18n } = useTranslation()
    const [text, setText] = useState(state.search)
    const debounced = useDebouncedValue(text)
    useEffect(() => setText(state.search), [state.search])
    useEffect(() => {
        if (debounced !== state.search) onChange({ ...state, search: debounced })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debounced])
    const chips: QuickFilterDef[] = [{ key: '', label: t('views.all', { defaultValue: 'Todos' }), params: {} }, ...quickFilters]
    return (
        <div className='flex flex-col gap-2'>
            <div className='flex flex-wrap items-center gap-2'>
                <div className='relative min-w-48 flex-1 sm:max-w-sm'>
                    <Search className='pointer-events-none absolute start-2.5 top-2.5 size-4 text-muted-foreground' aria-hidden='true' />
                    <Input
                        type='search'
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={t('views.search', { defaultValue: 'Buscar…' })}
                        aria-label={t('views.search', { defaultValue: 'Buscar…' })}
                        className='ps-8'
                    />
                </div>
                <div role='group' aria-label={t('views.quick_filters', { defaultValue: 'Filtros rápidos' })} className='flex flex-wrap gap-1'>
                    {chips.map((c) => {
                        const on = state.quick === c.key
                        return (
                            <button
                                key={c.key || '__all'}
                                type='button'
                                aria-pressed={on}
                                onClick={() => onChange({ ...state, quick: c.key })}
                                className={cn('rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                            >
                                {c.label}
                            </button>
                        )
                    })}
                </div>
                {!isViewStateEmpty(state) && (
                    <Button variant='ghost' size='sm' onClick={() => onChange({ search: '', quick: '', filters: {}, sort: state.sort })}>
                        <X className='me-1 size-4' aria-hidden='true' />
                        {t('views.clear', { defaultValue: 'Limpiar' })}
                    </Button>
                )}
                {p.onSaveView && (
                    <details className='relative'>
                        <summary className='inline-flex cursor-pointer list-none items-center gap-1 rounded-md border px-3 py-1.5 text-sm'>
                            <Bookmark className='size-4' aria-hidden='true' />
                            {t('views.saved', { defaultValue: 'Vistas' })}
                        </summary>
                        <div className='absolute end-0 z-20 mt-1 w-64 rounded-md border bg-popover p-2 text-popover-foreground shadow-md'>
                            {savedViews.length === 0 && <p className='px-2 py-1 text-xs text-muted-foreground'>{t('views.saved_empty', { defaultValue: 'Aún no guardas vistas' })}</p>}
                            {savedViews.map((v) => (
                                <div key={v.id} className='flex items-center justify-between gap-1'>
                                    <button type='button' className='flex-1 truncate rounded px-2 py-1 text-start text-sm hover:bg-accent' onClick={() => p.onApplySavedView?.(v)}>
                                        {v.name}
                                    </button>
                                    <button type='button' aria-label={t('views.remove', { defaultValue: 'Eliminar' })} className='rounded p-1 hover:bg-accent' onClick={() => p.onRemoveSavedView?.(v.id)}>
                                        <X className='size-3.5' aria-hidden='true' />
                                    </button>
                                </div>
                            ))}
                            <form
                                className='mt-2 flex gap-1 border-t pt-2'
                                onSubmit={(e) => {
                                    e.preventDefault()
                                    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim()
                                    if (name) {
                                        p.onSaveView?.(name)
                                        e.currentTarget.reset()
                                    }
                                }}
                            >
                                <Input name='name' maxLength={60} placeholder={t('views.save_current', { defaultValue: 'Guardar vista actual…' })} aria-label={t('views.save_current', { defaultValue: 'Guardar vista actual…' })} />
                                <Button type='submit' size='sm'>{t('common.save', { defaultValue: 'Guardar' })}</Button>
                            </form>
                        </div>
                    </details>
                )}
            </div>
            {total !== undefined && (
                <p className='text-sm text-muted-foreground' aria-live='polite'>
                    {new Intl.NumberFormat(p.locale ?? i18n.language).format(total)}
                    {noun ? ` ${noun}` : ''}
                    {sort?.label ? ` · ${t('views.sorted_by', { defaultValue: 'ordenados por {{by}}', by: sort.label })}` : ''}
                </p>
            )}
        </div>
    )
}

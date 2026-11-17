import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '@asteby/metacore-ui/primitives'
import { useApi } from '../api-context'
import { ConfigurableCard } from './card-spec'
import type { CardSpec } from './types'

export interface CardsViewProps {
    model: string
    endpoint?: string
    card: CardSpec
    /** Server params from `viewStateToParams` — the SAME filters the table uses. */
    params: Record<string, string>
    pageSize?: number
    onOpen?: (row: Record<string, unknown>) => void
    /** Reports the filtered total so the shell can render "7,358 hallazgos". */
    onTotal?: (total: number) => void
    /** Bump to refetch (e.g. realtime tick). */
    refreshTrigger?: unknown
}

/** Card grid over the same list endpoint DynamicTable uses; "load more" pagination. */
export function CardsView({ model, endpoint, card, params, pageSize = 24, onOpen, onTotal, refreshTrigger }: CardsViewProps) {
    const api = useApi()
    const { t, i18n } = useTranslation()
    const [pages, setPages] = useState(1)
    const key = JSON.stringify(params)
    useEffect(() => setPages(1), [key])
    const q = useQuery({
        queryKey: ['view-cards', model, endpoint, key, pages, refreshTrigger],
        queryFn: async () => {
            const res = await api.get(endpoint ?? `/data/${model}`, { params: { ...params, page: 1, per_page: pageSize * pages } })
            const b = res.data
            const rows = (Array.isArray(b?.data) ? b.data : Array.isArray(b) ? b : []) as Record<string, unknown>[]
            return { rows, total: Number(b?.meta?.total ?? rows.length) }
        },
        placeholderData: (prev) => prev,
    })
    useEffect(() => {
        if (q.data) onTotal?.(q.data.total)
    }, [q.data, onTotal])
    if (q.isLoading) return <div className='p-6 text-sm text-muted-foreground'>{t('common.loading', { defaultValue: 'Cargando…' })}</div>
    if (q.isError) return <div role='alert' className='p-6 text-sm text-destructive'>{t('views.error', { defaultValue: 'No se pudo cargar la lista' })}</div>
    const rows = q.data?.rows ?? []
    if (rows.length === 0) return <div className='p-6 text-sm text-muted-foreground'>{t('views.empty', { defaultValue: 'Sin resultados' })}</div>
    return (
        <div className='flex flex-col gap-4'>
            <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
                {rows.map((r, i) => (
                    <ConfigurableCard key={String(r.id ?? i)} spec={card} row={r} locale={i18n.language} onClick={onOpen ? () => onOpen(r) : undefined} />
                ))}
            </div>
            {rows.length < (q.data?.total ?? 0) && (
                <Button variant='outline' className='self-center' onClick={() => setPages((p) => p + 1)}>
                    {t('views.load_more', { defaultValue: 'Cargar más' })}
                </Button>
            )}
        </div>
    )
}

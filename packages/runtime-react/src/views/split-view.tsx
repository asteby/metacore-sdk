// `view_type: split` — master-detail on one screen: the model's list (the
// same DynamicTable every model uses, restricted to `split.columns`) and the
// selected record's detail panels (`split.panels`, else the model's
// `detail.panels`). Stacks below 1280 px. Lazy chunk.
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Button } from '@asteby/metacore-ui/primitives'
import { DynamicTable } from '../dynamic-table'
import type { ViewRendererProps } from './types'
import { DetailPanels } from './registry'
import { displayValue } from './data-source'
import { ViewSkeleton } from './skeleton'

/** Pure: which metadata columns to hide so the list shows only `columns`. */
export function hiddenColumnsFor(allColumns: string[], columns: string[] | undefined): string[] {
    if (!columns || columns.length === 0) return []
    const keep = new Set(columns)
    return allColumns.filter((c) => !keep.has(c))
}

export default function SplitViewRenderer(props: ViewRendererProps<'split'>) {
    const { model, view, metadata, data, locale, currency, timeZone, className } = props
    const { t } = useTranslation()
    const [selected, setSelected] = React.useState<Record<string, unknown> | null>(null)
    const [record, setRecord] = React.useState<Record<string, unknown> | null>(null)
    const detailRef = React.useRef<HTMLElement>(null)

    const selectedId = selected?.id !== undefined && selected?.id !== null ? String(selected.id) : null
    React.useEffect(() => {
        if (!selectedId) {
            setRecord(null)
            return
        }
        let cancelled = false
        setRecord(null)
        data.record(model, selectedId).then(
            (r) => !cancelled && setRecord(r ?? selected),
            // The list row is still a usable record for the panels.
            () => !cancelled && setRecord(selected),
        )
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, model, selectedId])

    // Move focus to the detail for keyboard and screen-reader users.
    React.useEffect(() => {
        if (record) detailRef.current?.focus()
    }, [record])

    const hidden = React.useMemo(
        () => hiddenColumnsFor((metadata?.columns ?? []).map((c) => c.key), view.columns),
        [metadata, view.columns],
    )
    const panels = view.panels ?? metadata?.detail?.panels ?? []
    const titleKey = view.columns?.[0]

    return (
        <div className={['grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]', className].filter(Boolean).join(' ')} data-testid="split-view">
            <div className="min-w-0">
                <DynamicTable
                    model={model}
                    hiddenColumns={hidden}
                    onRowClick={(row: Record<string, unknown>) => setSelected(row)}
                    timeZone={timeZone}
                    currency={currency}
                />
            </div>
            <section
                ref={detailRef}
                tabIndex={-1}
                aria-live="polite"
                aria-label={t('metacore.views.detail', 'Detalle')}
                className="min-w-0 rounded-lg border bg-background p-4 outline-none xl:sticky xl:top-4 xl:max-h-[calc(100dvh-8rem)] xl:overflow-auto"
            >
                {!selected ? (
                    <p className="py-16 text-center text-sm text-muted-foreground" data-testid="split-empty">
                        {t('metacore.views.select_record', 'Selecciona un registro para ver su detalle.')}
                    </p>
                ) : !record ? (
                    <ViewSkeleton height={240} />
                ) : (
                    <>
                        <header className="mb-4 flex items-start justify-between gap-2">
                            <h2 className="text-base font-semibold text-foreground">
                                {displayValue(titleKey ? record[titleKey] : record.id)}
                            </h2>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label={t('metacore.views.close_detail', 'Cerrar detalle')}
                                onClick={() => setSelected(null)}
                            >
                                <X aria-hidden className="h-4 w-4" />
                            </Button>
                        </header>
                        <DetailPanels
                            model={model}
                            panels={panels}
                            record={record}
                            metadata={metadata}
                            data={data}
                            locale={locale}
                            currency={currency}
                            timeZone={timeZone}
                            translate={(k) => t(k)}
                        />
                    </>
                )}
            </section>
        </div>
    )
}

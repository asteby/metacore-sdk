// DocumentPage — «página de documento» declarativa (benchmark §5.2 / §6.1):
// cabecera + badges + barra de acciones por estado + botones inteligentes +
// pestañas. Se alimenta de un `DocumentSpec` (datos puros) y de un registro;
// las pestañas de campos y de registros relacionados se resuelven solas, y lo
// que necesita UI del host (historial, archivos, PDF) entra por `slots`.
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import { ActionBar } from './action-bar'
import { DocumentHeader, type HeaderBadge, type HeaderMetric } from './document-header'
import { SmartButtons, type SmartButtonItem } from './smart-buttons'
import { StatusBadge } from './status-badge'
import { interpolate, readPath, resolveActions, resolveStatus, resolveTitle } from './evaluate'
import { formatFieldValue, type FieldFormatOptions } from './format'
import { findStatusMachine, type DocumentPageRegistration } from './registry'
import { useDocumentSources } from './use-document-sources'
import type {
    DocumentColumnDef,
    DocumentContext,
    DocumentFieldDef,
    DocumentSlotRenderer,
    DocumentSpec,
    DocumentTabDef,
    ResolvedAction,
} from './types'

export interface DocumentPageProps extends FieldFormatOptions {
    registration: DocumentPageRegistration
    record: Record<string, unknown>
    /**
     * Ejecuta una acción. El host decide: abrir el modal de la acción del
     * modelo (`def.modelAction ?? def.key`), navegar (`def.href`), etc. La
     * promesa mantiene el botón en `loading`.
     */
    onAction: (action: ResolvedAction, ctx: DocumentContext) => void | Promise<unknown>
    /** UI del host para pestañas `kind: 'slot'` (historial, archivos, vista previa PDF…). */
    slots?: Record<string, DocumentSlotRenderer>
    /** Navegación del host (botones inteligentes, cliente). */
    onNavigate?: (href: string) => void
    renderLink?: (props: { href: string; children: ReactNode; className?: string }) => ReactNode
    /** Botón «Volver» u otro contenido antes del título. */
    leading?: ReactNode
    /** Pestaña inicial (`?tab=`). */
    defaultTab?: string
    /** Pestaña controlada por el host (p. ej. «Ver detalle del error» abre Datos fiscales). */
    tab?: string
    onTabChange?: (tab: string) => void
    /** Ruta base para el enlace del subtítulo (`/m/customers/{{customer_id}}`). */
    subtitleHrefTemplate?: string
    /** Cambia para forzar recarga de las fuentes tras una acción. */
    reloadKey?: number
    className?: string
}

export function DocumentPage(props: DocumentPageProps) {
    const { registration, record, onAction, slots, onNavigate, renderLink, leading, defaultTab, className } = props
    const { spec } = registration
    const { t } = useTranslation()
    const fmt: FieldFormatOptions = { locale: props.locale, currency: props.currency, timeZone: props.timeZone }

    const recordId = record.id as string | number | undefined
    const { sources, reload } = useDocumentSources(spec.sources, recordId)

    const ctx: DocumentContext = useMemo(() => {
        const base = { record, sources }
        return { ...base, derived: registration.derive?.(base) ?? {} }
    }, [record, sources, registration])

    // Recarga las fuentes cuando el host avisa de un cambio (acción ejecutada).
    const [lastReload, setLastReload] = useState(props.reloadKey ?? 0)
    if ((props.reloadKey ?? 0) !== lastReload) {
        setLastReload(props.reloadKey ?? 0)
        reload()
    }

    const handleAction = (a: ResolvedAction) => {
        const { tab: targetTab, openUrl, href } = a.def
        if (targetTab) return setTab(targetTab)
        if (openUrl) {
            const url = interpolate(openUrl, ctx)
            if (url) window.open(url, '_blank', 'noopener,noreferrer')
            return
        }
        if (href) return onNavigate?.(interpolate(href, ctx))
        return onAction(a, ctx)
    }

    const layout = useMemo(() => resolveActions(spec, ctx), [spec, ctx])

    const badges: HeaderBadge[] = spec.statuses
        .map((m): HeaderBadge | null => {
            const status = resolveStatus(m, ctx)
            return status ? { id: m.id, label: m.label, status } : null
        })
        .filter((b): b is HeaderBadge => !!b)

    const metrics: HeaderMetric[] = (spec.metrics ?? [])
        .filter((m) => !m.hideEmpty || readPath(ctx, m.path) != null)
        .map((m) => ({
            label: t(m.label, { defaultValue: m.label }),
            value: formatFieldValue(readPath(ctx, m.path), m.format, fmt),
            tone: m.tone,
            mono: m.format === 'mono',
        }))

    const subtitleRaw = spec.subtitle ? readPath(ctx, spec.subtitle.path) : undefined
    const subtitleText = subtitleRaw == null || subtitleRaw === '' ? '—' : formatFieldValue(subtitleRaw, 'text', fmt)
    const subtitle = subtitleText === '—' ? undefined : subtitleText
    const subtitleHref = subtitle && props.subtitleHrefTemplate ? interpolate(props.subtitleHrefTemplate, ctx) : undefined

    const copyValue = spec.copyable ? readPath(ctx, spec.copyable.path) : undefined

    const [innerTab, setInnerTab] = useState(defaultTab ?? spec.tabs[0]?.key)
    const tab = props.tab ?? innerTab
    const setTab = (key: string) => {
        setInnerTab(key)
        props.onTabChange?.(key)
    }

    const smart: SmartButtonItem[] = (spec.smartButtons ?? [])
        .map((b): SmartButtonItem | null => {
            const count = b.source ? sources[b.source]?.length ?? 0 : undefined
            const active = b.source ? (count ?? 0) > 0 : b.field ? !!readPath(ctx, b.field) : true
            if (b.hideWhenEmpty && !active) return null
            const href = b.href ? interpolate(b.href, ctx) : undefined
            return {
                key: b.key,
                label: b.label,
                icon: b.icon,
                count,
                disabled: !active && !b.tab,
                onClick: () => {
                    if (b.tab) setTab(b.tab)
                    else if (href) onNavigate?.(href)
                },
            }
        })
        .filter((b): b is SmartButtonItem => !!b)

    return (
        <div className={cn('flex flex-col gap-4', className)} data-document-page={spec.model}>
            <DocumentHeader
                title={resolveTitle(spec.title, ctx) || t('document.untitled', { defaultValue: 'Documento' })}
                subtitle={subtitle}
                subtitleHref={subtitleHref}
                badges={badges}
                metrics={metrics}
                copyable={
                    spec.copyable && copyValue
                        ? { label: t(spec.copyable.label, { defaultValue: spec.copyable.label }), value: String(copyValue) }
                        : undefined
                }
                leading={leading}
                renderLink={renderLink}
                actions={<ActionBar layout={layout} onAction={(a) => handleAction(a)} />}
            />

            <SmartButtons items={smart} />

            <Tabs value={tab} onValueChange={setTab} className='flex flex-col gap-4'>
                <TabsList className='w-fit'>
                    {spec.tabs.map((tb) => (
                        <TabsTrigger key={tb.key} value={tb.key}>
                            {t(tb.label, { defaultValue: tb.label })}
                            {tabCount(tb, ctx) !== undefined ? (
                                <span className='ml-1.5 rounded-full bg-muted px-1.5 text-xs tabular-nums'>{tabCount(tb, ctx)}</span>
                            ) : null}
                        </TabsTrigger>
                    ))}
                </TabsList>
                {spec.tabs.map((tb) => (
                    <TabsContent key={tb.key} value={tb.key} className='mt-0'>
                        {renderTab(tb, spec, ctx, fmt, slots)}
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    )
}

function tabCount(tb: DocumentTabDef, ctx: DocumentContext): number | undefined {
    if (tb.kind === 'records') return ctx.sources[tb.source]?.length
    if (tb.kind === 'slot' && tb.count) {
        const v = readPath(ctx, tb.count)
        return typeof v === 'number' ? v : undefined
    }
    return undefined
}

function renderTab(
    tb: DocumentTabDef,
    spec: DocumentSpec,
    ctx: DocumentContext,
    fmt: FieldFormatOptions,
    slots: Record<string, DocumentSlotRenderer> | undefined,
): ReactNode {
    if (tb.kind === 'slot') return slots?.[tb.slot]?.(ctx) ?? null
    if (tb.kind === 'fields') {
        return (
            <div className='flex flex-col gap-4'>
                {tb.groups.map((g, i) => {
                    const fields = g.fields.filter((f: DocumentFieldDef) => !f.hideEmpty || readPath(ctx, f.path) != null)
                    if (fields.length === 0) return null
                    return (
                        <section key={g.title ?? i} className='rounded-lg border bg-card p-5'>
                            {g.title ? <h2 className='mb-3 text-sm font-semibold'>{g.title}</h2> : null}
                            <dl className='grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3'>
                                {fields.map((f) => (
                                    <div key={f.path} className={cn(f.wide && 'sm:col-span-2 lg:col-span-3')}>
                                        <dt className='text-xs uppercase tracking-wide text-muted-foreground'>{f.label}</dt>
                                        <dd className={cn('break-words font-medium', f.format === 'mono' && 'font-mono text-xs')}>
                                            {formatFieldValue(readPath(ctx, f.path), f.format, fmt)}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </section>
                    )
                })}
            </div>
        )
    }
    const rows = ctx.sources[tb.source] ?? []
    if (rows.length === 0) {
        return (
            <p className='rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground'>
                {tb.empty ?? 'Sin registros.'}
            </p>
        )
    }
    return (
        <div className='overflow-x-auto rounded-lg border bg-card'>
            <table className='w-full text-sm'>
                <thead className='bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground'>
                    <tr>
                        {tb.columns.map((c) => (
                            <th key={c.path} className='px-3 py-2 font-medium'>{c.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={String(row.id ?? i)} className='border-t'>
                            {tb.columns.map((c) => (
                                <td key={c.path} className='px-3 py-2'>{renderCell(c, row, spec, fmt)}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function renderCell(col: DocumentColumnDef, row: Record<string, unknown>, spec: DocumentSpec, fmt: FieldFormatOptions): ReactNode {
    const v = row[col.path]
    if (col.status) {
        const machine = findStatusMachine(spec, col.status)
        const st = machine?.states.find((s) => s.value === String(v))
        if (st) return <StatusBadge status={st} />
    }
    return (
        <span className={cn(col.format === 'mono' && 'font-mono text-xs', 'tabular-nums')}>
            {formatFieldValue(v, col.format, fmt)}
        </span>
    )
}

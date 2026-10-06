// Piezas visuales del DocumentEditor: secciones, sección plegable, tarjeta de
// contraparte, totales, revisión y vista previa. Sin estado de negocio: el
// editor (o un remote federado) les pasa los datos ya calculados. Los contratos
// de datos viven en primitives/panels.ts.
import { useId, useState, type ReactNode } from 'react'
import { Badge } from '@asteby/metacore-ui/primitives'
import { AlertTriangle, ChevronDown, XCircle } from 'lucide-react'
import type { CreditStatus, EditorIssue } from './document-editor-model'
import type { Formatter } from './format'
import { computeLine, type LineItem } from './line-items'

/** Bloque con título discreto y espaciado generoso (sin bordes pesados). */
export function EditorSection({ title, hint, children, slot }: { title?: ReactNode; hint?: ReactNode; children: ReactNode; slot?: string }) {
    return (
        <section className="space-y-3" data-slot={slot}>
            {(title || hint) && (
                <header className="flex items-baseline justify-between gap-3">
                    {title && <h3 className="text-sm font-semibold">{title}</h3>}
                    {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
                </header>
            )}
            {children}
        </section>
    )
}

export interface CollapsibleSectionProps {
    title: ReactNode
    /** Resumen de una línea cuando está cerrada (p. ej. «G03 · PUE»). */
    summary?: ReactNode
    open?: boolean
    defaultOpen?: boolean
    onOpenChange?: (open: boolean) => void
    children: ReactNode
    slot?: string
}

/**
 * Sección plegable. El contenido queda MONTADO aunque esté cerrada (`hidden`):
 * las contribuciones de otros addons siguen aplicando defaults y reportando
 * revisiones sin que el usuario abra la sección.
 */
export function CollapsibleSection({ title, summary, open, defaultOpen = false, onOpenChange, children, slot }: CollapsibleSectionProps) {
    const [inner, setInner] = useState(defaultOpen)
    const isOpen = open ?? inner
    const id = useId()
    const toggle = () => {
        setInner(!isOpen)
        onOpenChange?.(!isOpen)
    }
    return (
        <section className="rounded-lg border border-dashed" data-slot={slot} data-state={isOpen ? 'open' : 'closed'}>
            <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={id}
                onClick={toggle}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm"
            >
                <span className="font-medium">{title}</span>
                <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    {!isOpen && summary && <span className="truncate">{summary}</span>}
                    <ChevronDown className={`size-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
                </span>
            </button>
            <div id={id} hidden={!isOpen} className="space-y-4 px-4 pb-4">
                {children}
            </div>
        </section>
    )
}

export interface PartyCardProps {
    name?: string
    rows: Array<{ key: string; label: string; value: string }>
    credit?: CreditStatus | null
    fmt: Formatter
    children?: ReactNode
}

/** Tarjeta compacta de la contraparte: nombre, 3-6 datos clave y estado de crédito. */
export function PartyCard({ name, rows, credit, fmt, children }: PartyCardProps) {
    return (
        <div className="rounded-md bg-muted/40 px-4 py-3 text-sm" data-slot="party-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
                {name && <span className="font-medium">{name}</span>}
                {credit && (
                    <Badge variant={credit.level === 'block' ? 'destructive' : credit.level === 'warn' ? 'secondary' : 'outline'} data-slot="party-credit">
                        {credit.holdReason
                            ? credit.holdReason
                            : credit.available != null
                              ? `Crédito disponible ${fmt.money(credit.available)}`
                              : `Saldo ${fmt.money(credit.balance ?? 0)}`}
                    </Badge>
                )}
            </div>
            {rows.length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                    {rows.map((r) => (
                        <div key={r.key} className="min-w-0">
                            <dt className="text-xs text-muted-foreground">{r.label}</dt>
                            <dd className="truncate">{r.value}</dd>
                        </div>
                    ))}
                </dl>
            )}
            {children}
        </div>
    )
}

export interface TotalsRow {
    label: string
    value: string
    emphasis?: boolean
}

/** Totales alineados a la derecha; la última fila con `emphasis` es el total. */
export function TotalsPanel({ rows }: { rows: TotalsRow[] }) {
    return (
        <dl className="ml-auto w-full max-w-xs space-y-1 text-sm tabular-nums" data-slot="totals">
            {rows.map((r) => (
                <div key={r.label} className={`flex justify-between gap-6 ${r.emphasis ? 'border-t pt-2 text-base font-semibold' : ''}`}>
                    <dt className={r.emphasis ? '' : 'text-muted-foreground'}>{r.label}</dt>
                    <dd>{r.value}</dd>
                </div>
            ))}
        </dl>
    )
}

/** Lista de revisión: errores (rojo) y avisos (ámbar). Vacía → no pinta nada. */
export function ValidationChecklist({ issues, title = 'Revisa antes de guardar' }: { issues: EditorIssue[]; title?: string }) {
    if (issues.length === 0) return null
    return (
        <div className="rounded-md bg-muted/30 px-4 py-3" data-slot="validation-checklist" role="status">
            <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
            <ul className="space-y-1 text-sm">
                {issues.map((i, k) => (
                    <li key={`${i.field ?? ''}:${k}`} className={`flex items-start gap-2 ${i.severity === 'error' ? 'text-destructive' : 'text-amber-700'}`}>
                        {i.severity === 'error' ? <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />}
                        {i.message}
                    </li>
                ))}
            </ul>
        </div>
    )
}

export interface PreviewContent {
    xml?: string
    html?: string
    pdf_url?: string
    pdf_base64?: string
}

/** Contenido de la vista previa (PDF, HTML o XML, en ese orden de preferencia). */
export function PreviewPanel({ preview }: { preview: PreviewContent | null }) {
    if (!preview) return null
    const pdf = preview.pdf_url ?? (preview.pdf_base64 ? `data:application/pdf;base64,${preview.pdf_base64}` : undefined)
    if (pdf) return <iframe title="Vista previa" src={pdf} className="h-96 w-full rounded border" data-slot="preview-pdf" />
    if (preview.html) return <iframe title="Vista previa" srcDoc={preview.html} className="h-96 w-full rounded border" data-slot="preview-html" />
    if (preview.xml) return <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-[11px] leading-tight" data-slot="preview-xml">{preview.xml}</pre>
    return null
}

export interface DraftPreviewProps {
    title: string
    party?: string
    /** Datos del encabezado ya con su etiqueta y valor legibles. */
    header: Array<{ label: string; value: string }>
    lines: LineItem[]
    totals: TotalsRow[]
    fmt: Formatter
}

/**
 * Vista previa local del documento (sin servidor ni borrador): cómo queda con
 * lo capturado. Para tipos sin acción `preview`; la del servidor (PDF/XML) gana.
 */
export function DraftPreview({ title, party, header, lines, totals, fmt }: DraftPreviewProps) {
    const items = lines.filter((l) => l.kind === 'item')
    return (
        <article className="space-y-3 rounded border bg-background p-4 text-xs" data-slot="preview-draft">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
                <span className="text-sm font-semibold">{title}</span>
                {party && <span className="font-medium">{party}</span>}
            </header>
            {header.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {header.map((h) => (
                        <div key={h.label} className="min-w-0">
                            <dt className="text-muted-foreground">{h.label}</dt>
                            <dd className="truncate">{h.value}</dd>
                        </div>
                    ))}
                </dl>
            )}
            <table className="w-full tabular-nums">
                <tbody>
                    {items.map((l) => (
                        <tr key={l.key} className="border-t align-top">
                            <td className="py-1 pr-2">{l.description}</td>
                            <td className="py-1 pr-2 text-right">{l.quantity}</td>
                            <td className="py-1 text-right">{fmt.money(computeLine(l).net)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <TotalsPanel rows={totals} />
        </article>
    )
}

// Proposals: un injerto no muta el formulario; propone un parche. El anfitrión
// lo muestra como diff («antes → después»), lo aplica o lo descarta, y lo
// aplicado siempre se puede deshacer. Mismo flujo para la constancia fiscal,
// una sugerencia de precio o una sugerencia de Aby.
import { useTranslation } from 'react-i18next'
import { Button } from '@asteby/metacore-ui/primitives'
import type { Proposal } from './types'

export { useProposalQueue, type ProposalQueue } from './queue'
import type { ProposalQueue } from './queue'

const show = (v: unknown): string => {
    if (v == null || v === '') return '—'
    if (typeof v === 'object') return (v as { label?: string }).label ?? JSON.stringify(v)
    return String(v)
}

export interface ProposalReviewProps {
    queue: ProposalQueue
    /** Etiqueta del campo (la del formulario del anfitrión). */
    labelOf?: (key: string) => string
    /** Valores actuales, para el «antes». */
    values: Record<string, unknown>
}

/** Diff revisable de las propuestas pendientes + barra de deshacer de la última aplicada. */
export function ProposalReview({ queue, labelOf, values }: ProposalReviewProps) {
    const { t } = useTranslation()
    const label = (p: Proposal, k: string) => p.labels?.[k] ?? labelOf?.(k) ?? k
    if (!queue.pending.length && !queue.applied) return null
    return (
        <div className="mb-4 grid gap-2" data-loom-proposals="">
            {queue.pending.map((p) => {
                const keys = Object.keys(p.patch)
                return (
                    <section
                        key={p.id}
                        aria-label={p.reason ?? t('loom.proposal.title', { defaultValue: 'Cambios propuestos' })}
                        data-loom-proposal={p.graft}
                        className="rounded-lg border bg-muted/40 p-3 text-sm"
                    >
                        <p className="font-medium">
                            {p.reason ?? t('loom.proposal.title', { defaultValue: 'Cambios propuestos' })}
                        </p>
                        <table className="mt-2 w-full text-xs">
                            <thead className="sr-only">
                                <tr>
                                    <th>{t('loom.proposal.field', { defaultValue: 'Campo' })}</th>
                                    <th>{t('loom.proposal.before', { defaultValue: 'Antes' })}</th>
                                    <th>{t('loom.proposal.after', { defaultValue: 'Después' })}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {keys.map((k) => {
                                    const same = show(values[k]) === show(p.patch[k])
                                    return (
                                        <tr key={k} data-field={k} className={same ? 'text-muted-foreground' : undefined}>
                                            <td className="py-0.5 pr-2 font-medium">{label(p, k)}</td>
                                            <td className="py-0.5 pr-2 text-muted-foreground line-through decoration-muted-foreground/50">
                                                {same ? '' : show(values[k])}
                                            </td>
                                            <td className="py-0.5">{show(p.patch[k])}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                        <div className="mt-2 flex gap-2">
                            <Button type="button" size="sm" onClick={() => queue.accept(p.id)}>
                                {t('loom.proposal.apply', { defaultValue: 'Aplicar' })}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => queue.discard(p.id)}>
                                {t('loom.proposal.discard', { defaultValue: 'Descartar' })}
                            </Button>
                        </div>
                    </section>
                )
            })}
            {queue.applied ? (
                <div role="status" className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs" data-loom-applied="">
                    <span>
                        {t('loom.proposal.applied', {
                            defaultValue: 'Se aplicaron {{count}} campos',
                            count: Object.keys(queue.applied.patch).length,
                        })}
                    </span>
                    <Button type="button" size="sm" variant="ghost" onClick={queue.undo}>
                        {t('loom.proposal.undo', { defaultValue: 'Deshacer' })}
                    </Button>
                </div>
            ) : null}
        </div>
    )
}

import { AlertTriangle, CheckCircle2, HelpCircle, Info, RefreshCw, XCircle } from 'lucide-react'
import { Button } from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import { useSetupT } from './messages'
import { TONE_BADGE, TONE_TEXT, metricTone, type Tone } from './tone'
import type { DiagnosticSeverity, HealthIssue, HealthMetric, HealthStatus, SetupFix } from './types'

const STATUS_TONE: Record<HealthStatus, Tone> = { ok: 'good', warn: 'warn', error: 'bad', unknown: 'neutral' }
const STATUS_ICON = { ok: CheckCircle2, warn: AlertTriangle, error: XCircle, unknown: HelpCircle } as const
const SEVERITY_ICON: Record<DiagnosticSeverity, typeof Info> = { info: Info, warn: AlertTriangle, error: XCircle }
const SEVERITY_TONE: Record<DiagnosticSeverity, Tone> = { info: 'info', warn: 'warn', error: 'bad' }

export interface HealthCardProps {
    title?: string
    status: HealthStatus
    /** One line under the status. */
    summary?: string
    metrics?: HealthMetric[]
    issues?: HealthIssue[]
    /** ISO date or preformatted text shown as "Checked …". */
    checkedAt?: string
    /** Setup progress, for a card in the installed-addons list. */
    progress?: { done: number; total: number }
    onFix?: (fix: SetupFix, issue: HealthIssue) => void
    onRefresh?: () => void
    refreshing?: boolean
    /** Shows "Continue setup" (resumes the setup page). */
    onContinue?: () => void
    className?: string
}

/** Status + metrics (with tone) + issues (with fix) of an addon's health probe. */
export function HealthCard({
    title,
    status,
    summary,
    metrics,
    issues,
    checkedAt,
    progress,
    onFix,
    onRefresh,
    refreshing,
    onContinue,
    className,
}: HealthCardProps) {
    const t = useSetupT()
    const known: HealthStatus = status in STATUS_TONE ? status : 'unknown'
    const Icon = STATUS_ICON[known]
    const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null
    return (
        <section className={cn('flex flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground', className)} aria-label={title ?? t('health.metrics')}>
            <header className='flex flex-wrap items-start justify-between gap-3'>
                <div className='min-w-0'>
                    {title ? <h3 className='truncate text-sm font-semibold'>{title}</h3> : null}
                    <div className='flex items-center gap-2 pt-1'>
                        <span data-health-status={known} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', TONE_BADGE[STATUS_TONE[known]])}>
                            <Icon className='h-3.5 w-3.5' aria-hidden='true' />
                            {t(`health.status.${known}`)}
                        </span>
                        {checkedAt ? <span className='text-xs text-muted-foreground'>{t('health.checked_at', { when: checkedAt })}</span> : null}
                    </div>
                    {summary ? <p className='pt-2 text-sm text-muted-foreground'>{summary}</p> : null}
                </div>
                <div className='flex items-center gap-2'>
                    {onRefresh ? (
                        <Button type='button' variant='outline' size='sm' onClick={onRefresh} disabled={refreshing} className='gap-2'>
                            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin motion-reduce:animate-none')} aria-hidden='true' />
                            {t('health.refresh')}
                        </Button>
                    ) : null}
                    {onContinue ? (
                        <Button type='button' size='sm' onClick={onContinue}>
                            {t('health.continue')}
                        </Button>
                    ) : null}
                </div>
            </header>

            {pct !== null && progress ? (
                <div className='flex flex-col gap-1'>
                    <div role='progressbar' aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('flow.progress')} className='h-1.5 w-full overflow-hidden rounded-full bg-muted'>
                        <div className='h-full rounded-full bg-primary transition-all motion-reduce:transition-none' style={{ width: `${pct}%` }} />
                    </div>
                    <span className='text-xs text-muted-foreground'>{t('health.progress', { done: progress.done, total: progress.total })}</span>
                </div>
            ) : null}

            {metrics && metrics.length > 0 ? (
                <dl className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
                    {metrics.map((m) => (
                        <div key={m.key} className='min-w-0 rounded-md border px-3 py-2' data-metric-tone={metricTone(m.tone)}>
                            <dt className='truncate text-xs text-muted-foreground'>{m.label}</dt>
                            <dd className={cn('truncate text-lg font-semibold tabular-nums', TONE_TEXT[metricTone(m.tone)])}>
                                {m.value}
                                {m.unit ? <span className='pl-1 text-xs font-normal text-muted-foreground'>{m.unit}</span> : null}
                            </dd>
                            {m.hint ? <p className='truncate text-xs text-muted-foreground'>{m.hint}</p> : null}
                        </div>
                    ))}
                </dl>
            ) : null}

            {issues && issues.length > 0 ? (
                <ul className='flex flex-col gap-2' aria-label={t('health.issues')}>
                    {issues.map((is, i) => {
                        const SevIcon = SEVERITY_ICON[is.severity] ?? Info
                        return (
                            <li key={is.id ?? i} className='flex flex-wrap items-start justify-between gap-2 rounded-md border px-3 py-2' data-severity={is.severity}>
                                <div className='flex min-w-0 flex-1 items-start gap-2'>
                                    <SevIcon className={cn('mt-0.5 h-4 w-4 shrink-0', TONE_TEXT[SEVERITY_TONE[is.severity] ?? 'info'])} aria-hidden='true' />
                                    <p className='min-w-0 text-sm'>
                                        {is.message}
                                        {is.detail ? <span className='block break-words text-xs text-muted-foreground'>{is.detail}</span> : null}
                                    </p>
                                </div>
                                {is.fix && onFix ? (
                                    <Button type='button' size='sm' variant='outline' className='h-7' onClick={() => onFix(is.fix!, is)}>
                                        {is.fix.label ?? t('flow.fix')}
                                    </Button>
                                ) : null}
                            </li>
                        )
                    })}
                </ul>
            ) : issues ? (
                <p className='text-sm text-muted-foreground'>{t('health.no_issues')}</p>
            ) : null}
        </section>
    )
}

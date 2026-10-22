import { useState, type ReactNode } from 'react'
import { Check, Loader2, Sparkles, X } from 'lucide-react'
import { useInboxLabels, type InboxLabels } from './i18n'
import { cx, FOCUS } from './utils'

export type ProposalRisk = 'low' | 'medium' | 'high'
export type ProposalStatus = 'pending' | 'confirmed' | 'dismissed'

export interface ProposalCardProps {
  id?: string
  title: string
  /** What will happen, in the user's words. */
  description?: string
  /** Optional structured details (recipient, amount...). */
  details?: Array<{ label: string; value: ReactNode }>
  risk?: ProposalRisk
  status?: ProposalStatus
  /** Resolve to mark as confirmed; reject to surface the error and allow retry. */
  onConfirm: () => void | Promise<void>
  onDismiss: () => void | Promise<void>
  labels?: Partial<InboxLabels>
  className?: string
}

const RISK: Record<ProposalRisk, { key: 'riskLow' | 'riskMedium' | 'riskHigh'; cls: string }> = {
  low: { key: 'riskLow', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  medium: { key: 'riskMedium', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  high: { key: 'riskHigh', cls: 'bg-destructive/10 text-destructive' },
}

/** AI-suggested action awaiting a human decision. Controlled or self-managed status. */
export function ProposalCard({ title, description, details, risk, status: controlled, onConfirm, onDismiss, labels: o, className }: ProposalCardProps) {
  const { labels } = useInboxLabels(o)
  const [local, setLocal] = useState<ProposalStatus>('pending')
  const [busy, setBusy] = useState<'confirm' | 'dismiss' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const status = controlled ?? local

  const run = async (kind: 'confirm' | 'dismiss') => {
    if (busy) return
    setBusy(kind)
    setError(null)
    try {
      await (kind === 'confirm' ? onConfirm() : onDismiss())
      setLocal(kind === 'confirm' ? 'confirmed' : 'dismissed')
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : labels.errorBody)
    } finally {
      setBusy(null)
    }
  }

  const done = status !== 'pending'
  const btn = cx('inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors disabled:opacity-50', FOCUS)

  return (
    <section
      aria-label={labels.proposal}
      aria-busy={!!busy}
      className={cx(
        'rounded-2xl border border-border bg-card p-4 shadow-sm transition-opacity duration-200 motion-reduce:transition-none',
        done && 'opacity-70',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{labels.proposal}</p>
            {risk && <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-medium', RISK[risk].cls)}>{labels[RISK[risk].key]}</span>}
          </div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          {details && details.length > 0 && (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {details.map((d) => (
                <div key={d.label} className="contents">
                  <dt className="text-muted-foreground">{d.label}</dt>
                  <dd className="min-w-0 break-words text-foreground">{d.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        {done ? (
          <span role="status" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            {status === 'confirmed' ? <Check className="size-4 text-emerald-600" aria-hidden /> : <X className="size-4" aria-hidden />}
            {status === 'confirmed' ? labels.confirmed : labels.dismissed}
          </span>
        ) : (
          <>
            <button type="button" disabled={!!busy} onClick={() => run('dismiss')} className={cx(btn, 'text-muted-foreground hover:bg-muted')}>
              {labels.dismiss}
            </button>
            <button type="button" disabled={!!busy} onClick={() => run('confirm')} className={cx(btn, 'bg-primary text-primary-foreground hover:opacity-90')}>
              {busy === 'confirm' && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
              {busy === 'confirm' ? labels.confirming : labels.confirm}
            </button>
          </>
        )}
      </div>
    </section>
  )
}

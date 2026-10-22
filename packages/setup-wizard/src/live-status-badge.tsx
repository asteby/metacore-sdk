import { AlertCircle, Check, CircleDashed, HelpCircle, Loader2, Radio } from 'lucide-react'
import { useWizardLabels, type WizardLabels } from './i18n'
import { cx } from './utils'

export type LiveStatus = 'idle' | 'checking' | 'ok' | 'error' | 'missing' | 'wrong_value' | 'propagating'

const TONE: Record<LiveStatus, string> = {
  idle: 'bg-muted text-muted-foreground',
  checking: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  ok: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  error: 'bg-destructive/10 text-destructive',
  missing: 'bg-destructive/10 text-destructive',
  wrong_value: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  propagating: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
}

const LABEL_KEY: Record<LiveStatus, keyof WizardLabels> = {
  idle: 'statusIdle',
  checking: 'statusChecking',
  ok: 'statusOk',
  error: 'statusError',
  missing: 'statusMissing',
  wrong_value: 'statusWrongValue',
  propagating: 'statusPropagating',
}

export interface LiveStatusBadgeProps {
  status: LiveStatus
  /** Overrides the localized text. */
  label?: string
  className?: string
  labels?: Partial<WizardLabels>
}

/** Pill that announces status changes politely to assistive tech. */
export function LiveStatusBadge({ status, label, className, labels: o }: LiveStatusBadgeProps) {
  const labels = useWizardLabels(o)
  const icon = {
    idle: <CircleDashed className="size-3.5" />,
    checking: <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />,
    ok: <Check className="size-3.5" />,
    error: <AlertCircle className="size-3.5" />,
    missing: <HelpCircle className="size-3.5" />,
    wrong_value: <AlertCircle className="size-3.5" />,
    propagating: <Radio className="size-3.5 animate-pulse motion-reduce:animate-none" />,
  }[status]
  return (
    <span
      role="status"
      data-status={status}
      className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-200 motion-reduce:transition-none', TONE[status], className)}
    >
      <span aria-hidden className="inline-flex">{icon}</span>
      {label ?? labels[LABEL_KEY[status]]}
    </span>
  )
}

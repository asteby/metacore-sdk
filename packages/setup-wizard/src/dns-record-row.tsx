import { memo, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useWizardLabels, type WizardLabels } from './i18n'
import { LiveStatusBadge, type LiveStatus } from './live-status-badge'
import { cx, FOCUS } from './utils'

export type DnsRecordStatus = 'missing' | 'wrong_value' | 'propagating' | 'ok'

export interface DnsRecord {
  type: string
  name: string
  value: string
  ttl?: number | string
  priority?: number
}

export interface DnsRecordRowProps {
  record: DnsRecord
  status?: DnsRecordStatus | 'checking'
  /** What the resolver actually returned, for `wrong_value`. */
  found?: string
  /** Human explanation of what is wrong / what to do. */
  diagnostic?: string
  /** Short purpose label, e.g. "SPF". */
  purpose?: string
  required?: boolean
  labels?: Partial<WizardLabels>
  className?: string
}

function CopyButton({ text, label, labels }: { text: string; label: string; labels: WizardLabels }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 1800)
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${labels.copy} ${label}`}
      className={cx('inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-lg px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', FOCUS)}
    >
      {state === 'copied' ? <Check className="size-3.5 text-emerald-600" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      <span aria-live="polite" className={state === 'idle' ? 'sr-only' : ''}>
        {state === 'copied' ? labels.copied : state === 'failed' ? labels.copyFailed : labels.copy}
      </span>
    </button>
  )
}

/** One required DNS record: type / name / value with copy, live status and diagnostic. */
export const DnsRecordRow = memo(function DnsRecordRow({ record, status = 'missing', found, diagnostic, purpose, required = true, labels: o, className }: DnsRecordRowProps) {
  const labels = useWizardLabels(o)
  const badge: LiveStatus = status
  const field = (title: string, value: string, mono = true) => (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</dt>
      <dd className="flex items-start gap-1">
        <code className={cx('min-w-0 flex-1 break-all text-sm text-foreground', mono ? 'font-mono' : 'font-sans')}>{value}</code>
        <CopyButton text={value} label={title} labels={labels} />
      </dd>
    </div>
  )
  return (
    <li
      data-record-status={status}
      className={cx(
        'rounded-xl border bg-card p-3 transition-colors duration-200 motion-reduce:transition-none',
        status === 'ok' ? 'border-emerald-500/30' : status === 'wrong_value' ? 'border-amber-500/40' : 'border-border',
        className,
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">{record.type}</span>
        {purpose && <span className="text-sm font-medium text-foreground">{purpose}</span>}
        {!required && <span className="text-xs text-muted-foreground">{labels.optional}</span>}
        <LiveStatusBadge status={badge} className="ml-auto" labels={o} />
      </div>
      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {field(labels.name, record.name)}
        {field(labels.value, record.value)}
      </dl>
      {(record.ttl != null || record.priority != null) && (
        <p className="mt-2 text-xs text-muted-foreground">
          {record.priority != null && <span className="mr-3">{labels.priority}: {record.priority}</span>}
          {record.ttl != null && <span>{labels.ttl}: {record.ttl}</span>}
        </p>
      )}
      {(diagnostic || (status === 'wrong_value' && found)) && (
        <div className="mt-2 space-y-1 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          {diagnostic && <p>{diagnostic}</p>}
          {status === 'wrong_value' && found && (
            <p>
              {labels.found}: <code className="break-all font-mono text-foreground">{found}</code>
            </p>
          )}
        </div>
      )}
    </li>
  )
})

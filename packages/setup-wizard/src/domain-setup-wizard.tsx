import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, RefreshCw } from 'lucide-react'
import { DnsRecordRow, type DnsRecord, type DnsRecordStatus } from './dns-record-row'
import { useWizardLabels, type WizardLabels } from './i18n'
import { StepWizard } from './step-wizard'
import type { PollInterval } from './polling'
import type { WizardStepDef } from './use-step-wizard'
import type { WizardPersistence } from './wizard-state'
import { cx, FOCUS } from './utils'

export interface DomainRecordSpec extends DnsRecord {
  /** Stable id used to correlate check results. */
  id: string
  purpose?: string
  /** Optional records never block completion. Default true. */
  required?: boolean
}

export interface RecordCheck {
  status: DnsRecordStatus
  found?: string
  diagnostic?: string
}

export interface DomainConnectMethod {
  id: string
  title: string
  description?: string
  icon?: ReactNode
  /** Publish the records through the provider. Throw with a readable message to surface it. */
  onApply: (ctx: { domain: string; records: DomainRecordSpec[] }) => Promise<void>
}

export interface DomainSetupWizardProps {
  domain: string
  records: DomainRecordSpec[]
  /** Resolve the live state of every record, keyed by record id. Called on the polling schedule. */
  checkRecords: (domain: string, signal: AbortSignal) => Promise<Record<string, RecordCheck>>
  /** Automatic publishing methods (Cloudflare, Domain Connect...). Copy & paste is always available. */
  methods?: DomainConnectMethod[]
  /** Poll schedule; arrays are backoff steps in ms and the last one repeats. */
  pollInterval?: PollInterval
  maxAttempts?: number
  persistKey?: string
  persistence?: WizardPersistence
  onComplete?: () => void
  labels?: Partial<WizardLabels>
  className?: string
}

const MANUAL = '__manual'

export function DomainSetupWizard({
  domain,
  records,
  checkRecords,
  methods = [],
  pollInterval = [3000, 6000, 12000, 30000],
  maxAttempts = 60,
  persistKey,
  persistence,
  onComplete,
  labels: o,
  className,
}: DomainSetupWizardProps) {
  const labels = useWizardLabels(o)
  const [method, setMethod] = useState(MANUAL)
  const methodGroup = useId()
  const [checks, setChecks] = useState<Record<string, RecordCheck>>({})
  const [checking, setChecking] = useState(false)
  const check = useRef(checkRecords)
  check.current = checkRecords

  const verify = useCallback(
    async (signal: AbortSignal) => {
      setChecking(true)
      try {
        const res = await check.current(domain, signal)
        if (signal.aborted) return { status: 'pending' as const }
        setChecks(res)
        const required = records.filter((r) => r.required !== false)
        const okCount = required.filter((r) => res[r.id]?.status === 'ok').length
        if (okCount === required.length) return { status: 'ok' as const }
        return { status: 'pending' as const, diagnostic: `${okCount}/${required.length} ${labels.recordsProgress}` }
      } finally {
        setChecking(false)
      }
    },
    [domain, records, labels.recordsProgress],
  )

  const steps = useMemo<WizardStepDef[]>(() => {
    const list: WizardStepDef[] = []
    if (methods.length > 0) {
      list.push({
        id: 'method',
        title: labels.methodTitle,
        description: labels.methodBody,
        actionLabel: method === MANUAL ? labels.next : labels.apply,
        run: async () => {
          const m = methods.find((x) => x.id === method)
          if (m) await m.onApply({ domain, records })
          return { status: 'ok' }
        },
        render: ({ busy }) => (
          <div role="radiogroup" aria-label={labels.methodTitle} className="grid gap-2 sm:grid-cols-2">
            {[{ id: MANUAL, title: labels.methodManual, description: labels.methodManualBody, icon: undefined as ReactNode }, ...methods].map((m) => (
              <label
                key={m.id}
                className={cx(
                  'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring motion-reduce:transition-none',
                  method === m.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                  busy && 'pointer-events-none opacity-60',
                )}
              >
                <input type="radio" name={`${methodGroup}-dns-method`} className="sr-only" checked={method === m.id} onChange={() => setMethod(m.id)} />
                {m.icon && <span aria-hidden>{m.icon}</span>}
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{m.title}</span>
                  {m.description && <span className="block text-xs text-muted-foreground">{m.description}</span>}
                </span>
              </label>
            ))}
          </div>
        ),
      })
    }
    list.push(
      {
        id: 'records',
        title: labels.recordsTitle,
        description: labels.recordsBody,
        autoRun: true,
        run: ({ signal }) => verify(signal),
        poll: { interval: pollInterval, maxAttempts, exhaustedMessage: labels.gaveUp },
        render: ({ busy, run }) => {
          const required = records.filter((r) => r.required !== false)
          const okCount = required.filter((r) => checks[r.id]?.status === 'ok').length
          return (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={required.length}
                  aria-valuenow={okCount}
                  aria-label={labels.recordsTitle}
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                >
                  <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${required.length ? (okCount / required.length) * 100 : 0}%` }} />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {okCount}/{required.length}
                </span>
                <button
                  type="button"
                  onClick={run}
                  className={cx('inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium hover:bg-muted', FOCUS)}
                >
                  <RefreshCw className={cx('size-3.5', (busy || checking) && 'animate-spin motion-reduce:animate-none')} aria-hidden />
                  {labels.checkNow}
                </button>
              </div>
              <ul className="space-y-2">
                {records.map((r) => (
                  <DnsRecordRow
                    key={r.id}
                    record={r}
                    purpose={r.purpose}
                    required={r.required !== false}
                    status={checks[r.id]?.status ?? (busy ? 'checking' : 'missing')}
                    found={checks[r.id]?.found}
                    diagnostic={checks[r.id]?.diagnostic}
                    labels={o}
                  />
                ))}
              </ul>
            </div>
          )
        },
      },
      {
        id: 'done',
        title: labels.doneTitle,
        render: () => (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 className="size-10 text-emerald-500" aria-hidden />
            <p className="text-sm text-muted-foreground">{labels.doneBody}</p>
          </div>
        ),
      },
    )
    return list
  }, [methods, method, domain, records, labels, pollInterval, maxAttempts, verify, checks, checking, o])

  return (
    <StepWizard
      steps={steps}
      persistKey={persistKey ? `domain:${domain}:${persistKey}` : undefined}
      persistence={persistence}
      onComplete={onComplete}
      labels={o}
      className={className}
    />
  )
}

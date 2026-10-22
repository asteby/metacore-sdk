import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { useWizardLabels, type WizardLabels } from './i18n'
import { useStepWizard, type WizardStepDef } from './use-step-wizard'
import { createLocalWizardPersistence, type StepState, type StepStatus, type WizardPersistence } from './wizard-state'
import { cx, FOCUS } from './utils'

export interface StepWizardProps {
  steps: WizardStepDef[]
  /** With `persistence`, progress survives reloads and resumes where it stopped. */
  persistKey?: string
  persistence?: WizardPersistence
  autoAdvance?: boolean
  onComplete?: () => void
  /** Shown on the last step's primary button. */
  finishLabel?: string
  labels?: Partial<WizardLabels>
  className?: string
}

const defaultPersistence = createLocalWizardPersistence()

function StepIcon({ status, index }: { status: StepStatus; index: number }) {
  const base = 'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-200 motion-reduce:transition-none'
  if (status === 'ok') return <span className={cx(base, 'bg-emerald-500 text-white')}><Check className="size-4" aria-hidden /></span>
  if (status === 'error') return <span className={cx(base, 'bg-destructive text-destructive-foreground')}><AlertCircle className="size-4" aria-hidden /></span>
  if (status === 'running') return <span className={cx(base, 'bg-primary text-primary-foreground')}><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /></span>
  return <span className={cx(base, 'border border-border bg-background text-muted-foreground')}>{index + 1}</span>
}

/** Fallback while the reducer syncs steps that appeared after mount. */
const PENDING: StepState = { status: 'pending', attempts: 0 }

/**
 * Generic step wizard. Each step declares an action (`run`), optionally a
 * polling schedule for live verification, and a body. Status, diagnostics,
 * retry and resume are handled here, so addons only describe their steps.
 */
export function StepWizard({ steps, persistKey, persistence, autoAdvance, onComplete, finishLabel, labels: o, className }: StepWizardProps) {
  const labels = useWizardLabels(o)
  const store = persistKey ? (persistence ?? defaultPersistence) : undefined
  const w = useStepWizard({ steps, persistKey, persistence: store, autoAdvance, onComplete })
  const { state } = w
  const step = steps[state.current]
  if (!step) return null
  const st = state.steps[step.id] ?? PENDING
  const busy = st.status === 'running'
  const last = state.current === steps.length - 1
  const statusText: Record<StepStatus, string> = { pending: labels.stepPending, running: labels.stepRunning, ok: labels.stepOk, error: labels.stepError }

  const primary = () => {
    if (step.run && st.status !== 'ok') {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => void w.runStep(step.id)}
          className={cx('inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-60', FOCUS)}
        >
          {busy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
          {busy ? labels.checking : st.status === 'error' ? labels.retry : (step.actionLabel ?? labels.start)}
        </button>
      )
    }
    return (
      <button
        type="button"
        onClick={() => {
          if (st.status !== 'ok') w.markOk(step.id)
          if (!last) w.goTo(state.current + 1)
        }}
        disabled={last && st.status === 'ok' && w.isComplete}
        className={cx('inline-flex min-h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60', FOCUS)}
      >
        {last ? (finishLabel ?? labels.finish) : labels.next}
      </button>
    )
  }

  return (
    <div className={cx('flex max-h-full min-h-0 flex-col rounded-2xl border border-border bg-card', className)}>
      <nav aria-label={labels.stepsLabel} className="shrink-0 border-b border-border/60 px-4 py-3 sm:px-6">
        <p className="text-xs text-muted-foreground sm:hidden" aria-hidden>
          {state.current + 1} / {steps.length}
        </p>
        <ol className="flex items-center gap-2">
          {steps.map((s, i) => {
            const ss = state.steps[s.id] ?? PENDING
            const active = i === state.current
            return (
              <li key={s.id} className={cx('flex min-w-0 items-center gap-2', active ? 'flex-1' : 'max-sm:hidden', i < steps.length - 1 && 'sm:flex-1')} aria-current={active ? 'step' : undefined}>
                <button
                  type="button"
                  onClick={() => w.goTo(i)}
                  className={cx('flex min-w-0 items-center gap-2 rounded-full pr-2 text-left', FOCUS)}
                >
                  <StepIcon status={ss.status} index={i} />
                  <span className={cx('truncate text-sm', active ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{s.title}</span>
                  <span className="sr-only">{statusText[ss.status]}</span>
                </button>
                {i < steps.length - 1 && <span className="mx-1 hidden h-px flex-1 bg-border sm:block" aria-hidden />}
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6" aria-busy={busy}>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{step.title}</h2>
        {step.description && <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>}
        <div className="mt-4">
          {step.render?.({ state: st, busy, run: () => void w.runStep(step.id), retry: () => void w.runStep(step.id), next: () => !last && w.goTo(state.current + 1) })}
        </div>
        <div aria-live="polite" className="mt-4 empty:hidden">
          {st.status === 'running' && st.attempts > 0 && (
            <p className="text-xs text-muted-foreground">
              {labels.attempt} {st.attempts}
            </p>
          )}
          {st.diagnostic && (
            <p
              role={st.status === 'error' ? 'alert' : undefined}
              className={cx('rounded-lg px-3 py-2 text-sm', st.status === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground')}
            >
              <span className="sr-only">{labels.diagnostic}: </span>
              {st.diagnostic}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => w.goTo(state.current - 1)}
          disabled={state.current === 0 || busy}
          className={cx('min-h-10 rounded-full px-4 text-sm text-muted-foreground hover:bg-muted disabled:invisible', FOCUS)}
        >
          {labels.back}
        </button>
        {primary()}
      </div>
    </div>
  )
}

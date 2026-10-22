import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { pollUntil, type PollInterval } from './polling'
import { initialWizardState, sanitizeResume, wizardReducer, type StepState, type WizardPersistence, type WizardState } from './wizard-state'

export interface StepResult {
  /** `pending` = not there yet (e.g. DNS propagating); only meaningful with `poll`. */
  status: 'ok' | 'pending' | 'error'
  diagnostic?: string
}

export interface StepRunContext {
  attempt: number
  signal: AbortSignal
}

export interface StepRenderContext {
  state: StepState
  /** True while the step action/verification is in flight. */
  busy: boolean
  run: () => void
  retry: () => void
  next: () => void
}

export interface WizardStepDef {
  id: string
  title: string
  description?: string
  /** The step action or, with `poll`, the check that is repeated. Throwing marks the step as error. */
  run?: (ctx: StepRunContext) => Promise<StepResult | void>
  /** Re-run `run` on a schedule while it answers `pending` (live verification). */
  poll?: { interval?: PollInterval; maxAttempts?: number; /** Diagnostic shown when attempts run out. */ exhaustedMessage?: string }
  /** Run by itself when the step becomes current (also after resuming). */
  autoRun?: boolean
  /** Label of the primary action button. */
  actionLabel?: string
  render?: (ctx: StepRenderContext) => ReactNode
}

export interface UseStepWizardOptions {
  steps: WizardStepDef[]
  persistKey?: string
  persistence?: WizardPersistence
  /** Move on by itself when the current step succeeds. Default true. */
  autoAdvance?: boolean
  onComplete?: () => void
}

const DEFAULT_INTERVAL: PollInterval = [3000, 5000, 10000, 30000]
const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : String(e))

export function useStepWizard({ steps, persistKey, persistence, autoAdvance = true, onComplete }: UseStepWizardOptions) {
  const ids = useMemo(() => steps.map((s) => s.id), [steps])
  const [state, dispatch] = useReducer(wizardReducer, ids, initialWizardState)
  // Steps/methods may arrive after mount: keep the state in sync with the ids.
  const idsKey = ids.join('\u0000')
  useEffect(() => {
    dispatch({ type: 'sync', ids })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])
  const [ready, setReady] = useState(!(persistKey && persistence))
  const stepsRef = useRef(steps)
  stepsRef.current = steps
  const stateRef = useRef<WizardState>(state)
  stateRef.current = state
  const controllers = useRef(new Map<string, AbortController>())
  // undefined until the first ready evaluation: a flow that was already complete when mounted must not re-fire onComplete.
  const completed = useRef<boolean | undefined>(undefined)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  // Resume.
  useEffect(() => {
    if (!persistKey || !persistence) return
    let cancelled = false
    Promise.resolve(persistence.load(persistKey)).then((saved) => {
      if (cancelled) return
      if (saved) dispatch({ type: 'hydrate', state: sanitizeResume(saved, ids) })
      setReady(true)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey, persistence])

  // Persist every settled change (running steps are saved as pending on resume).
  useEffect(() => {
    if (ready && persistKey && persistence) void persistence.save(persistKey, state)
  }, [state, ready, persistKey, persistence])

  useEffect(() => {
    const map = controllers.current
    return () => map.forEach((c) => c.abort())
  }, [])

  const goTo = useCallback((index: number) => dispatch({ type: 'goto', index }), [])

  const runStep = useCallback(
    async (id: string) => {
      const step = stepsRef.current.find((s) => s.id === id)
      if (!step) return
      controllers.current.get(id)?.abort()
      const ac = new AbortController()
      controllers.current.set(id, ac)
      dispatch({ type: 'start', id })
      const settle = (status: 'ok' | 'error', diagnostic?: string) => {
        if (ac.signal.aborted) return
        dispatch({ type: 'finish', id, status, diagnostic })
        if (status === 'ok' && autoAdvance) {
          const idx = stepsRef.current.findIndex((s) => s.id === id)
          if (idx === stateRef.current.current && idx < stepsRef.current.length - 1) dispatch({ type: 'goto', index: idx + 1 })
        }
      }
      try {
        if (!step.run) return settle('ok')
        if (!step.poll) {
          const r = (await step.run({ attempt: 0, signal: ac.signal })) ?? { status: 'ok' as const }
          return settle(r.status === 'ok' ? 'ok' : 'error', r.diagnostic)
        }
        const out = await pollUntil<StepResult>(async (attempt) => (await step.run!({ attempt, signal: ac.signal })) ?? { status: 'ok' }, {
          interval: step.poll.interval ?? DEFAULT_INTERVAL,
          maxAttempts: step.poll.maxAttempts ?? 40,
          signal: ac.signal,
          until: (r) => r.status !== 'pending',
          onTick: (r, n) => dispatch({ type: 'progress', id, diagnostic: r.diagnostic, attempts: n }),
        })
        if (out.status === 'aborted') return
        if (out.status === 'done') return settle(out.value.status === 'ok' ? 'ok' : 'error', out.value.diagnostic)
        settle('error', step.poll.exhaustedMessage ?? out.value?.diagnostic)
      } catch (e) {
        settle('error', errMsg(e))
      }
    },
    [autoAdvance],
  )

  // Auto-run the current step once ready.
  const current = steps[state.current]
  const currentStatus = current ? state.steps[current.id]?.status : undefined
  useEffect(() => {
    if (ready && current?.autoRun && currentStatus === 'pending') void runStep(current.id)
  }, [ready, current?.id, current?.autoRun, currentStatus, runStep])

  const isComplete = steps.length > 0 && steps.every((s) => state.steps[s.id]?.status === 'ok')
  useEffect(() => {
    if (!ready) return
    if (completed.current === undefined) {
      completed.current = isComplete
      return
    }
    if (isComplete && !completed.current) onCompleteRef.current?.()
    completed.current = isComplete
  }, [isComplete, ready])

  const markOk = useCallback(
    (id: string) => {
      dispatch({ type: 'finish', id, status: 'ok' })
    },
    [],
  )

  const reset = useCallback(() => {
    controllers.current.forEach((c) => c.abort())
    dispatch({ type: 'reset', ids })
    if (persistKey) void persistence?.remove?.(persistKey)
  }, [ids, persistKey, persistence])

  return { state, ready, isComplete, runStep, retryStep: runStep, markOk, goTo, reset }
}

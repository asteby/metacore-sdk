import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import { Slot } from '../slot'
import { useSetupT } from './messages'
import {
    effectiveStatus,
    flowProgress,
    isSatisfied,
    mergeAnswer,
    nextPollDelayMs,
    normalizeState,
    pickActiveStep,
    safeUrl,
    unmetDependencies,
} from './flow-model'
import { RecordsTable } from './records-table'
import { SetupFormStep } from './setup-form-step'
import { StepStatusBadge } from './step-status-badge'
import { TONE_TEXT } from './tone'
import type {
    RunStepInput,
    SetupDiagnostic,
    SetupFix,
    SetupFlowClient,
    SetupFlowDef,
    SetupFlowState,
    SetupStepDef,
    SetupStepState,
} from './types'

export interface SetupCustomStepProps {
    step: SetupStepDef
    state?: SetupStepState
    /** Runs the step on the server (and updates the flow). */
    run: (input?: RunStepInput) => Promise<void>
    refresh: () => Promise<void>
}

export interface SetupFlowProps {
    flow: SetupFlowDef
    client: SetupFlowClient
    /** State already known (e.g. from SSR/cache); the client is still read on mount. */
    initialState?: SetupFlowState
    /** Renders kind=custom. Default: the federated slot `step.slot ?? setup.<flow.key>.<step.key>`. */
    renderCustom?: (p: SetupCustomStepProps) => React.ReactNode
    /** Opens `fix.url`. Default: relative paths via location, absolute in a new tab. */
    onNavigate?: (url: string) => void
    onComplete?: () => void
    /** Automatic re-reads while something runs before asking for a manual refresh. */
    maxPollAttempts?: number
    className?: string
}

const errorMessage = (e: unknown, fallback: string) => {
    const r = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message
    if (typeof r === 'string' && r.trim()) return r
    const m = (e as Error)?.message
    return typeof m === 'string' && m.trim() ? m : fallback
}

/**
 * Resumable setup flow (`contributions.setup`). The server owns the state
 * (`client.getState`); the UI renders each step by `kind`, honours
 * `depends_on` / `optional`, polls with backoff while something runs
 * (`retry_after_s` wins), and offers diagnostics with a fix button.
 */
export function SetupFlow({
    flow,
    client,
    initialState,
    renderCustom,
    onNavigate,
    onComplete,
    maxPollAttempts = 40,
    className,
}: SetupFlowProps) {
    const t = useSetupT()
    const [states, setStates] = useState<Record<string, SetupStepState>>(() => normalizeState(initialState))
    const [serverCompleted, setServerCompleted] = useState<boolean | undefined>(initialState?.completed)
    const [loading, setLoading] = useState(!initialState)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [selected, setSelected] = useState<string | null>(null)
    const [busyCount, setBusyCount] = useState<Record<string, number>>({})
    const [refreshing, setRefreshing] = useState(false)
    const [stepErrors, setStepErrors] = useState<Record<string, string>>({})
    const [pollStopped, setPollStopped] = useState(false)
    const [tick, setTick] = useState(0)
    const [announce, setAnnounce] = useState('')
    const attempts = useRef(0)
    const sig = useRef('')
    const prevStatuses = useRef<Record<string, string>>({})
    const wasIncomplete = useRef(false)
    const clientRef = useRef(client)
    clientRef.current = client
    const onCompleteRef = useRef(onComplete)
    onCompleteRef.current = onComplete
    const hasSubscribe = !!client.subscribe
    const inflight = useRef<Promise<void> | null>(null)
    const alive = useRef(true)
    useEffect(() => {
        alive.current = true
        return () => {
            alive.current = false
        }
    }, [])

    const apply = useCallback((s: SetupFlowState) => {
        setStates(normalizeState(s))
        setServerCompleted(s.completed)
    }, [])

    // `client` / `subscribe` live in refs: a host passing an inline client object
    // (new identity every render) must not restart the fetch/subscribe effects.
    const refresh = useCallback((): Promise<void> => {
        if (inflight.current) return inflight.current
        const run = (async () => {
            if (alive.current) setRefreshing(true)
            try {
                const s = await clientRef.current.getState()
                if (!alive.current) return
                apply(s)
                setLoadError(null)
            } catch (e) {
                if (alive.current) setLoadError(errorMessage(e, t('flow.load_error')))
            } finally {
                inflight.current = null
                if (alive.current) {
                    setRefreshing(false)
                    setLoading(false)
                    setTick((n) => n + 1)
                }
            }
        })()
        inflight.current = run
        return run
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apply])

    useEffect(() => {
        void refresh()
    }, [refresh])

    useEffect(() => {
        if (!hasSubscribe) return
        return clientRef.current.subscribe?.((s) => {
            if (alive.current) apply(s)
        })
    }, [hasSubscribe, apply])

    const defs = flow.steps
    const progress = flowProgress(defs, states, serverCompleted)
    const activeKey = pickActiveStep(defs, states)
    const currentKey = selected && defs.some((d) => d.key === selected) ? selected : activeKey
    const current = defs.find((d) => d.key === currentKey)

    // Polling with backoff while anything runs or the server asked to come back.
    const watching = defs.filter((d) => {
        const st = states[d.key]
        return !!st && !st.skipped && (st.status === 'running' || ((st.retry_after_s ?? 0) > 0 && st.status !== 'ok'))
    })
    const retryHints = watching.map((d) => states[d.key].retry_after_s ?? 0).filter((n) => n > 0)
    const retryHint = retryHints.length ? Math.min(...retryHints) : undefined
    const signature = watching.map((d) => `${d.key}:${states[d.key].status}`).join('|') + `#${retryHint ?? ''}`
    useEffect(() => {
        if (watching.length === 0) {
            attempts.current = 0
            sig.current = ''
            setPollStopped(false)
            return
        }
        if (sig.current !== signature) {
            sig.current = signature
            attempts.current = 0
            setPollStopped(false)
        }
        if (attempts.current >= maxPollAttempts) {
            setPollStopped(true)
            return
        }
        const id = setTimeout(() => {
            attempts.current += 1
            void refresh()
        }, nextPollDelayMs(attempts.current, retryHint))
        return () => clearTimeout(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature, tick, maxPollAttempts])

    // Screen-reader announcement when a step changes status.
    useEffect(() => {
        const prev = prevStatuses.current
        const msgs: string[] = []
        for (const d of defs) {
            const eff = effectiveStatus(d, states)
            if (prev[d.key] && prev[d.key] !== eff) {
                msgs.push(t('flow.status_changed', { step: d.title, status: t(`status.${eff}`) }))
            }
            prev[d.key] = eff
        }
        if (msgs.length) setAnnounce(msgs.join('. '))
    }, [states, defs, t])

    useEffect(() => {
        // Fires on the incomplete -> complete transition only: a flow that was
        // already complete when it mounted does not re-announce itself.
        if (loading) return
        if (!progress.complete) {
            wasIncomplete.current = true
        } else if (wasIncomplete.current) {
            wasIncomplete.current = false
            onCompleteRef.current?.()
        }
    }, [progress.complete, loading])

    const settle = useCallback(
        async (key: string, call: () => Promise<SetupStepState | SetupFlowState | void>, optimistic: boolean) => {
            // Functional updates only: polling/subscribe may have written newer
            // state while the call was in flight, and `busy` is tracked per step.
            const mark = (d: number) =>
                setBusyCount((p) => {
                    const n = (p[key] ?? 0) + d
                    const { [key]: _d, ...rest } = p
                    return n > 0 ? { ...rest, [key]: n } : rest
                })
            mark(1)
            setStepErrors(({ [key]: _d, ...rest }) => rest)
            let marker: SetupStepState | null = null
            let prev: SetupStepState | undefined
            if (optimistic) {
                setStates((p) => {
                    prev = p[key]
                    marker = { ...(p[key] ?? { key, status: 'pending' }), key, status: 'running' }
                    return { ...p, [key]: marker }
                })
            }
            try {
                const answer = await call()
                if (!alive.current) return
                if (answer && 'steps' in answer) setServerCompleted(answer.completed)
                setStates((p) => mergeAnswer(p, key, answer).next)
                if (!answer) await refresh()
                else setTick((n) => n + 1)
            } catch (e) {
                if (!alive.current) return
                if (marker) {
                    const m = marker
                    // Undo only our optimistic marker, never a newer server state.
                    setStates((p) => {
                        if (p[key] !== m) return p
                        const { [key]: _d, ...rest } = p
                        return prev ? { ...rest, [key]: prev } : rest
                    })
                }
                setStepErrors((p) => ({ ...p, [key]: errorMessage(e, t('flow.step_failed')) }))
            } finally {
                if (alive.current) mark(-1)
            }
        },
        [refresh, t],
    )

    const run = useCallback(
        (key: string, input?: RunStepInput) => settle(key, () => client.runStep(key, input), true),
        [client, settle],
    )
    const skip = useCallback((key: string) => settle(key, () => client.skipStep(key), false), [client, settle])

    const onFix = (fix: SetupFix, stepKey: string) => {
        if (fix.step) {
            setSelected(fix.step)
            return
        }
        if (fix.url) {
            const url = safeUrl(fix.url)
            if (!url) return
            if (onNavigate) onNavigate(url)
            else if (url.startsWith('/')) window.location.assign(url)
            else window.open(url, '_blank', 'noopener,noreferrer')
            return
        }
        if (fix.action) void run(stepKey, { action: fix.action })
    }

    if (loading) {
        return (
            <div className={cn('flex items-center gap-2 py-8 text-sm text-muted-foreground', className)} role='status'>
                <Loader2 className='h-4 w-4 animate-spin motion-reduce:animate-none' aria-hidden='true' />
                {t('flow.loading')}
            </div>
        )
    }
    if (loadError && Object.keys(states).length === 0) {
        return (
            <div className={cn('flex flex-col items-start gap-3 py-6', className)}>
                <p role='alert' className='text-sm text-destructive'>
                    {loadError}
                </p>
                <Button type='button' variant='outline' size='sm' onClick={() => void refresh()}>
                    {t('flow.retry')}
                </Button>
            </div>
        )
    }

    return (
        <div className={cn('flex flex-col gap-4', className)} data-setup-flow={flow.key}>
            <header className='flex flex-col gap-2'>
                {flow.title ? <h2 className='text-lg font-semibold'>{flow.title}</h2> : null}
                {flow.description ? <p className='text-sm text-muted-foreground'>{flow.description}</p> : null}
                <div className='flex items-center gap-3'>
                    <div
                        role='progressbar'
                        aria-label={t('flow.progress')}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progress.percent}
                        className='h-2 flex-1 overflow-hidden rounded-full bg-muted'
                    >
                        <div className='h-full rounded-full bg-primary transition-all motion-reduce:transition-none' style={{ width: `${progress.percent}%` }} />
                    </div>
                    <span className='shrink-0 text-xs tabular-nums text-muted-foreground'>
                        {t('health.progress', { done: progress.done, total: progress.total })}
                    </span>
                </div>
                {progress.complete ? (
                    <p className={cn('text-sm font-medium', TONE_TEXT.good)} role='status'>
                        {t('flow.complete')}
                    </p>
                ) : null}
                {loadError ? (
                    <p role='alert' className='text-xs text-destructive'>
                        {loadError}
                    </p>
                ) : null}
            </header>

            <div className='grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]'>
                <nav aria-label={t('flow.steps')}>
                    <ol className='flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0'>
                        {defs.map((d, i) => {
                            const eff = effectiveStatus(d, states)
                            const isCurrent = d.key === currentKey
                            return (
                                <li key={d.key} className='shrink-0 md:shrink'>
                                    <button
                                        type='button'
                                        onClick={() => setSelected(d.key)}
                                        aria-current={isCurrent ? 'step' : undefined}
                                        className={cn(
                                            'flex w-full min-w-[10rem] flex-col items-start gap-1 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-w-0',
                                            isCurrent ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                                        )}
                                    >
                                        <span className='font-medium'>
                                            <span className='tabular-nums text-muted-foreground'>{i + 1}. </span>
                                            {d.title}
                                        </span>
                                        <span className='flex flex-wrap items-center gap-1'>
                                            <StepStatusBadge status={eff} />
                                            {d.optional ? <span className='text-xs text-muted-foreground'>{t('flow.optional')}</span> : null}
                                        </span>
                                    </button>
                                </li>
                            )
                        })}
                    </ol>
                </nav>

                {current ? (
                    <StepPanel
                        key={current.key}
                        flowKey={flow.key}
                        step={current}
                        index={defs.indexOf(current)}
                        total={defs.length}
                        defs={defs}
                        states={states}
                        busy={(busyCount[current.key] ?? 0) > 0}
                        refreshing={refreshing}
                        error={stepErrors[current.key]}
                        pollStopped={pollStopped && watching.some((w) => w.key === current.key)}
                        client={client}
                        renderCustom={renderCustom}
                        onRun={(input) => run(current.key, input)}
                        onSkip={() => skip(current.key)}
                        onRefresh={refresh}
                        onFix={(fix) => onFix(fix, current.key)}
                    />
                ) : null}
            </div>

            <p className='sr-only' role='status' aria-live='polite'>
                {announce}
            </p>
        </div>
    )
}

function StepPanel({
    flowKey,
    step,
    index,
    total,
    defs,
    states,
    busy,
    refreshing,
    error,
    pollStopped,
    client,
    renderCustom,
    onRun,
    onSkip,
    onRefresh,
    onFix,
}: {
    flowKey?: string
    step: SetupStepDef
    index: number
    total: number
    defs: SetupStepDef[]
    states: Record<string, SetupStepState>
    busy: boolean
    refreshing: boolean
    error?: string
    pollStopped: boolean
    client: SetupFlowClient
    renderCustom?: SetupFlowProps['renderCustom']
    onRun: (input?: RunStepInput) => Promise<void>
    onSkip: () => Promise<void>
    onRefresh: () => Promise<void>
    onFix: (fix: SetupFix) => void
}) {
    const t = useSetupT()
    const state = states[step.key]
    const eff = effectiveStatus(step, states)
    const unmet = unmetDependencies(step, states)
    const blocked = eff === 'blocked'
    const running = eff === 'running'
    const titleOf = (k: string) => defs.find((d) => d.key === k)?.title ?? k
    const diagnostics: SetupDiagnostic[] = state?.diagnostics ?? []

    const mainLabel =
        step.action_label ??
        (step.kind === 'action' ? t('flow.run') : state && state.status !== 'pending' ? t('flow.recheck') : t('flow.check'))

    let body: React.ReactNode = null
    if (step.kind === 'form') {
        body = (
            <SetupFormStep
                step={step}
                state={state}
                busy={busy || running}
                onAutosave={client.saveStep ? (values) => client.saveStep!(step.key, values) : undefined}
                onSubmit={(values) => onRun({ values })}
            />
        )
    } else if (step.kind === 'records') {
        body = (
            <RecordsTable
                records={state?.records ?? []}
                caption={step.title}
                rechecking={busy || running}
                onRecheck={blocked ? undefined : () => void onRun()}
                onFix={(fix) => onFix(fix)}
            />
        )
    } else if (step.kind === 'custom') {
        const props: SetupCustomStepProps = { step, state, run: onRun, refresh: onRefresh }
        body = renderCustom ? (
            renderCustom(props)
        ) : (
            <Slot
                name={step.slot ?? `setup.${flowKey ?? 'flow'}.${step.key}`}
                props={props as unknown as Record<string, unknown>}
                fallback={<p className='text-sm text-muted-foreground'>{t('flow.custom_missing')}</p>}
            />
        )
    } else {
        body = (
            <div>
                <Button type='button' onClick={() => void onRun()} disabled={busy || running || blocked}>
                    {busy || running ? <Loader2 className='mr-2 h-4 w-4 animate-spin motion-reduce:animate-none' aria-hidden='true' /> : null}
                    {mainLabel}
                </Button>
            </div>
        )
    }

    return (
        <section className='flex min-w-0 flex-col gap-4 rounded-lg border p-4' aria-labelledby={`setup-step-${step.key}-title`}>
            <header className='flex flex-col gap-1'>
                <p className='text-xs text-muted-foreground'>{t('flow.step_of', { n: index + 1, total })}</p>
                <div className='flex flex-wrap items-center gap-2'>
                    <h3 id={`setup-step-${step.key}-title`} className='text-base font-semibold'>
                        {step.title}
                    </h3>
                    <StepStatusBadge status={eff} />
                    {step.optional ? <span className='text-xs text-muted-foreground'>{t('flow.optional')}</span> : null}
                </div>
                {step.description ? <p className='text-sm text-muted-foreground'>{step.description}</p> : null}
                {state?.message ? <p className='text-sm'>{state.message}</p> : null}
            </header>

            {blocked && unmet.length > 0 ? (
                <div className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
                    <span>{t('flow.waiting_for', { steps: unmet.map(titleOf).join(', ') })}</span>
                    <Button type='button' size='sm' variant='outline' className='h-7' onClick={() => onFix({ step: unmet[0], label: t('flow.go_to_step') })}>
                        {t('flow.go_to_step')}
                    </Button>
                </div>
            ) : (
                body
            )}

            {diagnostics.length > 0 ? (
                <ul className='flex flex-col gap-2' aria-label={t('health.issues')}>
                    {diagnostics.map((d, i) => (
                        <li key={d.code ?? i} className='flex flex-wrap items-start justify-between gap-2 rounded-md border px-3 py-2' data-severity={d.severity ?? 'error'}>
                            <p className='min-w-0 flex-1 text-sm'>
                                {d.message}
                                {d.detail ? <span className='block break-words text-xs text-muted-foreground'>{d.detail}</span> : null}
                            </p>
                            {d.fix ? (
                                <Button type='button' size='sm' variant='outline' className='h-7' disabled={busy} onClick={() => onFix(d.fix!)}>
                                    {d.fix.label ?? t('flow.fix')}
                                </Button>
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : null}

            {error ? (
                <p role='alert' className='text-sm text-destructive'>
                    {error}
                </p>
            ) : null}

            {running ? (
                <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                    <Loader2 className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none' aria-hidden='true' />
                    <span>{t('flow.running')}</span>
                    {pollStopped ? <span>{t('flow.poll_stopped')}</span> : null}
                    <Button type='button' size='sm' variant='ghost' className='h-7 gap-1' onClick={() => void onRefresh()} disabled={refreshing}>
                        <RefreshCw className='h-3.5 w-3.5' aria-hidden='true' />
                        {t('flow.refresh')}
                    </Button>
                </div>
            ) : null}

            {step.optional && !isSatisfied(state) ? (
                <div>
                    <Button type='button' variant='ghost' size='sm' onClick={() => void onSkip()} disabled={busy}>
                        {t('flow.skip')}
                    </Button>
                </div>
            ) : null}
        </section>
    )
}

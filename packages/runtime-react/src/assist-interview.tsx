// AssistInterview — the conversational AI step of a declarative wizard
// (`form_layout.sections[].assist`, kernel v0.141.0).
//
// Link-onboarding style: ONE question at a time as a big typed headline,
// progress beats on top, a single answer input (or quick-reply chips) at the
// bottom, and the assistant's work (fetching a website, thinking…) shown as
// live status. No form inputs: the provider asks for whatever it needs, does
// the work, previews what it found and returns the fields the form takes.
// The panel is generic — it renders the turns the provider sends and knows
// nothing about brands. Protocol (host `/assist/:provider/…`):
//
//   POST /assist/:provider/sessions            { input }         → Session
//   GET  /assist/:provider/sessions/:id                          → Session (poll while working)
//   POST /assist/:provider/sessions/:id/reply  { key, value }    → Session
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input } from '@asteby/metacore-ui/primitives'
import { ArrowRight, Check, CheckCircle2, Loader2, RotateCcw, Sparkles, XCircle } from 'lucide-react'
import { useApi } from './api-context'
import type { FormAssist } from './form-layout'

export interface AssistProgressStep {
    label: string
    state: 'pending' | 'running' | 'done' | 'error'
    detail?: string
}

export interface AssistQuestion {
    key: string
    prompt: string
    kind?: 'text' | 'choice' | 'confirm'
    options?: { value: string; label: string }[]
    placeholder?: string
    /** Prefilled suggestion the user can accept with Enter. */
    suggestion?: string
}

export interface AssistCard {
    kind: string
    title?: string
    logo?: string
    logo_light?: string
    logo_dark?: string
    colors?: Record<string, string>
    lines?: { label: string; value: string }[]
}

export interface AssistTurn {
    id: string
    type: 'message' | 'progress' | 'card' | 'question' | 'answer' | 'result'
    text?: string
    steps?: AssistProgressStep[]
    card?: AssistCard
    question?: AssistQuestion
    fields?: Record<string, any>
}

export interface AssistSession {
    id: string
    working: boolean
    done: boolean
    turns: AssistTurn[]
    result?: Record<string, any>
    error?: string
    /** Optional: how many beats the provider expects (progress dots). */
    beats?: number
}

export interface AssistInterviewProps {
    assist: FormAssist
    /** Live form values; the declared `input` fields are sent on start. */
    values: Record<string, any>
    /** Called with the provider's result fields (limited to `output`). */
    onApply: (fields: Record<string, any>) => void
    /** Start immediately (the step is the chat itself). Default true. */
    autoStart?: boolean
    /** Small uppercase label above the headline (e.g. the step title). */
    eyebrow?: string
    className?: string
}

const POLL_MS = 800
const THINKING_HINTS = ['Un momento…', 'Sigo trabajando…', 'Casi listo…']

function unwrap(res: any): AssistSession {
    const d = res?.data?.data ?? res?.data ?? res
    return d as AssistSession
}

function useTypewriter(text: string) {
    const [n, setN] = useState(0)
    const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    useEffect(() => {
        setN(reduce ? text.length : 0)
    }, [text, reduce])
    useEffect(() => {
        if (n >= text.length) return
        const t = setTimeout(() => setN(v => Math.min(text.length, v + 3)), 22)
        return () => clearTimeout(t)
    }, [n, text])
    return { shown: text.slice(0, n), typing: n < text.length }
}

export function AssistInterview({ assist, values, onApply, autoStart = true, eyebrow, className }: AssistInterviewProps) {
    const api = useApi()
    const [session, setSession] = useState<AssistSession | null>(null)
    const [starting, setStarting] = useState(false)
    const [answer, setAnswer] = useState('')
    const [applied, setApplied] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [hintIdx, setHintIdx] = useState(0)
    const inputRef = useRef<HTMLInputElement | null>(null)
    const base = `/assist/${encodeURIComponent(assist.provider)}/sessions`

    const inputPayload = useMemo(() => {
        const out: Record<string, any> = {}
        for (const k of assist.input ?? []) out[k] = values?.[k]
        return out
    }, [assist.input, values])

    const start = useCallback(async () => {
        if (starting) return
        setStarting(true)
        setError(null)
        setApplied(false)
        try {
            const res = await api.post(base, { input: inputPayload })
            setSession(unwrap(res))
        } catch (e: any) {
            setError(e?.response?.data?.message || e?.message || 'No se pudo iniciar el asistente')
        } finally {
            setStarting(false)
        }
    }, [api, base, inputPayload, starting])

    const autoFired = useRef(false)
    useEffect(() => {
        if (!autoStart || autoFired.current || session) return
        autoFired.current = true
        void start()
    }, [autoStart, session, start])

    // Poll while the provider works.
    useEffect(() => {
        if (!session || !session.working || session.done) return
        const t = setInterval(async () => {
            try {
                const res = await api.get(`${base}/${session.id}`)
                setSession(unwrap(res))
            } catch {
                /* keep polling */
            }
        }, POLL_MS)
        return () => clearInterval(t)
    }, [api, base, session])

    // Rotate the thinking hint while working.
    useEffect(() => {
        if (!session?.working) return
        setHintIdx(0)
        const t = setInterval(() => setHintIdx(i => Math.min(i + 1, THINKING_HINTS.length - 1)), 2600)
        return () => clearInterval(t)
    }, [session?.working])

    // Apply the result once.
    useEffect(() => {
        if (!session?.done || !session.result || applied) return
        const allowed = assist.output?.length ? new Set(assist.output) : null
        const out: Record<string, any> = {}
        for (const [k, v] of Object.entries(session.result)) {
            if (allowed && !allowed.has(k)) continue
            if (v === undefined || v === null || v === '') continue
            out[k] = v
        }
        onApply(out)
        setApplied(true)
    }, [session, applied, assist.output, onApply])

    const reply = useCallback(
        async (key: string, value: any) => {
            if (!session) return
            setAnswer('')
            setSession(s => (s ? { ...s, working: true } : s))
            try {
                const res = await api.post(`${base}/${session.id}/reply`, { key, value })
                setSession(unwrap(res))
            } catch (e: any) {
                setError(e?.response?.data?.message || e?.message || 'No se pudo enviar la respuesta')
                setSession(s => (s ? { ...s, working: false } : s))
            }
        },
        [api, base, session],
    )

    const turns = session?.turns ?? []
    const last = turns[turns.length - 1]
    const pendingQuestion = !session?.working && !session?.done && last?.type === 'question' ? last.question : null
    const lastSpoken = [...turns].reverse().find(t => t.type === 'message' || t.type === 'question')
    const headline = lastSpoken?.type === 'question' ? lastSpoken.question?.prompt ?? '' : lastSpoken?.text ?? ''
    const { shown, typing } = useTypewriter(headline || (starting ? 'Un segundo…' : ''))
    const activeProgress = [...turns].reverse().find(t => t.type === 'progress' && (t.steps ?? []).some(s => s.state !== 'done'))
    const lastCard = [...turns].reverse().find(t => t.type === 'card')?.card
    const answered = turns.filter(t => t.type === 'answer').length
    const beats = Math.max(session?.beats ?? 5, 2)
    const progress = session?.done ? beats : Math.min(answered + 1, beats)
    const running = activeProgress?.steps?.find(s => s.state === 'running')

    useEffect(() => {
        if (pendingQuestion && !typing) inputRef.current?.focus()
    }, [pendingQuestion, typing])

    const submitText = () => {
        if (!pendingQuestion) return
        const v = answer.trim() || pendingQuestion.suggestion || ''
        if (v) void reply(pendingQuestion.key, v)
    }

    return (
        <div className={'relative overflow-hidden rounded-2xl border bg-gradient-to-b from-primary/[0.06] via-background to-background px-5 py-6 sm:px-8 sm:py-8 ' + (className ?? '')}>
            {/* top: eyebrow + beats */}
            <div className="flex items-center justify-between gap-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow || assist.label || 'Asistente'}</p>
                <div className="flex items-center gap-1.5" aria-label="progreso">
                    {Array.from({ length: beats }).map((_, i) => (
                        <span key={i} className={'h-1.5 rounded-full transition-all duration-500 ' + (i < progress ? 'w-6 bg-primary' : 'w-3 bg-muted-foreground/25')} />
                    ))}
                </div>
            </div>

            {/* the question — one at a time, typed out */}
            <div className="mt-5 flex items-start gap-3 sm:gap-4">
                <span className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 sm:size-10">
                    <Sparkles className={'size-4 sm:size-5 ' + (session?.working || starting ? 'animate-pulse' : '')} />
                </span>
                <h3 className="min-h-[3.5rem] text-lg font-semibold leading-snug tracking-tight sm:min-h-[4rem] sm:text-2xl">
                    {shown}
                    {typing && <span className="ml-0.5 inline-block h-5 w-[2px] animate-pulse bg-primary align-middle" />}
                </h3>
            </div>

            {/* status line */}
            <div className="mt-3 min-h-6 pl-12 sm:pl-14">
                {(session?.working || starting) && (
                    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        {running ? running.label + (running.detail ? ` · ${running.detail}` : '') : THINKING_HINTS[hintIdx]}
                    </span>
                )}
                {activeProgress && (
                    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1" aria-label="pasos">
                        {(activeProgress.steps ?? []).map((s, i) => (
                            <li key={i} className={'inline-flex items-center gap-1.5 text-xs ' + (s.state === 'pending' ? 'text-muted-foreground/70' : s.state === 'error' ? 'text-destructive' : 'text-foreground/80')}>
                                {s.state === 'done' ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : s.state === 'running' ? <Loader2 className="size-3.5 animate-spin text-primary" /> : s.state === 'error' ? <XCircle className="size-3.5" /> : <span className="size-1.5 rounded-full bg-muted-foreground/40" />}
                                {s.label}
                            </li>
                        ))}
                    </ul>
                )}
                {!session?.working && activeProgress === undefined && lastCard && !session?.done && <AssistCardView card={lastCard} />}
                {session?.done && (
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        <Check className="size-4" />
                        {applied ? 'Listo. Pulsa Siguiente para revisar lo que armé.' : 'Listo.'}
                    </span>
                )}
                {(error || session?.error) && <p className="text-sm text-destructive">{error || session?.error}</p>}
            </div>

            {/* the answer */}
            {pendingQuestion && (
                <div className="mt-5 pl-0 sm:pl-14">
                    {pendingQuestion.kind === 'choice' || pendingQuestion.kind === 'confirm' ? (
                        <div className="flex flex-wrap gap-2">
                            {(pendingQuestion.options ?? [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }]).map(o => (
                                <Button key={o.value} type="button" variant="outline" className="h-10 rounded-full px-4" onClick={() => void reply(pendingQuestion.key, o.value)}>
                                    {o.label}
                                </Button>
                            ))}
                        </div>
                    ) : (
                        <div className="relative">
                            <Input
                                ref={inputRef}
                                value={answer}
                                onChange={e => setAnswer(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault()
                                        submitText()
                                    }
                                }}
                                placeholder={pendingQuestion.suggestion || pendingQuestion.placeholder || 'Escribe tu respuesta…'}
                                className="h-12 pr-12 text-base"
                                autoFocus
                            />
                            <Button type="button" size="icon" className="absolute right-1.5 top-1.5 size-9" onClick={submitText} disabled={!answer.trim() && !pendingQuestion.suggestion}>
                                <ArrowRight className="size-4" />
                            </Button>
                        </div>
                    )}
                    {pendingQuestion.suggestion && pendingQuestion.kind !== 'choice' && (
                        <p className="pt-1.5 text-xs text-muted-foreground">Enter acepta la sugerencia.</p>
                    )}
                </div>
            )}

            {/* idle / retry */}
            {!session && !starting && (
                <div className="mt-5 pl-0 sm:pl-14">
                    <Button type="button" onClick={() => void start()}>
                        <Sparkles className="mr-2 size-4" />
                        {assist.label || 'Empezar'}
                    </Button>
                </div>
            )}
            {session?.done && (
                <div className="mt-4 pl-0 sm:pl-14">
                    <button type="button" onClick={() => { setSession(null); setApplied(false); autoFired.current = false }} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                        <RotateCcw className="size-3.5" /> Empezar de nuevo
                    </button>
                </div>
            )}
        </div>
    )
}

/** Preview card: logo on dark and light, colour swatches, key/value lines. */
export function AssistCardView({ card }: { card: AssistCard }) {
    const colors = Object.entries(card.colors ?? {})
    const logoDark = card.logo_light || card.logo
    const logoLight = card.logo_dark || card.logo
    return (
        <div className="mt-3 rounded-xl border bg-background p-3">
            {card.title && <p className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{card.title}</p>}
            {(card.logo || card.logo_light || card.logo_dark) && (
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex h-20 items-center justify-center rounded-lg bg-neutral-950 p-3">
                        {logoDark && <img src={logoDark} alt="" className="max-h-full max-w-full object-contain" />}
                    </div>
                    <div className="flex h-20 items-center justify-center rounded-lg border bg-white p-3">
                        {logoLight && <img src={logoLight} alt="" className="max-h-full max-w-full object-contain" />}
                    </div>
                </div>
            )}
            {colors.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-3">
                    {colors.map(([k, v]) => (
                        <span key={k} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs">
                            <span className="size-4 rounded-full border" style={{ backgroundColor: v }} />
                            <span className="text-muted-foreground">{k}</span>
                            <span className="font-mono">{v}</span>
                        </span>
                    ))}
                </div>
            )}
            {(card.lines ?? []).length > 0 && (
                <dl className="grid gap-1 pt-3 text-sm">
                    {card.lines!.map(l => (
                        <div key={l.label} className="grid grid-cols-[6rem_1fr] gap-2">
                            <dt className="text-muted-foreground">{l.label}</dt>
                            <dd className="min-w-0 break-words">{l.value}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    )
}

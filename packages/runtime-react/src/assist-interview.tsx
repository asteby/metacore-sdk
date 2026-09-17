// AssistInterview — the conversational AI panel of an AI-assisted form step
// (`form_layout.sections[].assist`, kernel v0.141.0).
//
// One question at a time, typed out; the host provider does the work (fetch
// a website, call an LLM…) and reports it as progress steps and preview
// cards; the user answers with quick replies or free text; at the end the
// provider returns the fields to merge into the form. The panel is generic:
// it renders whatever turns the provider sends — it knows nothing about
// brands, products or customers. Protocol (host `/assist/:provider/…`):
//
//   POST /assist/:provider/sessions            { input }         → Session
//   GET  /assist/:provider/sessions/:id                          → Session (poll while working)
//   POST /assist/:provider/sessions/:id/reply  { key, value }    → Session
//
//   Session = { id, working, done, turns: Turn[], result?: Record<string, any> }
//   Turn    = { id, type: 'message'|'progress'|'card'|'question'|'result', … }
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
    /** Prefilled suggestion the user can accept as-is. */
    suggestion?: string
}

export interface AssistCard {
    kind: string
    title?: string
    /** Brand-style preview: logo (data/URL) shown on light and dark, swatches, lines. */
    logo?: string
    logo_light?: string
    logo_dark?: string
    colors?: Record<string, string>
    lines?: { label: string; value: string }[]
}

export interface AssistTurn {
    id: string
    type: 'message' | 'progress' | 'card' | 'question' | 'result'
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
}

export interface AssistInterviewProps {
    assist: FormAssist
    /** Live form values; the declared `input` fields are sent on start. */
    values: Record<string, any>
    /** Called with the provider's result fields (already limited to `output`). */
    onApply: (fields: Record<string, any>) => void
    /** Optional: start automatically once every input has a value. */
    autoStart?: boolean
    className?: string
}

const POLL_MS = 900

function unwrap(res: any): AssistSession {
    const d = res?.data?.data ?? res?.data ?? res
    return d as AssistSession
}

/** Typewriter hook (~120 chars/s); instant when the user prefers reduced motion. */
function useTypewriter(text: string) {
    const [n, setN] = useState(0)
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    useEffect(() => {
        setN(reduce ? text.length : 0)
    }, [text, reduce])
    useEffect(() => {
        if (n >= text.length) return
        const t = setTimeout(() => setN(v => Math.min(text.length, v + 3)), 24)
        return () => clearTimeout(t)
    }, [n, text])
    return { shown: text.slice(0, n), typing: n < text.length }
}

export function AssistInterview({ assist, values, onApply, autoStart, className }: AssistInterviewProps) {
    const api = useApi()
    const [session, setSession] = useState<AssistSession | null>(null)
    const [starting, setStarting] = useState(false)
    const [answer, setAnswer] = useState('')
    const [applied, setApplied] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement | null>(null)
    const base = `/assist/${encodeURIComponent(assist.provider)}/sessions`

    const inputPayload = useMemo(() => {
        const out: Record<string, any> = {}
        for (const k of assist.input ?? []) out[k] = values?.[k]
        return out
    }, [assist.input, values])
    const inputsReady = (assist.input ?? []).every(k => {
        const v = values?.[k]
        return v !== undefined && v !== null && String(v).trim() !== ''
    })

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

    // Auto trigger: once, when every input is filled.
    const autoFired = useRef(false)
    useEffect(() => {
        if (!autoStart || autoFired.current || session || !inputsReady) return
        autoFired.current = true
        void start()
    }, [autoStart, inputsReady, session, start])

    // Poll while the provider works (fetching, thinking…).
    useEffect(() => {
        if (!session || !session.working || session.done) return
        const t = setInterval(async () => {
            try {
                const res = await api.get(`${base}/${session.id}`)
                setSession(unwrap(res))
            } catch {
                /* keep polling; the provider marks errors in the session */
            }
        }, POLL_MS)
        return () => clearInterval(t)
    }, [api, base, session])

    // Apply the result once, as soon as it lands.
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
    const lastMessage = [...turns].reverse().find(t => t.type === 'message' || t.type === 'question')
    const headline = lastMessage?.type === 'question' ? lastMessage.question?.prompt ?? '' : lastMessage?.text ?? ''
    const { shown, typing } = useTypewriter(headline)

    useEffect(() => {
        if (pendingQuestion && !typing) inputRef.current?.focus()
    }, [pendingQuestion, typing])

    // ---- idle state: the call to action ------------------------------------
    if (!session) {
        return (
            <div className={'rounded-xl border border-primary/20 bg-primary/5 p-4 ' + (className ?? '')}>
                <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/30">
                        <Sparkles className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug">{assist.label || 'Asistente con IA'}</p>
                        {assist.description && (
                            <p className="pt-1 text-sm text-muted-foreground">{assist.description}</p>
                        )}
                        {error && (
                            <p className="pt-2 text-sm text-destructive">{error}</p>
                        )}
                        <div className="pt-3">
                            <Button type="button" size="sm" onClick={() => void start()} disabled={starting || !inputsReady}>
                                {starting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                                {assist.label || 'Empezar'}
                            </Button>
                            {!inputsReady && (
                                <span className="ml-3 text-xs text-muted-foreground">Completa los campos de arriba para empezar</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // ---- live interview ------------------------------------------------------
    const progress = turns.filter(t => t.type === 'progress')
    const cards = turns.filter(t => t.type === 'card')
    return (
        <div className={'rounded-xl border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent p-4 ' + (className ?? '')}>
            <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/30">
                    <Sparkles className={'size-4 ' + (session.working ? 'animate-pulse' : '')} />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="min-h-[2.5rem] text-base font-semibold leading-snug">
                        {shown}
                        {typing && <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-primary align-middle" />}
                    </p>

                    {progress.map(t => (
                        <ul key={t.id} className="mt-3 grid gap-1.5" aria-label="progreso">
                            {(t.steps ?? []).map((s, i) => (
                                <li key={i} className="flex items-center gap-2 text-sm">
                                    {s.state === 'done' ? (
                                        <CheckCircle2 className="size-4 text-emerald-500" />
                                    ) : s.state === 'running' ? (
                                        <Loader2 className="size-4 animate-spin text-primary" />
                                    ) : s.state === 'error' ? (
                                        <XCircle className="size-4 text-destructive" />
                                    ) : (
                                        <span className="ml-1 mr-1 size-2 rounded-full bg-muted-foreground/30" />
                                    )}
                                    <span className={s.state === 'pending' ? 'text-muted-foreground' : ''}>{s.label}</span>
                                    {s.detail && <span className="truncate text-xs text-muted-foreground">· {s.detail}</span>}
                                </li>
                            ))}
                        </ul>
                    ))}

                    {cards.map(t => t.card && <AssistCardView key={t.id} card={t.card} />)}

                    {session.error && <p className="pt-2 text-sm text-destructive">{session.error}</p>}
                    {error && <p className="pt-2 text-sm text-destructive">{error}</p>}

                    {pendingQuestion && (
                        <div className="pt-3">
                            {pendingQuestion.kind === 'choice' || pendingQuestion.kind === 'confirm' ? (
                                <div className="flex flex-wrap gap-2">
                                    {(pendingQuestion.options ?? [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }]).map(o => (
                                        <Button key={o.value} type="button" size="sm" variant="outline" onClick={() => void reply(pendingQuestion.key, o.value)}>
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
                                                const v = answer.trim() || pendingQuestion.suggestion || ''
                                                if (v) void reply(pendingQuestion.key, v)
                                            }
                                        }}
                                        placeholder={pendingQuestion.suggestion || pendingQuestion.placeholder || 'Escribe tu respuesta…'}
                                        className="h-11 pr-11"
                                    />
                                    <Button
                                        type="button"
                                        size="icon"
                                        className="absolute right-1 top-1 size-9"
                                        onClick={() => {
                                            const v = answer.trim() || pendingQuestion.suggestion || ''
                                            if (v) void reply(pendingQuestion.key, v)
                                        }}
                                    >
                                        <ArrowRight className="size-4" />
                                    </Button>
                                </div>
                            )}
                            {pendingQuestion.suggestion && pendingQuestion.kind !== 'choice' && (
                                <p className="pt-1.5 text-xs text-muted-foreground">Enter acepta la sugerencia.</p>
                            )}
                        </div>
                    )}

                    {session.done && (
                        <div className="flex items-center justify-between gap-3 pt-3">
                            <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                <Check className="size-4" />
                                {applied ? 'Listo: rellené los siguientes pasos. Revísalos y ajusta lo que quieras.' : 'Listo.'}
                            </span>
                            <Button type="button" variant="ghost" size="sm" onClick={() => { setSession(null); setApplied(false) }}>
                                <RotateCcw className="mr-1.5 size-3.5" /> Repetir
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

/** Preview card: logo on dark and light, colour swatches, key/value lines. */
export function AssistCardView({ card }: { card: AssistCard }) {
    const colors = Object.entries(card.colors ?? {})
    const logoDark = card.logo_light || card.logo // white/light variant reads on a dark tile
    const logoLight = card.logo_dark || card.logo
    return (
        <div className="mt-3 rounded-lg border bg-background p-3">
            {card.title && <p className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{card.title}</p>}
            {(card.logo || card.logo_light || card.logo_dark) && (
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex h-20 items-center justify-center rounded-md bg-neutral-950 p-3">
                        {logoDark && <img src={logoDark} alt="" className="max-h-full max-w-full object-contain" />}
                    </div>
                    <div className="flex h-20 items-center justify-center rounded-md border bg-white p-3">
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
                        <div key={l.label} className="grid grid-cols-[7rem_1fr] gap-2">
                            <dt className="text-muted-foreground">{l.label}</dt>
                            <dd className="min-w-0 break-words">{l.value}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    )
}

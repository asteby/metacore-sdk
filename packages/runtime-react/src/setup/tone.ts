// Visual tones shared by the badges, record rows and health metrics. Classes
// are literal strings (Tailwind scans them) with light + dark variants; the
// meaning is never carried by colour alone (every tone also has an icon/text).
import type { MetricTone, RecordStatus, StepStatus } from './types'

export type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'bad'

export const TONE_BADGE: Record<Tone, string> = {
    neutral: 'border-border bg-muted text-muted-foreground',
    info: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    good: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    warn: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300',
    bad: 'border-destructive/40 bg-destructive/10 text-destructive',
}

export const TONE_TEXT: Record<Tone, string> = {
    neutral: 'text-foreground',
    info: 'text-sky-700 dark:text-sky-300',
    good: 'text-emerald-700 dark:text-emerald-300',
    warn: 'text-amber-800 dark:text-amber-300',
    bad: 'text-destructive',
}

export const STEP_TONE: Record<StepStatus, Tone> = {
    pending: 'neutral',
    running: 'info',
    ok: 'good',
    warn: 'warn',
    error: 'bad',
    blocked: 'neutral',
}

export const RECORD_TONE: Record<RecordStatus, Tone> = {
    ok: 'good',
    missing: 'bad',
    wrong_value: 'bad',
    propagating: 'info',
    pending: 'neutral',
    error: 'bad',
}

export function metricTone(t: MetricTone | undefined): Tone {
    return t === 'good' ? 'good' : t === 'warn' ? 'warn' : t === 'bad' ? 'bad' : 'neutral'
}

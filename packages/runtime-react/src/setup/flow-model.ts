// Pure logic of a setup flow (no React): effective status with `depends_on`,
// which step is active, progress, completion and the polling cadence. Kept
// apart so it is tested without rendering anything.
import type { SetupFlowState, SetupStepDef, SetupStepState, StepStatus } from './types'

export const STEP_STATUSES: StepStatus[] = ['pending', 'running', 'ok', 'warn', 'error', 'blocked']

/** Accepts the array or the by-key map the server may send. */
export function normalizeState(raw: SetupFlowState | null | undefined): Record<string, SetupStepState> {
    const out: Record<string, SetupStepState> = {}
    const steps = raw?.steps
    if (!steps) return out
    if (Array.isArray(steps)) {
        for (const s of steps) if (s?.key) out[s.key] = s
    } else {
        for (const [k, s] of Object.entries(steps)) if (s) out[k] = { ...s, key: s.key ?? k }
    }
    return out
}

/** A step counts as satisfied (unblocks dependants) when ok, warn or skipped. */
export function isSatisfied(st: SetupStepState | undefined): boolean {
    if (!st) return false
    return st.status === 'ok' || st.status === 'warn' || st.skipped === true
}

/** Steps this one waits on that are not satisfied yet. */
export function unmetDependencies(
    def: SetupStepDef,
    states: Record<string, SetupStepState>,
): string[] {
    return (def.depends_on ?? []).filter((k) => !isSatisfied(states[k]))
}

/**
 * Status shown for a step: the server's, except that a step whose
 * dependencies are unmet is `blocked` (unless it is already running/ok, which
 * the server decides). A skipped step reads as `ok`.
 */
export function effectiveStatus(
    def: SetupStepDef,
    states: Record<string, SetupStepState>,
): StepStatus {
    const st = states[def.key]
    if (st?.skipped) return 'ok'
    const own = st?.status ?? 'pending'
    if (own === 'ok' || own === 'running') return own
    if (unmetDependencies(def, states).length > 0) return 'blocked'
    return own === 'blocked' ? 'pending' : own
}

/** First step that needs the person: not satisfied and not blocked; else the last. */
export function pickActiveStep(
    defs: SetupStepDef[],
    states: Record<string, SetupStepState>,
): string | undefined {
    if (defs.length === 0) return undefined
    const open = defs.find((d) => {
        const eff = effectiveStatus(d, states)
        return eff !== 'blocked' && !isSatisfied(states[d.key])
    })
    return (open ?? defs[defs.length - 1]).key
}

export interface FlowProgress {
    done: number
    total: number
    percent: number
    complete: boolean
}

/**
 * Progress over the REQUIRED steps (optional ones do not hold completion
 * back, but count as done when they are). The flow is complete when every
 * required step is satisfied; an error step is never satisfied.
 */
export function flowProgress(
    defs: SetupStepDef[],
    states: Record<string, SetupStepState>,
    serverCompleted?: boolean,
): FlowProgress {
    const required = defs.filter((d) => !d.optional)
    const total = required.length
    const done = required.filter((d) => isSatisfied(states[d.key])).length
    const complete = serverCompleted === true || (total > 0 && done === total)
    const shown = serverCompleted === true ? total : done
    return {
        done: shown,
        total,
        percent: total === 0 ? 100 : Math.round((shown / total) * 100),
        complete,
    }
}

export interface BackoffOptions {
    baseMs?: number
    factor?: number
    maxMs?: number
    /** Ceiling honoured for a server `retry_after_s`. */
    maxRetryAfterMs?: number
}

/**
 * Delay before the next poll. Without a hint: exponential from `baseMs`
 * (2s, 3.2s, 5.1s…) capped at `maxMs` (30s). A server `retry_after_s` wins,
 * but never below 1s nor above `maxRetryAfterMs` (5 min).
 */
export function nextPollDelayMs(
    attempt: number,
    retryAfterS?: number,
    opts: BackoffOptions = {},
): number {
    const { baseMs = 2000, factor = 1.6, maxMs = 30000, maxRetryAfterMs = 300000 } = opts
    if (typeof retryAfterS === 'number' && Number.isFinite(retryAfterS) && retryAfterS > 0) {
        return Math.min(Math.max(retryAfterS * 1000, 1000), maxRetryAfterMs)
    }
    const n = Math.max(0, Math.floor(attempt))
    return Math.min(Math.round(baseMs * Math.pow(factor, n)), maxMs)
}

/** Only http(s) and app-relative paths may be opened from a `fix.url`. */
export function safeUrl(url: string | undefined): string | null {
    if (!url) return null
    const u = url.trim()
    // Browsers strip tabs/newlines and treat `\` as `/`, so `/\evil.com` or
    // `/<TAB>/evil.com` resolve to another host: reject control chars and
    // backslashes outright, then require the resolved origin to be ours.
    // eslint-disable-next-line no-control-regex
    if (/[\\\u0000-\u001f\u007f]/.test(u)) return null
    if (u.startsWith('/')) {
        if (u.startsWith('//')) return null
        const origin = typeof location !== 'undefined' && location.origin ? location.origin : 'http://localhost'
        try {
            return new URL(u, origin).origin === origin ? u : null
        } catch {
            return null
        }
    }
    try {
        const p = new URL(u)
        return p.protocol === 'https:' || p.protocol === 'http:' ? p.toString() : null
    } catch {
        return null
    }
}

/** Merges a runStep/skipStep answer (step or whole flow) into the local map. */
export function mergeAnswer(
    current: Record<string, SetupStepState>,
    key: string,
    answer: SetupStepState | SetupFlowState | void | undefined,
): { next: Record<string, SetupStepState>; needsRefetch: boolean } {
    if (!answer) return { next: current, needsRefetch: true }
    if ('steps' in answer) return { next: normalizeState(answer), needsRefetch: false }
    return { next: { ...current, [key]: { ...answer, key: answer.key ?? key } }, needsRefetch: false }
}

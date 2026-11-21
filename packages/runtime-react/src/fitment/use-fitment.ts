// useFitment — THE standard hook to ask "what fits this subject?" from any
// surface (POS, kiosk, quote editor, storefront) over the org's `FitmentRule`
// rows (addon `catalog_fitment`). Rules are loaded once per client and shared
// by every consumer; matching is the pure code in `./match`.
//
// Deliberately free of react-query: federated addon panels must not pull a
// second query client (see use-resource.ts). The client is the host's
// axios-like one, injected like everywhere else: pass `client` when the panel
// mounts outside the host <ApiProvider> (POS/kiosk), otherwise it falls back to
// the ApiProvider context.
import { useEffect, useMemo, useState } from 'react'
import { useOptionalApi, type ApiClient } from '../api-context'
import {
    fitFor,
    rulesForSubject,
    targetsForSubject,
    toFitmentRule,
    type FitmentAttrs,
    type FitmentRule,
    type FitState,
} from './match'

const PAGE = 200 // the kernel clamps per_page to 200

export interface UseFitmentOptions {
    /** Model of the subject whose attributes are given (default `Vehicle`). */
    subjectModel?: string
    /** Attributes of the subject, e.g. the Vehicle row. `null`/`undefined` ⇒ nothing resolved yet. */
    subject?: FitmentAttrs | null
    /** Narrows `targets` and is the default for `fit()` (e.g. `TireSpec`). */
    targetModel?: string
    /** Client to use; defaults to the nearest <ApiProvider>. */
    client?: Pick<ApiClient, 'get'>
    /** Disable the fetch (e.g. the addon is not installed). */
    enabled?: boolean
    /** Rule model name (default `FitmentRule`). */
    ruleModel?: string
}

export interface FitmentResult {
    /** Rules the subject satisfies (active only). */
    rules: FitmentRule[]
    /** Distinct target attribute bags the subject accepts (e.g. sizes). */
    targets: FitmentAttrs[]
    /** Fit state of a target's attributes. `unknown` when no rule covers the subject. */
    fit: (target: FitmentAttrs, targetModel?: string) => FitState
    /** True when at least one rule applies to the subject: the UI may filter/badge. */
    hasRules: boolean
    isLoading: boolean
    error: Error | null
}

type Cached = { rules: FitmentRule[]; at: number }
const TTL_MS = 60_000
const cache = new WeakMap<object, Map<string, Cached>>()
const inflight = new WeakMap<object, Map<string, Promise<FitmentRule[]>>>()

/** Drops the cached rules (tests, or after editing rules). */
export function resetFitmentCache(client?: object) {
    if (client) {
        cache.delete(client)
        inflight.delete(client)
    }
}

function rowsOf(body: unknown): Record<string, unknown>[] {
    const d = (body as { data?: unknown } | undefined)?.data
    if (Array.isArray(d)) return d as Record<string, unknown>[]
    const items = (d as { items?: unknown } | undefined)?.items
    return Array.isArray(items) ? (items as Record<string, unknown>[]) : []
}

/** Loads every active rule of `subjectModel` (paged). Exported for non-React callers and tests. */
export async function loadFitmentRules(
    client: Pick<ApiClient, 'get'>,
    subjectModel: string,
    ruleModel = 'FitmentRule',
): Promise<FitmentRule[]> {
    const key = `${ruleModel}:${subjectModel}`
    const hit = cache.get(client)?.get(key)
    if (hit && Date.now() - hit.at < TTL_MS) return hit.rules
    const pending = inflight.get(client)?.get(key)
    if (pending) return pending
    const run = (async () => {
        const out: FitmentRule[] = []
        for (let page = 1; page <= 50; page++) {
            const res = await client.get(`/data/${ruleModel}`, {
                params: { f_subject_model: `eq:${subjectModel}`, f_is_active: 'eq:true', per_page: PAGE, page },
            })
            const rows = rowsOf(res.data)
            out.push(...rows.map(toFitmentRule))
            if (rows.length < PAGE) break
        }
        const m = cache.get(client) ?? new Map<string, Cached>()
        m.set(key, { rules: out, at: Date.now() })
        cache.set(client, m)
        return out
    })()
    const flights = inflight.get(client) ?? new Map<string, Promise<FitmentRule[]>>()
    flights.set(key, run)
    inflight.set(client, flights)
    try {
        return await run
    } finally {
        flights.delete(key)
    }
}

export function useFitment(opts: UseFitmentOptions = {}): FitmentResult {
    const { subjectModel = 'Vehicle', subject = null, targetModel, enabled = true, ruleModel } = opts
    const ctxClient = useOptionalApi()
    const client = opts.client ?? ctxClient
    const [rules, setRules] = useState<FitmentRule[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)
    const wants = enabled && !!client && !!subject

    useEffect(() => {
        if (!wants || !client) return
        let cancelled = false
        setIsLoading(true)
        loadFitmentRules(client, subjectModel, ruleModel)
            .then((r) => {
                if (cancelled) return
                setRules(r)
                setError(null)
            })
            .catch((e: unknown) => {
                if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)))
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [wants, client, subjectModel, ruleModel])

    return useMemo<FitmentResult>(() => {
        const subj = subject ?? {}
        const applicable = wants ? rulesForSubject(rules, subjectModel, subj) : []
        return {
            rules: applicable,
            targets: wants ? targetsForSubject(rules, subjectModel, subj, targetModel) : [],
            fit: (target, tm) => {
                const model = tm ?? targetModel
                return wants && model !== undefined ? fitFor(rules, subjectModel, subj, model, target) : 'unknown'
            },
            hasRules: applicable.length > 0,
            isLoading,
            error,
        }
    }, [rules, subject, subjectModel, targetModel, wants, isLoading, error])
}

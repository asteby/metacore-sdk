// useAI — ai.complete for addon pages and panels: LLM completions run by the
// host and billed to the org's Pulse Sparks (metacore-kernel RFC 0007,
// docs/capabilities-ai.md). The addon never holds LLM keys.
//
//   const ai = useAI('tickets')
//   const res = await ai.complete({ feature: 'ticket_triage', prompt: text, tier: 'fast' })
//   if (res.status === 'ok') … else <p>{ai.message}</p>   // insufficient_pulse, quota_exceeded… are results
//
// Only caller bugs throw (AICompleteError: forbidden / invalid_input); a call
// started while another one is in flight is not blocked, and a result that
// arrives after unmount is dropped.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    createAIClient,
    type AIAddonUsage,
    type AIClientOptions,
    type AIRequest,
    type AIResult,
    type AIStatus,
} from '@asteby/metacore-sdk'
import { useHostApi } from './addon-page-host'

export interface UseAIState<T = unknown> {
    /** Run one completion; resolves to the result (also kept in `result`). */
    complete: (req: AIRequest) => Promise<AIResult<T>>
    /** Spend of this addon this month against its caps. */
    usage: () => Promise<AIAddonUsage>
    /** True while at least one completion is in flight. */
    loading: boolean
    /** Last result (any status). */
    result: AIResult<T> | null
    /** Status of the last result (`null` before the first call). */
    status: AIStatus | null
    /** Host message when the last status is not `ok`. */
    message: string | null
    /** Last caller error (AICompleteError), cleared on the next call. */
    error: Error | null
    /** Forget result and error. */
    reset: () => void
}

/**
 * Bind ai.complete to `addon` (the calling addon's manifest key) with the
 * host's API client. Must run inside `<AddonPageHost>` or `<HostApiProvider>`.
 */
export function useAI<T = unknown>(addon: string, options?: AIClientOptions): UseAIState<T> {
    const api = useHostApi()
    const client = useMemo(() => createAIClient(api, addon, options), [api, addon, options])
    const [inFlight, setInFlight] = useState(0)
    const [result, setResult] = useState<AIResult<T> | null>(null)
    const [error, setError] = useState<Error | null>(null)
    const mounted = useRef(true)
    const seq = useRef(0)
    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
        }
    }, [])

    const complete = useCallback(
        async (req: AIRequest): Promise<AIResult<T>> => {
            const mine = ++seq.current
            setInFlight((n) => n + 1)
            setError(null)
            try {
                const res = await client.complete<T>(req)
                // Only the latest call writes the visible state.
                if (mounted.current && mine === seq.current) setResult(res)
                return res
            } catch (e) {
                if (mounted.current && mine === seq.current) setError(e as Error)
                throw e
            } finally {
                if (mounted.current) setInFlight((n) => Math.max(0, n - 1))
            }
        },
        [client],
    )

    const reset = useCallback(() => {
        seq.current++
        setResult(null)
        setError(null)
    }, [])

    return {
        complete,
        usage: client.usage,
        loading: inFlight > 0,
        result,
        status: result?.status ?? null,
        message: result && result.status !== 'ok' ? result.message ?? null : null,
        error,
        reset,
    }
}

// Stage layout — per-org persistence of the DynamicKanban lane order. Lets a
// user drag the board's columns (declared stages, custom stages and smart
// lanes alike) into any order; the chosen order is saved server-side and
// re-applied on load (the ops backend stamps it onto `metadata.stages[].order`
// / `smart_lanes[].order`, so the board already paints ordered — this hook only
// owns the drag + the optimistic PUT).
//
// Non-intrusive by design: mirrors `useStageAutomations`. If the host wires no
// `/stage-layout` endpoint, the GET 404s, `available` stays false, and the lane
// drag simply never turns on — the kanban keeps working untouched.
//
// Contract (matches the ops backend; envelope is {success, data} → read .data):
//   GET    /stage-layout?model=<m>  → { model, stage_order: string[] } | null
//   PUT    /stage-layout            { model, stage_order: string[] }  (full order)
//   DELETE /stage-layout?model=<m>  → reset to the declared order
import { useCallback, useEffect, useState } from 'react'
import { useApi } from './api-context'

export interface StageLayout {
    model: string
    /** The full lane order — every lane key (stages + smart lanes) in order. */
    stage_order: string[]
}

export interface UseStageLayoutResult {
    /** True only after a successful GET — gates the lane drag + reset affordance. */
    available: boolean
    /** True when a custom order is stored server-side (drives the reset affordance). */
    hasCustomLayout: boolean
    /** Persist the full lane order (the new order of every lane key). Throws on failure. */
    save: (order: string[]) => Promise<void>
    /** Drop the stored order, reverting to the declared stage order. */
    reset: () => Promise<void>
}

function unwrap(res: { data: any }): any {
    const body = res?.data
    if (body && typeof body === 'object' && 'data' in body) return body.data
    return body
}

/**
 * Loads a model's saved lane order (only to learn availability + whether a
 * custom order exists) and exposes save/reset. A missing endpoint degrades to
 * `available: false` so the board's lane drag stays off; a real save failure
 * re-throws so the caller can revert its optimistic reorder.
 */
export function useStageLayout(model: string): UseStageLayoutResult {
    const api = useApi()
    const [available, setAvailable] = useState(false)
    const [hasCustomLayout, setHasCustomLayout] = useState(false)

    useEffect(() => {
        let cancelled = false
        api
            .get(`/stage-layout?model=${encodeURIComponent(model)}`)
            .then((res) => {
                if (cancelled) return
                setAvailable(true)
                const data = unwrap(res)
                const order = data?.stage_order
                setHasCustomLayout(Array.isArray(order) && order.length > 0)
            })
            .catch(() => {
                // Endpoint absent or errored — leave lane drag off.
                if (!cancelled) setAvailable(false)
            })
        return () => {
            cancelled = true
        }
    }, [api, model])

    const save = useCallback(
        async (order: string[]) => {
            const res = (await api.put('/stage-layout', {
                model,
                stage_order: order,
            })) as { data?: { success?: boolean; message?: string } }
            if (res?.data && res.data.success === false) {
                throw new Error(res.data.message || 'stage_layout_save_failed')
            }
            setHasCustomLayout(true)
        },
        [api, model],
    )

    const reset = useCallback(async () => {
        await api.delete(`/stage-layout?model=${encodeURIComponent(model)}`)
        setHasCustomLayout(false)
    }, [api, model])

    return { available, hasCustomLayout, save, reset }
}

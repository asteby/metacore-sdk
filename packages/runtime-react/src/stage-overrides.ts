// Stage overrides — per-org customization of a model's DECLARED kanban lanes
// (Backlog, Done, …). A user can rename a lane, recolor it, and attach extra
// "conditions" (a field/operator/value builder) that narrow which cards the lane
// shows and counts — all without touching the addon manifest. The chosen values
// are stored server-side and the kernel serves each declared stage already
// carrying the overridden label/color (+ an `overridden` flag and the extra
// `filters`), so the board paints them straight from `metadata.stages`.
//
// Custom stages (`custom: true`) are NOT edited here — they keep their own CRUD
// (`/custom-stages`); this hook only owns the DECLARED-lane overrides.
//
// Non-intrusive by design: mirrors `useStageLayout`. If the host wires no
// `/stage-overrides` endpoint, the GET 404s, `available` stays false, and the
// per-lane gear (⚙) simply never renders on declared stages — the kanban keeps
// working untouched.
//
// Contract (matches the ops backend; envelope is {success, data} → read .data):
//   GET    /stage-overrides?model=<m>                  → [{ stage_key, label?, color?, filters? }] | null
//   PUT    /stage-overrides   { model, stage_key, label?, color?, filters? }   (upsert)
//   DELETE /stage-overrides?model=<m>&stage_key=<k>    → reset the lane to its declared default
import { useCallback, useEffect, useState } from 'react'
import { useApi } from './api-context'
import type { CustomStageFilter } from './custom-stages'

/** Fields a stage override can carry. All optional — send only what changed. */
export interface StageOverridePatch {
    label?: string
    color?: string
    /** Extra lane conditions (same shape/ops as smart-lane filters). */
    filters?: CustomStageFilter[]
}

export interface UseStageOverridesResult {
    /** True only after a successful GET — gates the per-lane gear on declared stages. */
    available: boolean
    /** Upsert a declared lane's override (label/color/conditions). Throws on failure. */
    save: (stageKey: string, patch: StageOverridePatch) => Promise<void>
    /** Reset a declared lane to its manifest default (drops the stored override). */
    reset: (stageKey: string) => Promise<void>
}

/**
 * Learns whether the host wired `/stage-overrides` (so the gear can appear on
 * declared lanes) and exposes save/reset. A missing endpoint degrades to
 * `available: false`; a real save/reset failure re-throws so the caller can
 * surface an error + revert. The overridden VALUES themselves are read off
 * `metadata.stages` (the kernel applies them), so this hook doesn't cache a list.
 */
export function useStageOverrides(model: string): UseStageOverridesResult {
    const api = useApi()
    const [available, setAvailable] = useState(false)

    useEffect(() => {
        let cancelled = false
        api
            .get(`/stage-overrides?model=${encodeURIComponent(model)}`)
            .then(() => {
                if (!cancelled) setAvailable(true)
            })
            .catch(() => {
                // Endpoint absent or errored — leave the gear off on declared lanes.
                if (!cancelled) setAvailable(false)
            })
        return () => {
            cancelled = true
        }
    }, [api, model])

    const save = useCallback(
        async (stageKey: string, patch: StageOverridePatch) => {
            const res = (await api.put('/stage-overrides', {
                model,
                stage_key: stageKey,
                ...patch,
            })) as { data?: { success?: boolean; message?: string } }
            if (res?.data && res.data.success === false) {
                throw new Error(res.data.message || 'stage_override_save_failed')
            }
        },
        [api, model],
    )

    const reset = useCallback(
        async (stageKey: string) => {
            await api.delete(
                `/stage-overrides?model=${encodeURIComponent(
                    model,
                )}&stage_key=${encodeURIComponent(stageKey)}`,
            )
        },
        [api, model],
    )

    return { available, save, reset }
}

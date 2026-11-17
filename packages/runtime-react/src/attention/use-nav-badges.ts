import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { aggregateBadges, isSeverity, type NavBadgeValue, type Severity } from '@asteby/metacore-ui/layout'
import { useApi } from '../api-context'
import { useRealtimeInvalidate } from '../realtime-context'

/** Wire shape of one counter served by kernel `navcounts` (GET /nav/counts). */
export interface NavCountDTO {
    id: string
    count: number
    tone: string
    label?: string
    href?: string
    refresh_on?: string[]
}

export interface AttentionBadge extends NavBadgeValue {
    id: string
    /** Deep link to the list filtered by the same predicate the count used. */
    href?: string
}

export const NAV_BADGES_QUERY_KEY = ['nav-badges'] as const

/** Pure: DTO list -> map by id, dropping zero/invalid rows, unknown tone -> info. */
export function parseNavCounts(rows: unknown, translate: (k: string, count: number) => string = (k) => k): Map<string, AttentionBadge> {
    const out = new Map<string, AttentionBadge>()
    if (!Array.isArray(rows)) return out
    for (const r of rows as NavCountDTO[]) {
        if (!r || typeof r.id !== 'string' || typeof r.count !== 'number' || r.count <= 0) continue
        const tone: Severity = isSeverity(r.tone) ? r.tone : 'info'
        out.set(r.id, { id: r.id, count: r.count, tone, label: r.label ? translate(r.label, r.count) : undefined, href: r.href })
    }
    return out
}

export interface UseNavBadgesOptions {
    /** Default '/nav/counts'. */
    endpoint?: string
    /** Default 60s. No interval polling: freshness comes from realtime events. */
    staleTimeMs?: number
    enabled?: boolean
    /** Data-event models that should refresh the counters (the union of each counter's refresh_on). */
    refreshModels?: string[]
}

export interface UseNavBadgesResult {
    badges: ReadonlyMap<string, AttentionBadge>
    /** Sum over all counters (what the tab title / bell show). */
    count: number
    /** Most severe tone across counters. */
    tone: Severity
    isLoading: boolean
    refetch: () => void
}

/**
 * One batched request for every attention counter the user may see. Reuses the
 * realtime backbone (data events -> debounced invalidate) instead of polling.
 */
export function useNavBadges(opts: UseNavBadgesOptions = {}): UseNavBadgesResult {
    const { endpoint = '/nav/counts', staleTimeMs = 60_000, enabled = true, refreshModels } = opts
    const api = useApi()
    const qc = useQueryClient()
    const { t } = useTranslation()
    const q = useQuery({
        queryKey: [...NAV_BADGES_QUERY_KEY, endpoint],
        enabled,
        staleTime: staleTimeMs,
        refetchOnWindowFocus: true,
        queryFn: async () => {
            const res = await api.get(endpoint)
            const body = res.data
            return (body && typeof body === 'object' && 'data' in body ? body.data : body) as NavCountDTO[]
        },
    })
    useRealtimeInvalidate({
        models: refreshModels ?? [],
        match: (key) => key[0] === NAV_BADGES_QUERY_KEY[0],
    })
    const badges = useMemo(
        () => parseNavCounts(q.data, (k, count) => t(k, { count, defaultValue: k })),
        [q.data, t],
    )
    const agg = useMemo(() => aggregateBadges(badges.values()), [badges])
    return {
        badges,
        count: agg.count,
        tone: agg.tone,
        isLoading: q.isLoading,
        refetch: () => void qc.invalidateQueries({ queryKey: NAV_BADGES_QUERY_KEY }),
    }
}

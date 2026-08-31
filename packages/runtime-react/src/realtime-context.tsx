// realtime-context — React surface over the host's RealtimeAPI
// (`@asteby/metacore-sdk`): a provider the host mounts once, `useRealtime`
// for handlers, `useRealtimeInvalidate` to refresh react-query caches, and
// `useRealtimeTick` — the opt-in refetch signal `DynamicTable` /
// `DynamicKanban` consume through their `realtime` prop.
//
// Module-federation note: a federated addon may run its OWN copy of this
// module, in which case React context from the host is invisible to it. Every
// hook therefore accepts an explicit `client` (pass `host.realtime` or
// `api.realtime`) that wins over the context — the plain object crosses the
// federation boundary, the context does not.
//
// react-query: `useRealtimeInvalidate` uses `useQueryClient()` so it always
// targets the QueryClient the host mounted (single instance per page).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { QueryKey } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import type {
    DataEvent,
    DataEventAction,
    DataEventHandler,
    RealtimeAPI,
    RealtimeStatus,
    RealtimeSubscribeOptions,
} from '@asteby/metacore-sdk'

export interface RealtimeContextValue {
    /** Host-provided client, or null when the host has no realtime. */
    client: RealtimeAPI | null
    /**
     * When true, `DynamicTable` / `DynamicKanban` refetch on data events
     * unless a component passes `realtime={false}`. Default false (opt-in).
     */
    defaultRealtime: boolean
}

const RealtimeContext = createContext<RealtimeContextValue>({ client: null, defaultRealtime: false })

export interface RealtimeProviderProps {
    client: RealtimeAPI | null | undefined
    /** Turn realtime refetch on for every dynamic table/kanban below. Default false. */
    defaultRealtime?: boolean
    children: React.ReactNode
}

/**
 * Mount once, inside the host's WebSocket provider and QueryClientProvider.
 * `client` may be null while the host is still connecting — hooks become
 * no-ops and re-subscribe when a client appears.
 */
export function RealtimeProvider({ client, defaultRealtime = false, children }: RealtimeProviderProps) {
    const value = useMemo<RealtimeContextValue>(
        () => ({ client: client ?? null, defaultRealtime }),
        [client, defaultRealtime],
    )
    return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}

/** The host realtime client from context (null when none is mounted). */
export function useRealtimeClient(explicit?: RealtimeAPI | null): RealtimeAPI | null {
    const ctx = useContext(RealtimeContext)
    return explicit ?? ctx.client
}

/** Whether dynamic components should refetch on data events by default. */
export function useRealtimeDefault(): boolean {
    return useContext(RealtimeContext).defaultRealtime
}

export interface UseRealtimeOptions extends RealtimeSubscribeOptions {
    /** Pass `host.realtime` / `api.realtime` to bypass the context. */
    client?: RealtimeAPI | null
    /** Set false to pause the subscription without unmounting. Default true. */
    enabled?: boolean
}

/**
 * Subscribe to data events for the given models. The handler is kept in a
 * ref so callers don't need to memoise it; the subscription is torn down on
 * unmount and re-created when models/events/client change.
 *
 *   useRealtime({ models: ['SalesOrder'], client: host.realtime }, (e) => {
 *     if (e.action === 'resync' || e.id === currentId) refetch()
 *   })
 */
export function useRealtime(options: UseRealtimeOptions, handler: DataEventHandler): void {
    const client = useRealtimeClient(options.client)
    const handlerRef = useRef(handler)
    handlerRef.current = handler
    const enabled = options.enabled ?? true
    const modelsKey = (options.models ?? []).map((m) => m.trim().toLowerCase()).sort().join('|')
    const eventsKey = (options.events ?? []).slice().sort().join('|')

    useEffect(() => {
        if (!client || !enabled || !modelsKey) return
        const models = modelsKey.split('|')
        const events = eventsKey ? (eventsKey.split('|') as DataEventAction[]) : undefined
        let off: () => void = () => {}
        try {
            off = client.subscribe({ models, events }, (event) => handlerRef.current(event))
        } catch {
            /* a host client must not throw, but never take the page down */
        }
        return off
    }, [client, enabled, modelsKey, eventsKey])
}

/** Live status of the realtime client ('closed' when none). */
export function useRealtimeStatus(explicit?: RealtimeAPI | null): RealtimeStatus {
    const client = useRealtimeClient(explicit)
    const [status, setStatus] = useState<RealtimeStatus>(() => client?.status() ?? 'closed')
    useEffect(() => {
        if (!client) {
            setStatus('closed')
            return
        }
        setStatus(client.status())
        if (!client.onStatus) return
        return client.onStatus(setStatus)
    }, [client])
    return status
}

/** Default matcher: any string segment of the query key (case-insensitive)
 *  equals the event's model, table or `addon.model`, or contains the model
 *  as a path segment (`/data/sales_orders`). */
export function queryKeyMatchesEvent(queryKey: QueryKey, event: DataEvent): boolean {
    const needles = [event.model, event.table ?? '', `${event.addon}.${event.model}`]
        .map((s) => s.toLowerCase())
        .filter(Boolean)
    const parts = flattenKey(queryKey)
    for (const part of parts) {
        const p = part.toLowerCase()
        for (const n of needles) {
            if (p === n) return true
            // '/data/sales_orders?x=1' or 'pos/SalesOrder' style segments.
            const segs = p.split(/[/?&=]/)
            if (segs.includes(n)) return true
        }
    }
    return false
}

function flattenKey(key: QueryKey, out: string[] = [], depth = 0): string[] {
    if (depth > 4) return out
    for (const item of key as unknown[]) {
        if (typeof item === 'string') out.push(item)
        else if (Array.isArray(item)) flattenKey(item as QueryKey, out, depth + 1)
        else if (item && typeof item === 'object') {
            for (const v of Object.values(item as Record<string, unknown>)) {
                if (typeof v === 'string') out.push(v)
            }
        }
    }
    return out
}

export interface UseRealtimeInvalidateOptions extends UseRealtimeOptions {
    /** Override which queries a given event invalidates. Default: `queryKeyMatchesEvent`. */
    match?: (queryKey: QueryKey, event: DataEvent) => boolean
    /** Coalesce bursts before invalidating (ms). Default 250. */
    debounceMs?: number
    /** Observe each event after it was scheduled for invalidation. */
    onEvent?: DataEventHandler
}

/**
 * Invalidate every react-query query whose key mentions the event's model /
 * table (see `queryKeyMatchesEvent`). Uses the host's QueryClient. Bursts
 * are debounced so a coalesced frame storm becomes a single refetch round.
 *
 *   useRealtimeInvalidate({ models: ['SalesOrder', 'sales_order_items'], client: host.realtime })
 */
export function useRealtimeInvalidate(options: UseRealtimeInvalidateOptions): void {
    const queryClient = useQueryClient()
    const { match = queryKeyMatchesEvent, debounceMs = 250, onEvent } = options
    const pendingRef = useRef<DataEvent[]>([])
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const matchRef = useRef(match)
    matchRef.current = match
    const onEventRef = useRef(onEvent)
    onEventRef.current = onEvent

    const flush = useCallback(() => {
        timerRef.current = null
        const batch = pendingRef.current
        pendingRef.current = []
        if (batch.length === 0) return
        void queryClient.invalidateQueries({
            predicate: (query) => batch.some((event) => matchRef.current(query.queryKey, event)),
        })
    }, [queryClient])

    useRealtime(options, (event) => {
        pendingRef.current.push(event)
        onEventRef.current?.(event)
        if (timerRef.current) return
        timerRef.current = setTimeout(flush, debounceMs)
    })

    useEffect(
        () => () => {
            if (timerRef.current) clearTimeout(timerRef.current)
        },
        [],
    )
}

export interface UseRealtimeTickOptions {
    /** Models/tables to watch. */
    models: string[]
    /** Explicit client (federated addons). */
    client?: RealtimeAPI | null
    /** Master switch — the caller resolves prop vs provider default. */
    enabled: boolean
    /** Coalesce bursts before ticking (ms). Default 300. */
    debounceMs?: number
}

/**
 * A counter that increments (debounced) whenever a data event lands for one
 * of `models`. Fold it into a refetch effect's dependencies — that is exactly
 * what `DynamicTable` / `DynamicKanban` do behind their `realtime` prop.
 */
export function useRealtimeTick(options: UseRealtimeTickOptions): number {
    const [tick, setTick] = useState(0)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const debounceMs = options.debounceMs ?? 300

    useRealtime(
        { models: options.models, client: options.client, enabled: options.enabled },
        () => {
            if (timerRef.current) return
            timerRef.current = setTimeout(() => {
                timerRef.current = null
                setTick((t) => t + 1)
            }, debounceMs)
        },
    )

    useEffect(
        () => () => {
            if (timerRef.current) clearTimeout(timerRef.current)
        },
        [],
    )
    return tick
}

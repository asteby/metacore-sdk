// @vitest-environment happy-dom
//
// Realtime hooks over a fake RealtimeAPI: useRealtime subscribes/unsubscribes
// with normalised models, an explicit client beats the context (federation
// boundary), useRealtimeInvalidate targets the host QueryClient by key match,
// and useRealtimeTick debounces bursts into one bump.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { DataEvent, DataEventHandler, RealtimeAPI, RealtimeSubscribeOptions } from '@asteby/metacore-sdk'
import {
    RealtimeProvider,
    queryKeyMatchesEvent,
    useRealtime,
    useRealtimeInvalidate,
    useRealtimeStatus,
    useRealtimeTick,
} from '../realtime-context'

afterEach(cleanup)

function fakeClient() {
    const subs: Array<{ opts: RealtimeSubscribeOptions; handler: DataEventHandler }> = []
    const statusListeners = new Set<(s: 'connecting' | 'open' | 'closed') => void>()
    let status: 'connecting' | 'open' | 'closed' = 'open'
    const client: RealtimeAPI & { subs: typeof subs; emit: (e: DataEvent) => void; setStatus: (s: typeof status) => void } = {
        subs,
        subscribe(opts, handler) {
            const entry = { opts, handler }
            subs.push(entry)
            return () => {
                const i = subs.indexOf(entry)
                if (i >= 0) subs.splice(i, 1)
            }
        },
        status: () => status,
        onStatus(l) {
            statusListeners.add(l)
            return () => statusListeners.delete(l)
        },
        emit(e) {
            subs.forEach((s) => s.handler(e))
        },
        setStatus(s) {
            status = s
            statusListeners.forEach((l) => l(s))
        },
    }
    return client
}

const event = (over: Partial<DataEvent> = {}): DataEvent => ({
    org_id: 'org',
    addon: 'pos',
    model: 'SalesOrder',
    table: 'sales_orders',
    action: 'updated',
    id: '1',
    at: '2026-08-31T00:00:00Z',
    ...over,
})

describe('useRealtime', () => {
    it('subscribes through the context client with normalised models and tears down on unmount', () => {
        const client = fakeClient()
        const handler = vi.fn()
        const wrapper = ({ children }: { children: ReactNode }) => (
            <RealtimeProvider client={client}>{children}</RealtimeProvider>
        )
        const { unmount } = renderHook(() => useRealtime({ models: [' SalesOrder ', 'WorkOrder'] }, handler), { wrapper })
        expect(client.subs).toHaveLength(1)
        expect(client.subs[0]!.opts.models).toEqual(['salesorder', 'workorder'])
        client.emit(event())
        expect(handler).toHaveBeenCalledTimes(1)
        unmount()
        expect(client.subs).toHaveLength(0)
    })

    it('prefers an explicit client over the context (federated addons)', () => {
        const ctxClient = fakeClient()
        const explicit = fakeClient()
        const wrapper = ({ children }: { children: ReactNode }) => (
            <RealtimeProvider client={ctxClient}>{children}</RealtimeProvider>
        )
        renderHook(() => useRealtime({ models: ['SalesOrder'], client: explicit }, () => {}), { wrapper })
        expect(explicit.subs).toHaveLength(1)
        expect(ctxClient.subs).toHaveLength(0)
    })

    it('is a no-op without a client, without models, or when disabled', () => {
        const client = fakeClient()
        renderHook(() => useRealtime({ models: ['SalesOrder'] }, () => {}))
        renderHook(() => useRealtime({ models: [], client }, () => {}))
        renderHook(() => useRealtime({ models: ['SalesOrder'], client, enabled: false }, () => {}))
        expect(client.subs).toHaveLength(0)
    })
})

describe('useRealtimeStatus', () => {
    it('tracks the client status', () => {
        const client = fakeClient()
        const { result } = renderHook(() => useRealtimeStatus(client))
        expect(result.current).toBe('open')
        act(() => client.setStatus('connecting'))
        expect(result.current).toBe('connecting')
        const { result: none } = renderHook(() => useRealtimeStatus(null))
        expect(none.current).toBe('closed')
    })
})

describe('queryKeyMatchesEvent', () => {
    it('matches model, table, qualified name and path segments (case-insensitive)', () => {
        const e = event()
        expect(queryKeyMatchesEvent(['salesorder', 'list'], e)).toBe(true)
        expect(queryKeyMatchesEvent(['data', 'sales_orders', { page: 1 }], e)).toBe(true)
        expect(queryKeyMatchesEvent(['pos.SalesOrder'], e)).toBe(true)
        expect(queryKeyMatchesEvent(['/data/sales_orders?page=1'], e)).toBe(true)
        expect(queryKeyMatchesEvent([{ model: 'SalesOrder' }], e)).toBe(true)
        expect(queryKeyMatchesEvent(['work_orders'], e)).toBe(false)
        expect(queryKeyMatchesEvent(['sales_orders_archive'], e)).toBe(false)
    })
})

describe('useRealtimeInvalidate', () => {
    it('invalidates only the queries whose key mentions the event model, debounced', async () => {
        vi.useFakeTimers()
        try {
            const client = fakeClient()
            const queryClient = new QueryClient()
            queryClient.setQueryData(['sales_orders', 'list'], [])
            queryClient.setQueryData(['work_orders', 'list'], [])
            const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
            const wrapper = ({ children }: { children: ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <RealtimeProvider client={client}>{children}</RealtimeProvider>
                </QueryClientProvider>
            )
            const onEvent = vi.fn()
            renderHook(() => useRealtimeInvalidate({ models: ['SalesOrder'], debounceMs: 100, onEvent }), { wrapper })

            act(() => {
                client.emit(event({ id: '1' }))
                client.emit(event({ id: '2' }))
            })
            expect(onEvent).toHaveBeenCalledTimes(2)
            expect(invalidate).not.toHaveBeenCalled()
            act(() => {
                vi.advanceTimersByTime(120)
            })
            expect(invalidate).toHaveBeenCalledTimes(1)
            const predicate = (invalidate.mock.calls[0]![0] as { predicate: (q: { queryKey: unknown[] }) => boolean }).predicate
            expect(predicate({ queryKey: ['sales_orders', 'list'] })).toBe(true)
            expect(predicate({ queryKey: ['work_orders', 'list'] })).toBe(false)
            expect(queryClient.getQueryState(['sales_orders', 'list'])?.isInvalidated).toBe(true)
            expect(queryClient.getQueryState(['work_orders', 'list'])?.isInvalidated).toBe(false)
        } finally {
            vi.useRealTimers()
        }
    })
})

describe('useRealtimeTick', () => {
    it('bumps once per burst and stays quiet when disabled', () => {
        vi.useFakeTimers()
        try {
            const client = fakeClient()
            const { result, rerender } = renderHook(
                ({ enabled }: { enabled: boolean }) =>
                    useRealtimeTick({ models: ['SalesOrder'], client, enabled, debounceMs: 50 }),
                { initialProps: { enabled: true } },
            )
            expect(result.current).toBe(0)
            act(() => {
                client.emit(event())
                client.emit(event({ id: '2' }))
                client.emit(event({ id: '3' }))
            })
            expect(result.current).toBe(0)
            act(() => {
                vi.advanceTimersByTime(60)
            })
            expect(result.current).toBe(1)

            rerender({ enabled: false })
            expect(client.subs).toHaveLength(0)
            act(() => {
                vi.advanceTimersByTime(100)
            })
            expect(result.current).toBe(1)
        } finally {
            vi.useRealTimers()
        }
    })
})

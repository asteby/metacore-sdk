// @vitest-environment happy-dom
// Races and privacy of the account hooks: one buyer's orders never stay on screen (or in memory of the hook) once the
// client is another buyer's or the session is gone, a late page never lands in a newer list, and the poll stops.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { StorefrontClient } from '@asteby/storefront'
import { useCustomerOrder, useCustomerOrders } from './index.js'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
const page = (ids: string[], next: string | null = null) => ({ nodes: ids.map((id) => ({ id, number: id })), page_info: { has_next_page: !!next, end_cursor: next }, total_count: ids.length })
const client = (orders: (params: { after?: string }) => Promise<unknown>, order?: (id: string) => Promise<unknown>) => ({ customer: { orders, order: order ?? (async () => null), pendingPayments: orders } }) as unknown as StorefrontClient

describe('useCustomerOrders across buyers', () => {
  it('drops the previous buyer\'s orders as soon as the client changes, even while (or if) the new load fails', async () => {
    const a = client(async () => page(['a1', 'a2']))
    const bLoad = deferred<unknown>()
    const b = client(() => bLoad.promise)
    const { result, rerender } = renderHook(({ c }) => useCustomerOrders({ client: c }), { initialProps: { c: a as StorefrontClient | null } })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.nodes.map((o) => o.id)).toEqual(['a1', 'a2'])
    rerender({ c: b })
    expect(result.current.nodes).toEqual([])
    expect(result.current.status).toBe('loading')
    await act(async () => bLoad.reject(new Error('down')))
    expect(result.current.status).toBe('error')
    expect(result.current.nodes).toEqual([])
  })

  it('signing out (no client) forgets the list', async () => {
    const a = client(async () => page(['a1']))
    const { result, rerender } = renderHook(({ c }) => useCustomerOrders({ client: c }), { initialProps: { c: a as StorefrontClient | null } })
    await waitFor(() => expect(result.current.nodes).toHaveLength(1))
    rerender({ c: null })
    expect(result.current.nodes).toEqual([])
    expect(result.current.hasMore).toBe(false)
  })

  it('a page asked before a reload (or by the previous buyer) never lands in the newer list', async () => {
    const more = deferred<unknown>()
    let firstCalls = 0
    const a = client((p) => (p.after ? more.promise : Promise.resolve(page(firstCalls++ === 0 ? ['a1'] : ['a1-fresh'], 'cur'))))
    const { result } = renderHook(() => useCustomerOrders({ client: a }))
    await waitFor(() => expect(result.current.hasMore).toBe(true))
    act(() => result.current.loadMore())
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.nodes.map((o) => o.id)).toEqual(['a1-fresh']))
    await act(async () => more.resolve(page(['a2-stale'])))
    expect(result.current.nodes.map((o) => o.id)).toEqual(['a1-fresh'])
    expect(result.current.loadingMore).toBe(false)
  })
})

describe('useCustomerOrder', () => {
  it('never shows the previous order under a new id', async () => {
    const second = deferred<unknown>()
    const c = client(async () => page([]), (id) => (id === 'a' ? Promise.resolve({ id: 'a', number: 'A' }) : second.promise))
    const { result, rerender } = renderHook(({ id }) => useCustomerOrder(id, { client: c }), { initialProps: { id: 'a' } })
    await waitFor(() => expect(result.current.order?.id).toBe('a'))
    rerender({ id: 'b' })
    expect(result.current.order).toBeNull()
    expect(result.current.status).toBe('loading')
    await act(async () => second.resolve({ id: 'b', number: 'B' }))
    expect(result.current.order?.id).toBe('b')
  })

  it('drops the order when the client becomes another buyer\'s', async () => {
    const a = client(async () => page([]), async () => ({ id: 'a', number: 'A' }))
    const b = client(async () => page([]), () => new Promise(() => {}))
    const { result, rerender } = renderHook(({ c }) => useCustomerOrder('a', { client: c }), { initialProps: { c: a } })
    await waitFor(() => expect(result.current.order?.id).toBe('a'))
    rerender({ c: b })
    expect(result.current.order).toBeNull()
  })

  it('polls at the interval, stops after forMs and on unmount, aborting the read in flight', async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    const order = vi.fn((_id: string, opts?: { signal?: AbortSignal }) => {
      if (opts?.signal) signals.push(opts.signal)
      return Promise.resolve({ id: 'a', number: 'A', invoice: { stage: 'issuing' } })
    })
    const c = { customer: { order } } as unknown as StorefrontClient
    const initial = { id: 'a', number: 'A', invoice: { stage: 'issuing' } } as never
    const { unmount } = renderHook(() => useCustomerOrder('a', { client: c, initial, poll: { while: (o) => o.invoice?.stage === 'issuing', everyMs: 1000, forMs: 3500 } }))
    expect(order).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(order).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(order.mock.calls.length).toBeLessThanOrEqual(3)
    const calls = order.mock.calls.length
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(order).toHaveBeenCalledTimes(calls)
    unmount()
    expect(signals.at(-1)!.aborted).toBe(true)
  })
})

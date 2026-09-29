// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createPersistedSnapshot, usePersistedQuery } from '../use-persisted-query'

type Layout = { order: string[] }

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

describe('createPersistedSnapshot', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips per scope and version', () => {
    const snap = createPersistedSnapshot<Layout>({ key: 'test:layout', version: 1 })
    const ts = Date.now() - 1000
    snap.write('org-a', { order: ['a'] }, { ts })
    expect(snap.read('org-a')).toEqual({ data: { order: ['a'] }, ts })
    expect(snap.read('org-b')).toBeUndefined()
    const v2 = createPersistedSnapshot<Layout>({ key: 'test:layout', version: 2 })
    expect(v2.read('org-a')).toBeUndefined()
  })

  it('ignores expired and corrupt entries', () => {
    const snap = createPersistedSnapshot<Layout>({ key: 'test:layout', version: 1, maxAgeMs: 1000 })
    snap.write('org-a', { order: ['a'] }, { ts: Date.now() - 5000 })
    expect(snap.read('org-a')).toBeUndefined()
    localStorage.setItem('test:layout:v1:org-b', '{not json')
    expect(snap.read('org-b')).toBeUndefined()
  })
})

describe('usePersistedQuery', () => {
  beforeEach(() => localStorage.clear())

  it('paints the persisted value on the first render, then revalidates and persists', async () => {
    const snap = createPersistedSnapshot<Layout>({ key: 'test:layout', version: 1 })
    snap.write('org-a', { order: ['cached'] }, { ts: Date.now() - 60_000 })
    const net = deferred<Layout>()
    const renders: (Layout | undefined)[] = []
    const { result } = renderHook(
      () => {
        const q = usePersistedQuery({
          queryKey: ['layout'],
          queryFn: () => net.promise,
          staleTime: 1000,
          persist: { snapshot: snap, scope: 'org-a' },
        })
        renders.push(q.data)
        return q
      },
      { wrapper: wrapperFor(newClient()) },
    )
    expect(renders[0]).toEqual({ order: ['cached'] })
    await act(async () => net.resolve({ order: ['fresh'] }))
    await waitFor(() => expect(result.current.data).toEqual({ order: ['fresh'] }))
    expect(snap.read('org-a')?.data).toEqual({ order: ['fresh'] })
  })

  it('revalidates a seed once per load even when it is younger than staleTime', async () => {
    const snap = createPersistedSnapshot<Layout>({ key: 'test:layout', version: 1 })
    snap.write('org-a', { order: ['cached'] }, { ts: Date.now() - 1000 })
    const queryFn = vi.fn(async () => ({ order: ['changed-elsewhere'] }))
    const { result } = renderHook(
      () =>
        usePersistedQuery({
          queryKey: ['layout'],
          queryFn,
          staleTime: 60_000,
          persist: { snapshot: snap, scope: 'org-a' },
        }),
      { wrapper: wrapperFor(newClient()) },
    )
    expect(result.current.data).toEqual({ order: ['cached'] })
    await waitFor(() => expect(result.current.data).toEqual({ order: ['changed-elsewhere'] }))
    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(snap.read('org-a')?.data).toEqual({ order: ['changed-elsewhere'] })
  })

  it('persists the raw payload, not the selected shape, and setQueryData writes back', async () => {
    const snap = createPersistedSnapshot<Layout>({ key: 'test:layout', version: 1 })
    const qc = newClient()
    const { result } = renderHook(
      () =>
        usePersistedQuery({
          queryKey: ['layout'],
          queryFn: async () => ({ order: ['x', 'y'] }),
          select: (d: Layout) => d.order.length,
          persist: { snapshot: snap, scope: 'org-a' },
        }),
      { wrapper: wrapperFor(qc) },
    )
    await waitFor(() => expect(result.current.data).toBe(2))
    await waitFor(() => expect(snap.read('org-a')?.data).toEqual({ order: ['x', 'y'] }))
    act(() => {
      qc.setQueryData<Layout>(['layout'], { order: ['z'] })
    })
    await waitFor(() => expect(snap.read('org-a')?.data).toEqual({ order: ['z'] }))
  })

  it('does not read or write without a scope', async () => {
    const snap = createPersistedSnapshot<Layout>({ key: 'test:layout', version: 1 })
    snap.write('org-a', { order: ['cached'] })
    const { result } = renderHook(
      () =>
        usePersistedQuery({
          queryKey: ['layout'],
          queryFn: async () => ({ order: ['fresh'] }),
          persist: { snapshot: snap, scope: null },
        }),
      { wrapper: wrapperFor(newClient()) },
    )
    expect(result.current.data).toBeUndefined()
    await waitFor(() => expect(result.current.data).toEqual({ order: ['fresh'] }))
    expect(snap.read('org-a')?.data).toEqual({ order: ['cached'] })
  })
})

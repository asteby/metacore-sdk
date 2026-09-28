// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useOptimisticMutation } from '../use-optimistic-mutation'

type Doc = { template: string }
const KEY = ['layout']

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup(
  mutationFn: (template: string) => Promise<Doc>,
  extra: { debounceMs?: number; onError?: (e: unknown, v: string) => void } = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  qc.setQueryData<Doc>(KEY, { template: 'default' })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  const hook = renderHook(
    () =>
      useOptimisticMutation<Doc, string, Doc>({
        queryKey: KEY,
        mutationFn,
        optimistic: (_current, template) => ({ template }),
        reconcile: (data) => data,
        ...extra,
      }),
    { wrapper },
  )
  return { qc, hook }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useOptimisticMutation', () => {
  it('patches the cache before the request resolves and reconciles with the response', async () => {
    const req = deferred<Doc>()
    const { qc, hook } = setup(() => req.promise)

    act(() => hook.result.current.mutate('classic'))
    expect(qc.getQueryData(KEY)).toEqual({ template: 'classic' })
    expect(hook.result.current.isPending).toBe(true)
    expect(hook.result.current.pendingVariables).toBe('classic')

    await act(async () => req.resolve({ template: 'classic-server' }))
    await waitFor(() => expect(hook.result.current.isPending).toBe(false))
    expect(qc.getQueryData(KEY)).toEqual({ template: 'classic-server' })
  })

  it('rolls back to the confirmed value and reports the error', async () => {
    const req = deferred<Doc>()
    const onError = vi.fn()
    const { qc, hook } = setup(() => req.promise, { onError })

    act(() => hook.result.current.mutate('classic'))
    expect(qc.getQueryData(KEY)).toEqual({ template: 'classic' })

    await act(async () => req.reject(new Error('boom')))
    await waitFor(() => expect(hook.result.current.isPending).toBe(false))
    expect(qc.getQueryData(KEY)).toEqual({ template: 'default' })
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'classic')
  })

  it('ignores a repeated call while the same write is in flight (double click)', async () => {
    const req = deferred<Doc>()
    const fn = vi.fn(() => req.promise)
    const { hook } = setup(fn)

    act(() => {
      hook.result.current.mutate('classic')
      hook.result.current.mutate('classic')
    })
    await act(async () => req.resolve({ template: 'classic' }))
    await waitFor(() => expect(hook.result.current.isPending).toBe(false))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('runs writes in call order and an older response never overwrites a newer choice', async () => {
    const first = deferred<Doc>()
    const second = deferred<Doc>()
    const calls: string[] = []
    const fn = vi.fn((t: string) => {
      calls.push(t)
      return t === 'classic' ? first.promise : second.promise
    })
    const { qc, hook } = setup(fn)

    act(() => {
      hook.result.current.mutate('classic')
      hook.result.current.mutate('default')
    })
    expect(qc.getQueryData(KEY)).toEqual({ template: 'default' })

    await act(async () => first.resolve({ template: 'classic' }))
    // Serialized: the second write starts only after the first settles.
    await waitFor(() => expect(calls).toEqual(['classic', 'default']))
    expect(qc.getQueryData(KEY)).toEqual({ template: 'default' })
    expect(hook.result.current.pendingVariables).toBe('default')

    await act(async () => second.resolve({ template: 'default' }))
    await waitFor(() => expect(hook.result.current.isPending).toBe(false))
    expect(qc.getQueryData(KEY)).toEqual({ template: 'default' })
  })

  it('rolls back to the last server-confirmed value when only the newest write fails', async () => {
    const first = deferred<Doc>()
    const second = deferred<Doc>()
    const { qc, hook } = setup((t) => (t === 'classic' ? first.promise : second.promise))

    act(() => {
      hook.result.current.mutate('classic')
      hook.result.current.mutate('custom')
    })
    await act(async () => first.resolve({ template: 'classic' }))
    await act(async () => second.reject(new Error('nope')))
    await waitFor(() => expect(hook.result.current.isPending).toBe(false))
    expect(qc.getQueryData(KEY)).toEqual({ template: 'classic' })
  })

  it('debounces bursts: every call paints, only the last one is sent', async () => {
    vi.useFakeTimers()
    const fn = vi.fn((t: string) => Promise.resolve({ template: t }))
    const { qc, hook } = setup(fn, { debounceMs: 400 })

    act(() => hook.result.current.mutate('a'))
    act(() => hook.result.current.mutate('b'))
    act(() => hook.result.current.mutate('c'))
    expect(qc.getQueryData(KEY)).toEqual({ template: 'c' })
    expect(fn).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    vi.useRealTimers()
    await waitFor(() => expect(hook.result.current.isPending).toBe(false))
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('c')
  })

  it('flushes a pending debounced write on unmount', async () => {
    vi.useFakeTimers()
    const fn = vi.fn((t: string) => Promise.resolve({ template: t }))
    const { hook } = setup(fn, { debounceMs: 400 })

    act(() => hook.result.current.mutate('saved-on-close'))
    hook.unmount()
    vi.useRealTimers()
    await waitFor(() => expect(fn).toHaveBeenCalledWith('saved-on-close'))
  })
})

// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyPermissions } from './permissions-api'
import { useMyPermissions } from './use-my-permissions'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const data = { capabilities: ['orders.index'] } as unknown as MyPermissions
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

describe('useMyPermissions scope', () => {
  it.each([null, undefined])('queries but does not persist when scope is %s', async (scope) => {
    const fetch = vi.fn(async () => data)
    const { result } = renderHook(() => useMyPermissions({ fetch, userId: 'u1', scope }), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual(data))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(store.size).toBe(0)
  })

  it('still persists per scope when a string is given', async () => {
    const fetch = vi.fn(async () => data)
    const { result } = renderHook(() => useMyPermissions({ fetch, userId: 'u1', scope: 'org-1' }), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual(data))
    expect([...store.keys()].some((k) => k.endsWith(':org-1'))).toBe(true)
  })
})

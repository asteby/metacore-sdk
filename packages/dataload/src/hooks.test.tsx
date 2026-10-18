// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useDataloadLauncher } from './hooks'
import { fakeApi } from './test-utils'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)
const source = { format: 'csv' as const, name: 'a.csv', content: 'sku\n1' }

describe('useDataloadLauncher', () => {
  it('sends edited overrides, drops the plan on edit and resets them when the profile changes', async () => {
    const api = fakeApi()
    const { result } = renderHook(() => useDataloadLauncher(api, { overrides: { drop: ['x'] } }), { wrapper })
    act(() => {
      result.current.setProfile('catalogo')
      result.current.setSource(source)
    })
    await act(async () => {
      await result.current.dryRun()
    })
    expect(api.dryRun).toHaveBeenLastCalledWith({ profile: 'catalogo', source, overrides: { drop: ['x'] } })
    expect(result.current.phase).toBe('planned')

    act(() => result.current.setOverrides({ ignoreHeaders: ['tmp*'] }))
    expect(result.current.plan).toBeUndefined()
    await act(async () => {
      await result.current.dryRun()
    })
    expect(api.dryRun).toHaveBeenLastCalledWith({ profile: 'catalogo', source, overrides: { ignoreHeaders: ['tmp*'] } })

    act(() => result.current.setProfile('otro'))
    await waitFor(() => expect(result.current.overrides).toEqual({ drop: ['x'] }))
  })
})

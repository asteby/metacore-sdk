// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
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
    // The server already stored the source: later dry-runs send only its id.
    expect(api.dryRun).toHaveBeenLastCalledWith({ profile: 'catalogo', source: { id: 'src-sha' }, overrides: { ignoreHeaders: ['tmp*'] } })

    act(() => result.current.setProfile('otro'))
    await waitFor(() => expect(result.current.overrides).toEqual({ drop: ['x'] }))
  })

  it('applies exactly what was simulated: pinned version, stored source and the reviewed plan hash', async () => {
    const api = fakeApi()
    const { result } = renderHook(() => useDataloadLauncher(api), { wrapper })
    act(() => {
      result.current.setProfile('catalogo')
      result.current.setSource(source)
    })
    await act(async () => {
      await result.current.dryRun()
    })
    await act(async () => {
      await result.current.execute()
    })
    expect(api.execute).toHaveBeenLastCalledWith({
      profile: 'catalogo@1',
      source: { id: 'src-sha' },
      expectPlanHash: 'plh',
      force: false,
      failOnInvalid: false,
    })
  })

  it('drops the plan and asks to simulate again when the server says the plan changed (409)', async () => {
    const api = fakeApi({
      execute: vi.fn(async () => {
        throw { response: { status: 409, data: { message: 'dataload: el plan cambió desde la simulación; vuelve a simular y revisa' } } }
      }),
    })
    const { result } = renderHook(() => useDataloadLauncher(api), { wrapper })
    act(() => {
      result.current.setProfile('catalogo')
      result.current.setSource(source)
    })
    await act(async () => {
      await result.current.dryRun()
    })
    await act(async () => {
      await result.current.execute().catch(() => undefined)
    })
    expect(result.current.planChanged).toBe(true)
    expect(result.current.plan).toBeUndefined()
    expect(result.current.phase).toBe('idle')
    await act(async () => {
      await result.current.dryRun()
    })
    expect(result.current.planChanged).toBe(false)
    expect(result.current.phase).toBe('planned')
  })
})

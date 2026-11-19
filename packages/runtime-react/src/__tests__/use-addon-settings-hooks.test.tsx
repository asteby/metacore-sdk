// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ApiProvider } from '../api-context'
import { InstalledAddonsProvider } from '../installed-addons-context'
import { useAddonSettings } from '../use-addon-settings'
import { useAddonInstalledProbe } from '../use-addon-installed-probe'

afterEach(cleanup)

function wrap(get: (url: string) => Promise<unknown>, installed?: string[]) {
    const client = { get: vi.fn(get), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const W = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>
            <ApiProvider client={client as never}>
                {installed ? <InstalledAddonsProvider addons={installed}>{children}</InstalledAddonsProvider> : children}
            </ApiProvider>
        </QueryClientProvider>
    )
    return { W, client }
}

describe('useAddonSettings', () => {
    it('merges defaults under stored values and exposes definitions/overrides', async () => {
        const { W, client } = wrap(async () => ({ data: { success: true, data: { a: 5 }, definitions: [{ key: 'a' }], overrides: { a: 6 } } }))
        const defaults = { a: 1, b: 2 }
        const { result } = renderHook(() => useAddonSettings('pos', { defaults, branchId: 'b1' }), { wrapper: W })
        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(client.get).toHaveBeenCalledWith('/addons/pos/settings?branch_id=b1')
        expect(result.current.settings).toEqual({ a: 5, b: 2 })
        expect(result.current.stored).toEqual({ a: 5 })
        expect(result.current.definitions).toEqual([{ key: 'a' }])
        expect(result.current.overrides).toEqual({ a: 6 })
    })

    it('reload() fetches again and resolves with the payload', async () => {
        const { W, client } = wrap(async () => ({ data: { data: { a: 1 } } }))
        const { result } = renderHook(() => useAddonSettings('pos', { enabled: false }), { wrapper: W })
        const payload = await result.current.reload()
        expect(payload.values).toEqual({ a: 1 })
        await result.current.reload()
        expect(client.get).toHaveBeenCalledTimes(2)
    })
})

describe('useAddonInstalledProbe', () => {
    it('true on 2xx, false on 404, unknown on other errors', async () => {
        const ok = wrap(async () => ({ data: {} }))
        const r1 = renderHook(() => useAddonInstalledProbe('caja'), { wrapper: ok.W })
        await waitFor(() => expect(r1.result.current.installed).toBe(true))

        const nf = wrap(async () => Promise.reject({ response: { status: 404 } }))
        const r2 = renderHook(() => useAddonInstalledProbe('caja'), { wrapper: nf.W })
        await waitFor(() => expect(r2.result.current.installed).toBe(false))

        const forbidden = wrap(async () => Promise.reject({ response: { status: 403 } }))
        const r3 = renderHook(() => useAddonInstalledProbe('caja'), { wrapper: forbidden.W })
        await waitFor(() => expect(r3.result.current.isLoading).toBe(false))
        expect(r3.result.current.installed).toBeUndefined()
    })

    it('answers from the provider without touching the network', () => {
        const { W, client } = wrap(async () => ({ data: {} }), ['fiscal'])
        const yes = renderHook(() => useAddonInstalledProbe('fiscal'), { wrapper: W })
        const no = renderHook(() => useAddonInstalledProbe('caja'), { wrapper: W })
        expect(yes.result.current.installed).toBe(true)
        expect(no.result.current.installed).toBe(false)
        expect(client.get).not.toHaveBeenCalled()
    })
})

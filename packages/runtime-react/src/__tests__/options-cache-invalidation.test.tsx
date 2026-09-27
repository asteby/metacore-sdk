// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { ApiProvider, useApi } from '../api-context'
import { useOptionsResolver, invalidateOptionsCache } from '../use-options-resolver'

afterEach(() => {
    cleanup()
    invalidateOptionsCache()
})

// A picker opened right after creating a record must list it: the 30 s
// options cache is dropped by every write, whether it goes through useApi()
// or straight through the host's axios instance.

function Picker() {
    const { options } = useOptionsResolver({ modelKey: '', ref: 'Brand', fieldKey: 'id' })
    return <span data-testid="opts">{options.map((o) => o.label).join(',')}</span>
}

function hostClient(brands: string[]) {
    const handlers: Array<(res: any) => any> = []
    const client = {
        get: vi.fn(async () => ({ data: { success: true, data: brands.map((b) => ({ id: b, label: b })) } })),
        // The batch path is unavailable on this fake host: /api/q 404s.
        post: vi.fn(async (url: string) => {
            if (url === '/q') return { data: { success: false } }
            return { data: { success: true } }
        }),
        put: vi.fn(async () => ({ data: { success: true } })),
        delete: vi.fn(async () => ({ data: { success: true } })),
        interceptors: {
            response: {
                use: (ok: (res: any) => any) => {
                    handlers.push(ok)
                    return handlers.length - 1
                },
                eject: vi.fn(),
            },
        },
    }
    const hostWrite = async (method: string, url = '/data/brands') => {
        for (const h of handlers) h({ config: { method, url } })
    }
    return { client, hostWrite }
}

describe('options cache invalidation', () => {
    it('a host write through its own client drops the cached options', async () => {
        const brands = ['A']
        const { client, hostWrite } = hostClient(brands)
        const view = render(
            <ApiProvider client={client}>
                <Picker />
            </ApiProvider>,
        )
        await waitFor(() => expect(screen.getByTestId('opts').textContent).toBe('A'))

        brands.push('B')
        await act(async () => {
            await hostWrite('post')
        })
        view.unmount()
        render(
            <ApiProvider client={client}>
                <Picker />
            </ApiProvider>,
        )
        await waitFor(() => expect(screen.getByTestId('opts').textContent).toBe('A,B'))
    })

    it('neither a GET nor the /q read batch drops the cache', async () => {
        const brands = ['A']
        const { client, hostWrite } = hostClient(brands)
        const view = render(
            <ApiProvider client={client}>
                <Picker />
            </ApiProvider>,
        )
        await waitFor(() => expect(screen.getByTestId('opts').textContent).toBe('A'))
        const calls = client.get.mock.calls.length
        brands.push('B')
        await act(async () => {
            await hostWrite('get')
            await hostWrite('post', '/q')
        })
        view.unmount()
        render(
            <ApiProvider client={client}>
                <Picker />
            </ApiProvider>,
        )
        await waitFor(() => expect(screen.getByTestId('opts').textContent).toBe('A'))
        expect(client.get.mock.calls.length).toBe(calls)
    })

    it('a write through useApi() drops the cached options', async () => {
        const brands = ['A']
        const { client } = hostClient(brands)
        let write: (() => Promise<unknown>) | null = null
        function Writer() {
            const api = useApi()
            write = () => api.post('/data/brands', { name: 'B' })
            return null
        }
        const view = render(
            <ApiProvider client={{ ...client, interceptors: undefined } as never}>
                <Picker />
                <Writer />
            </ApiProvider>,
        )
        await waitFor(() => expect(screen.getByTestId('opts').textContent).toBe('A'))
        brands.push('B')
        await act(async () => {
            await write!()
        })
        view.unmount()
        render(
            <ApiProvider client={{ ...client, interceptors: undefined } as never}>
                <Picker />
            </ApiProvider>,
        )
        await waitFor(() => expect(screen.getByTestId('opts').textContent).toBe('A,B'))
    })
})

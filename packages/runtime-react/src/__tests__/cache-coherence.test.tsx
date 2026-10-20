// @vitest-environment happy-dom
//
// Client side of the server's cache epoch: what runtime-react drops when it
// moves, how react-query is invalidated per addon, and the stale-plan retry of
// the ApiProvider interceptor.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'

import {
    CACHE_EPOCH_CHANGED_EVENT,
    CACHE_EPOCH_OBSERVED_EVENT,
    dropAddonDerivedCaches,
    epochFromAxiosHeaders,
    invalidateAddonQueries,
    isStaleStateError,
    onCacheEpochChanged,
    queryKeyBelongsToAddon,
    reportCacheEpoch,
    STALE_RETRIED_FLAG,
    useCacheEpochSync,
} from '../cache-coherence'
import { ApiProvider, type ApiClient } from '../api-context'
import { useMetadataCache } from '../metadata-cache'
import { invalidateQueryBatchAll } from '../query-batch'
import { onOptionsCacheInvalidated } from '../use-options-resolver'

afterEach(cleanup)

function emitChanged(detail = { epoch: 'b', previous: 'a', source: 'header' as const }) {
    window.dispatchEvent(new CustomEvent(CACHE_EPOCH_CHANGED_EVENT, { detail }))
}

describe('window protocol', () => {
    it('reportCacheEpoch dispatches the observed event and ignores junk', () => {
        const seen: unknown[] = []
        const h = (e: Event) => seen.push((e as CustomEvent).detail)
        window.addEventListener(CACHE_EPOCH_OBSERVED_EVENT, h)
        reportCacheEpoch('tok.1.2')
        reportCacheEpoch('')
        reportCacheEpoch(undefined)
        reportCacheEpoch(7)
        window.removeEventListener(CACHE_EPOCH_OBSERVED_EVENT, h)
        expect(seen).toEqual([{ epoch: 'tok.1.2' }])
    })

    it('onCacheEpochChanged receives the change and unsubscribes', () => {
        const fn = vi.fn()
        const off = onCacheEpochChanged(fn)
        emitChanged()
        expect(fn).toHaveBeenCalledWith({ epoch: 'b', previous: 'a', source: 'header' })
        off()
        emitChanged()
        expect(fn).toHaveBeenCalledTimes(1)
    })

    it('reads the header from axios bags', () => {
        expect(epochFromAxiosHeaders({ 'x-cache-epoch': 'a.1' })).toBe('a.1')
        expect(epochFromAxiosHeaders({ get: (k: string) => (k === 'x-cache-epoch' ? 'a.2' : undefined) })).toBe('a.2')
        expect(epochFromAxiosHeaders(undefined)).toBeUndefined()
    })
})

describe('dropping what the epoch makes stale', () => {
    beforeEach(() => useMetadataCache.getState().clearAll())

    it('clears metadata, the read batch and the option lists', () => {
        useMetadataCache.getState().setMetadata('suppliers', { title: 'Old' } as never)
        expect(useMetadataCache.getState().getMetadata('suppliers')).toBeDefined()
        const optionsDropped = vi.fn()
        const off = onOptionsCacheInvalidated(optionsDropped)
        dropAddonDerivedCaches()
        off()
        expect(useMetadataCache.getState().getMetadata('suppliers')).toBeUndefined()
        expect(optionsDropped).toHaveBeenCalledTimes(1)
        expect(() => invalidateQueryBatchAll()).not.toThrow()
    })

    it('useCacheEpochSync drops the caches and invalidates react-query when the epoch moves', () => {
        useMetadataCache.getState().setMetadata('suppliers', { title: 'Old' } as never)
        const qc = { invalidateQueries: vi.fn().mockResolvedValue(undefined) }
        const onChange = vi.fn()
        function Host() {
            useCacheEpochSync({ queryClient: qc, onChange })
            return null
        }
        render(<Host />)
        emitChanged()
        expect(useMetadataCache.getState().getMetadata('suppliers')).toBeUndefined()
        expect(qc.invalidateQueries).toHaveBeenCalledTimes(1)
        expect(onChange).toHaveBeenCalledWith({ epoch: 'b', previous: 'a', source: 'header' })
    })

    it('stops listening on unmount', () => {
        const qc = { invalidateQueries: vi.fn().mockResolvedValue(undefined) }
        function Host() {
            useCacheEpochSync({ queryClient: qc })
            return null
        }
        const { unmount } = render(<Host />)
        unmount()
        emitChanged()
        expect(qc.invalidateQueries).not.toHaveBeenCalled()
    })
})

describe('per-addon react-query invalidation', () => {
    it('matches keys that mention the addon, by exact name or namespaced prefix', () => {
        expect(queryKeyBelongsToAddon(['crm'], 'crm')).toBe(true)
        expect(queryKeyBelongsToAddon(['data', 'crm.Lead', { page: 1 }], 'crm')).toBe(true)
        expect(queryKeyBelongsToAddon(['x', 'crm:Lead'], 'crm')).toBe(true)
        expect(queryKeyBelongsToAddon(['addon', { settings: '/addons/crm/settings' }], 'crm')).toBe(true)
        expect(queryKeyBelongsToAddon(['data', 'crmx.Lead'], 'crm')).toBe(false)
        expect(queryKeyBelongsToAddon(['data', 'pos.Order'], 'crm')).toBe(false)
        expect(queryKeyBelongsToAddon(['data'], '')).toBe(false)
    })

    it('invalidates the addon queries and the shell roots, not unrelated data', async () => {
        const qc = new QueryClient()
        const seed = (key: unknown[]) => qc.setQueryData(key, 'x')
        seed(['crm', 'leads'])
        seed(['data', 'crm.Lead'])
        seed(['marketplace', 'installed'])
        seed(['navigation'])
        seed(['data', 'pos.Order'])
        seed(['customers', 'list'])
        await invalidateAddonQueries(qc, 'crm')
        const state = (key: unknown[]) => qc.getQueryState(key)?.isInvalidated
        expect(state(['crm', 'leads'])).toBe(true)
        expect(state(['data', 'crm.Lead'])).toBe(true)
        expect(state(['marketplace', 'installed'])).toBe(true)
        expect(state(['navigation'])).toBe(true)
        expect(state(['data', 'pos.Order'])).toBeFalsy()
        expect(state(['customers', 'list'])).toBeFalsy()
    })

    it('extra roots are honoured', async () => {
        const qc = new QueryClient()
        qc.setQueryData(['my-shell-thing'], 1)
        await invalidateAddonQueries(qc, 'crm', { extraRoots: ['my-shell-thing'] })
        expect(qc.getQueryState(['my-shell-thing'])?.isInvalidated).toBe(true)
    })
})

describe('stale server state', () => {
    it('recognises the incident error in the shapes it arrives in', () => {
        const msg = 'ERROR: cached plan must not change result type (SQLSTATE 0A000)'
        expect(isStaleStateError(new Error(msg))).toBe(true)
        expect(isStaleStateError({ response: { status: 500, data: { error: { message: msg } } } })).toBe(true)
        expect(isStaleStateError({ response: { data: { message: 'prepared statement "s" does not exist' } } })).toBe(true)
        expect(isStaleStateError(new Error('duplicate key'))).toBe(false)
        expect(isStaleStateError(undefined)).toBe(false)
    })
})

describe('ApiProvider interceptor', () => {
    function axiosLike() {
        let onOk: (r: any) => any = (r) => r
        let onErr: (e: any) => any = (e) => Promise.reject(e)
        const eject = vi.fn()
        const request = vi.fn()
        const client = {
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
            request,
            interceptors: {
                response: {
                    use: (a: any, b: any) => {
                        onOk = a
                        onErr = b
                        return 3
                    },
                    eject,
                },
            },
        }
        return { client: client as unknown as ApiClient, ok: (r: any) => onOk(r), err: (e: any) => onErr(e), request, eject }
    }

    it('reports the epoch of every answer, ok or failed', async () => {
        const ax = axiosLike()
        const seen: string[] = []
        const h = (e: Event) => seen.push((e as CustomEvent).detail.epoch)
        window.addEventListener(CACHE_EPOCH_OBSERVED_EVENT, h)
        render(
            <ApiProvider client={ax.client} batch={false}>
                <div />
            </ApiProvider>,
        )
        ax.ok({ headers: { 'x-cache-epoch': 'e.1' }, config: { method: 'get', url: '/x' } })
        await ax.err({ response: { headers: { 'x-cache-epoch': 'e.2' } }, config: { method: 'get', url: '/x' } }).catch(() => {})
        window.removeEventListener(CACHE_EPOCH_OBSERVED_EVENT, h)
        expect(seen).toEqual(['e.1', 'e.2'])
    })

    it('re-sends a request that hit a stale plan exactly once', async () => {
        vi.useFakeTimers()
        try {
            const ax = axiosLike()
            render(
                <ApiProvider client={ax.client} batch={false}>
                    <div />
                </ApiProvider>,
            )
            const config: Record<string, unknown> = { method: 'post', url: '/addresses' }
            const stale = {
                config,
                response: { status: 500, data: { error: { message: 'cached plan must not change result type (SQLSTATE 0A000)' } } },
            }
            ax.request.mockResolvedValueOnce({ data: 'saved', config })
            const p = ax.err(stale)
            await vi.advanceTimersByTimeAsync(300)
            await expect(p).resolves.toMatchObject({ data: 'saved' })
            expect(ax.request).toHaveBeenCalledTimes(1)
            expect(config[STALE_RETRIED_FLAG]).toBe(true)
            // the same request failing again is not retried again
            await expect(ax.err(stale)).rejects.toBe(stale)
            expect(ax.request).toHaveBeenCalledTimes(1)
        } finally {
            vi.useRealTimers()
        }
    })

    it('does not retry ordinary failures', async () => {
        const ax = axiosLike()
        render(
            <ApiProvider client={ax.client} batch={false}>
                <div />
            </ApiProvider>,
        )
        const e = { config: { method: 'get', url: '/x' }, response: { status: 403, data: { message: 'forbidden' } } }
        await expect(ax.err(e)).rejects.toBe(e)
        expect(ax.request).not.toHaveBeenCalled()
    })

    it('ejects the interceptor on unmount', () => {
        const ax = axiosLike()
        const { unmount } = render(
            <ApiProvider client={ax.client} batch={false}>
                <div />
            </ApiProvider>,
        )
        unmount()
        expect(ax.eject).toHaveBeenCalledWith(3)
    })
})

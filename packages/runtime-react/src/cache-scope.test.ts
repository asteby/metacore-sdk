// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cacheScope, resetCacheScopeTracking, setCacheScopeLanguageProvider, syncCacheScope } from './cache-scope'
import { useMetadataCache, clearMetadataCache } from './metadata-cache'
import {
    batchGet,
    clearQueryBatchCaches,
    loadQueryPart,
    narrowInToken,
    rememberInRows,
    resetQueryBatchCache,
} from './query-batch'
import type { TableMetadata } from './types'

function login(user: string, org: string, lang = 'es') {
    localStorage.setItem('auth_user', JSON.stringify({ id: user, organization_id: org }))
    localStorage.setItem('i18nextLng', lang)
}
function logout() {
    localStorage.removeItem('auth_user')
}
const meta = (title: string) => ({ title, actions: [{ key: 'x' }] }) as unknown as TableMetadata

beforeEach(() => {
    vi.useRealTimers()
    setCacheScopeLanguageProvider(null)
    resetQueryBatchCache()
    clearMetadataCache()
    resetCacheScopeTracking()
    login('u1', 'o1')
    cacheScope()
})
afterEach(() => {
    login('u-test', 'o-test', 'en')
})

describe('cacheScope', () => {
    it('is org:user:lang and fails closed when a part is missing', () => {
        expect(cacheScope()).toBe('o1:u1:es')
        localStorage.setItem('auth_user', JSON.stringify({ id: 'u1' }))
        expect(cacheScope()).toBeNull()
        login('u1', 'o1')
        localStorage.removeItem('i18nextLng')
        expect(cacheScope()).toBeNull()
        setCacheScopeLanguageProvider(() => 'fr')
        expect(cacheScope()).toBe('o1:u1:fr')
    })
})

describe('metadata store scoping', () => {
    it('does not show another user, organization or language the cached metadata', () => {
        const s = useMetadataCache.getState()
        s.setMetadata('Sale', meta('mine'))
        expect(useMetadataCache.getState().getMetadata('Sale')?.title).toBe('mine')
        for (const [u, o, l] of [
            ['u2', 'o1', 'es'],
            ['u1', 'o2', 'es'],
            ['u1', 'o1', 'en'],
        ] as const) {
            login(u, o, l)
            expect(useMetadataCache.getState().getMetadata('Sale')).toBeUndefined()
            expect(useMetadataCache.getState().hasMetadata('Sale')).toBe(false)
        }
    })

    it('clears itself (memory and persisted copy) when the scope changes', () => {
        useMetadataCache.getState().setMetadata('Sale', meta('mine'))
        expect(localStorage.getItem('metacore-metadata-cache')).toContain('mine')
        login('u2', 'o1')
        syncCacheScope()
        expect(useMetadataCache.getState().cache).toEqual({})
        expect(localStorage.getItem('metacore-metadata-cache')).toBeNull()
    })

    it('clearMetadataCache wipes memory and storage; logout leaves nothing readable', () => {
        useMetadataCache.getState().setMetadata('Sale', meta('mine'))
        clearMetadataCache()
        expect(useMetadataCache.getState().getMetadata('Sale')).toBeUndefined()
        expect(localStorage.getItem('metacore-metadata-cache')).toBeNull()
    })

    it('does not cache without a scope', () => {
        logout()
        useMetadataCache.getState().setMetadata('Sale', meta('x'))
        login('u1', 'o1')
        expect(useMetadataCache.getState().getMetadata('Sale')).toBeUndefined()
    })

    it('writing under a new scope drops the previous scope entries', () => {
        useMetadataCache.getState().setMetadata('Sale', meta('u1'))
        login('u2', 'o1')
        useMetadataCache.getState().setMetadata('Other', meta('u2'))
        expect(Object.keys(useMetadataCache.getState().cache)).toEqual(['Other'])
        login('u1', 'o1')
        expect(useMetadataCache.getState().getMetadata('Sale')).toBeUndefined()
    })

    it('prefetchAll does nothing without a scope and rebuilds on a new one', async () => {
        const api = {
            get: vi.fn(async () => ({ data: { data: { tables: { Sale: meta('t') }, modals: {}, version: 'v1' } } })),
        }
        logout()
        await useMetadataCache.getState().prefetchAll(api)
        expect(api.get).not.toHaveBeenCalled()
        login('u1', 'o1')
        await useMetadataCache.getState().prefetchAll(api)
        await useMetadataCache.getState().prefetchAll(api)
        expect(api.get).toHaveBeenCalledTimes(1)
        login('u2', 'o1')
        await useMetadataCache.getState().prefetchAll(api)
        expect(api.get).toHaveBeenCalledTimes(2)
    })

    it('discards a persisted v5 store on migration', async () => {
        localStorage.setItem(
            'metacore-metadata-cache',
            JSON.stringify({ state: { cache: { Sale: meta('old') }, modalCache: {}, metadataVersion: 'v' }, version: 5 }),
        )
        await useMetadataCache.persist.rehydrate()
        expect(useMetadataCache.getState().cache).toEqual({})
        expect(useMetadataCache.getState().getMetadata('Sale')).toBeUndefined()
    })
})

function okApi(parts: Record<string, unknown>) {
    return {
        get: vi.fn(async () => ({ data: { success: true, data: [] } })),
        post: vi.fn(async (_u: string, body: { parts: string[] }) => {
            const out: Record<string, unknown> = {}
            body.parts.forEach((p, i) => {
                const token = p.slice(p.indexOf('=') + 1)
                out[`q${i + 1}`] = parts[token] ?? { success: true, data: [] }
            })
            return { data: { success: true, parts: out } }
        }),
        put: vi.fn(),
        delete: vi.fn(),
    }
}

describe('query batch scoping', () => {
    it('keeps two users, organizations and languages apart', async () => {
        const api = okApi({ 'm:Sale': { success: true, data: { who: 'u1' }, etag: '"qh-1"' } })
        await loadQueryPart(api, 'm:Sale')
        await loadQueryPart(api, 'm:Sale')
        expect(api.post).toHaveBeenCalledTimes(1)
        for (const [u, o, l] of [
            ['u2', 'o1', 'es'],
            ['u1', 'o2', 'es'],
            ['u1', 'o1', 'en'],
        ] as const) {
            login(u, o, l)
            await loadQueryPart(api, 'm:Sale')
            const last = api.post.mock.calls.at(-1)![1] as { inm: Record<string, string> }
            expect(last.inm).toEqual({}) // no etag of the other scope leaks
        }
        expect(api.post).toHaveBeenCalledTimes(4)
    })

    it('does not cache without a scope', async () => {
        const api = okApi({})
        logout()
        await loadQueryPart(api, 'm:Sale')
        await loadQueryPart(api, 'm:Sale')
        expect(api.post).toHaveBeenCalledTimes(2)
        rememberInRows('t:Stock?product_id=in:a', ['a'], [{ product_id: 'a' }])
        login('u1', 'o1')
        expect(narrowInToken('t:Stock?product_id=in:a')).toBeNull()
    })

    it('clearQueryBatchCaches and a scope change forget parts and entities', async () => {
        const api = okApi({})
        await loadQueryPart(api, 'm:Sale')
        rememberInRows('t:Stock?product_id=in:a', ['a'], [{ product_id: 'a' }])
        clearQueryBatchCaches()
        await loadQueryPart(api, 'm:Sale')
        expect(api.post).toHaveBeenCalledTimes(2)
        expect(narrowInToken('t:Stock?product_id=in:a')).toBeNull()

        rememberInRows('t:Stock?product_id=in:a', ['a'], [{ product_id: 'a' }])
        login('u2', 'o1')
        syncCacheScope()
        login('u1', 'o1')
        syncCacheScope()
        expect(narrowInToken('t:Stock?product_id=in:a')).toBeNull()
    })

    it('drops an answer that arrives after the identity changed', async () => {
        const api = okApi({})
        const p = loadQueryPart(api, 'm:Sale')
        login('u2', 'o1')
        await expect(p).rejects.toThrow()
        login('u1', 'o1')
        const again = await loadQueryPart(api, 'm:Sale')
        expect(again.success).toBe(true)
    })
})

describe('per-part status', () => {
    const fail = (status: number | undefined, message = 'boom') => ({ success: false, message, status })
    const run = async (part: unknown, getOk = true) => {
        const api = okApi({ 'm:Sale': part })
        if (!getOk) api.get.mockRejectedValueOnce(Object.assign(new Error('get failed'), { status: 500 }))
        return { api, result: batchGet(api, '/metadata/table/Sale') }
    }

    it('403 is forbidden even without the word', async () => {
        const { api, result } = await run(fail(403, 'nope'))
        await expect(result).rejects.toMatchObject({ status: 403 })
        expect(api.get).not.toHaveBeenCalled()
    })
    it('424 rejects without a direct GET', async () => {
        const { api, result } = await run(fail(424))
        await expect(result).rejects.toMatchObject({ status: 424 })
        expect(api.get).not.toHaveBeenCalled()
    })
    it.each([500, 504, 413])('%i retries once by direct GET', async (status) => {
        const { api, result } = await run(fail(status))
        await expect(result).resolves.toMatchObject({ data: { success: true } })
        expect(api.get).toHaveBeenCalledTimes(1)
    })
    it('a failing retry propagates (one retry only)', async () => {
        const { api, result } = await run(fail(504), false)
        await expect(result).rejects.toThrow('get failed')
        expect(api.get).toHaveBeenCalledTimes(1)
    })
    it('without status keeps the message heuristic', async () => {
        const forbidden = await run(fail(undefined, 'Forbidden: sin permiso'))
        await expect(forbidden.result).rejects.toMatchObject({ status: 403 })
        const other = await run(fail(undefined, 'weird'))
        await expect(other.result).resolves.toBeDefined()
        expect(other.api.get).toHaveBeenCalledTimes(1)
    })
})

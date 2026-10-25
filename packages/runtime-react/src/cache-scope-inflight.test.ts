// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    cacheScope,
    peekCacheScope,
    resetCacheScopeTracking,
    setCacheScopeLanguageProvider,
    setCacheScopeProvider,
} from './cache-scope'
import { clearMetadataCache, useMetadataCache } from './metadata-cache'
import { loadQueryPart, narrowInToken, resetQueryBatchCache } from './query-batch'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { ApiProvider } from './api-context'
import { optionsScope, useOptionsResolver } from './use-options-resolver'
import type { TableMetadata } from './types'

function login(user: string, org: string, lang = 'es') {
    localStorage.setItem('auth_user', JSON.stringify({ id: user, organization_id: org }))
    localStorage.setItem('i18nextLng', lang)
}
const meta = (title: string) => ({ title, actions: [{ key: 'x' }] }) as unknown as TableMetadata
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function jwt(claims: Record<string, unknown>): string {
    const enc = (o: unknown) =>
        btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(claims)}.sig`
}

/** A POST /q the test releases by hand, to simulate a slow network. */
function heldApi() {
    let release: (body: unknown) => void = () => {}
    const gate = new Promise<unknown>((resolve) => (release = resolve))
    const posts: { parts: string[]; inm: Record<string, string> }[] = []
    const api = {
        get: vi.fn(async () => ({ data: { success: true, data: [] } })),
        post: vi.fn(async (_u: string, body: { parts: string[]; inm: Record<string, string> }) => {
            posts.push(body)
            return { data: await gate }
        }),
        put: vi.fn(),
        delete: vi.fn(),
    }
    return { api, release, posts }
}

/** First answer for `token` (stored under u1 with a content etag). */
async function seedU1(token: string) {
    const api = {
        get: vi.fn(),
        post: vi.fn(async () => ({
            data: {
                success: true,
                parts: { q1: { success: true, data: [{ id: 'u1-row' }], etag: '"qh-1"' } },
            },
        })),
        put: vi.fn(),
        delete: vi.fn(),
    }
    const part = await loadQueryPart(api, token)
    expect(part.data).toEqual([{ id: 'u1-row' }])
}

beforeEach(() => {
    vi.useRealTimers()
    setCacheScopeProvider(null)
    setCacheScopeLanguageProvider(null)
    localStorage.removeItem('auth_token')
    resetQueryBatchCache()
    clearMetadataCache()
    resetCacheScopeTracking()
    login('u1', 'o1')
    cacheScope()
})
afterEach(() => {
    setCacheScopeProvider(null)
    localStorage.removeItem('auth_token')
    login('u-test', 'o-test', 'en')
})

describe('in-flight batch answers (H1, H5a)', () => {
    it('not_modified for a request that left under u1 never serves u1 rows to u2', async () => {
        await seedU1('t:Sale?q=a')
        const { api, release, posts } = heldApi()
        const waiting = loadQueryPart(api, 't:Sale?q=a')
        const outcome = waiting.then(
            (part) => ({ ok: true as const, part }),
            (error: Error) => ({ ok: false as const, error }),
        )
        await sleep(30)
        expect(posts).toHaveLength(1)
        expect(posts[0]!.inm).toEqual({ q1: '"qh-1"' })
        login('u2', 'o1') // the identity changes while the POST travels
        release({ success: true, parts: { q1: { success: true, not_modified: true } } })
        const res = await outcome
        expect(res.ok).toBe(false)
        if (!res.ok) expect(res.error.message).toBe('batch scope changed')
    })

    it('rows for a request that left under u1 are rejected and nothing is stored', async () => {
        const { api, release, posts } = heldApi()
        const outcome = loadQueryPart(api, 't:Sale?q=b').then(
            () => 'resolved',
            (e: Error) => e.message,
        )
        await sleep(30)
        expect(posts).toHaveLength(1)
        login('u2', 'o1')
        release({ success: true, parts: { q1: { success: true, data: [{ id: 'u1-secret' }], etag: '"qh-9"' } } })
        expect(await outcome).toBe('batch scope changed')
        // Back to u1 without notification: a stored entry would show up as an etag.
        resetCacheScopeTracking()
        login('u1', 'o1')
        const next = heldApi()
        const p = loadQueryPart(next.api, 't:Sale?q=b').catch(() => undefined)
        await sleep(30)
        expect(next.posts[0]!.inm).toEqual({})
        next.release({ success: true, parts: { q1: { success: true, data: [] } } })
        await p
    })

    it('an in: list answered after the identity changed is not remembered', async () => {
        const { api, release } = heldApi()
        const token = 't:Stock?product_id=in:a,b'
        const outcome = loadQueryPart(api, token).then(
            () => 'resolved',
            (e: Error) => e.message,
        )
        await sleep(30)
        login('u2', 'o1')
        release({ success: true, parts: { q1: { success: true, data: [{ product_id: 'a' }] } } })
        expect(await outcome).toBe('batch scope changed')
        resetCacheScopeTracking()
        login('u1', 'o1')
        expect(narrowInToken(token)).toBeNull()
    })
})

describe('prefetchAll with the identity changing mid-request (H5b)', () => {
    it('drops the catalog fetched for the previous identity', async () => {
        let release: () => void = () => {}
        const gate = new Promise<void>((r) => (release = r))
        const api = {
            get: vi.fn(async () => {
                await gate
                return { data: { data: { tables: { Sale: meta('u1-secret') }, modals: {}, version: 'v1' } } }
            }),
        }
        const p = useMetadataCache.getState().prefetchAll(api)
        login('u2', 'o1')
        release()
        await p
        expect(useMetadataCache.getState().cache).toEqual({})
        expect(useMetadataCache.getState().prefetched).toBe(false)
        resetCacheScopeTracking()
        login('u1', 'o1')
        expect(useMetadataCache.getState().getMetadata('Sale')).toBeUndefined()
    })
})

describe('metadata written with the scope captured at request time (H3)', () => {
    it('drops a direct GET answer that returns after the identity changed', () => {
        const asked = cacheScope() // u1 asks
        login('u2', 'o1')
        useMetadataCache.getState().setMetadata('Sale', meta('u1-secret'), { scope: asked })
        useMetadataCache.getState().setModalMetadata('Sale', meta('u1-secret'), { scope: asked })
        expect(useMetadataCache.getState().getMetadata('Sale')).toBeUndefined()
        expect(useMetadataCache.getState().getModalMetadata('Sale')).toBeUndefined()
        expect(useMetadataCache.getState().cache).toEqual({})
    })

    it('stores when the scope still matches, and discards a captured null', () => {
        useMetadataCache.getState().setMetadata('Sale', meta('mine'), { scope: cacheScope() })
        expect(useMetadataCache.getState().getMetadata('Sale')?.title).toBe('mine')
        useMetadataCache.getState().setMetadata('Other', meta('x'), { scope: null })
        expect(useMetadataCache.getState().getMetadata('Other')).toBeUndefined()
    })
})

describe('identity tied to the token (H2)', () => {
    it('is null when the stored JWT belongs to another user or organization', () => {
        login('u1', 'o1')
        localStorage.setItem('auth_token', jwt({ sub: 'u2', org: 'o1' }))
        expect(peekCacheScope()).toBeNull()
        localStorage.setItem('auth_token', jwt({ sub: 'u1', org: 'o2' }))
        expect(peekCacheScope()).toBeNull()
        localStorage.setItem('auth_token', jwt({ ID: 'u2', OrganizationID: 'o1' }))
        expect(peekCacheScope()).toBeNull()
    })

    it('matches when token and auth_user agree', () => {
        localStorage.setItem('auth_token', jwt({ sub: 'u1', org: 'o1', exp: 9999999999 }))
        expect(peekCacheScope()).toBe('o1:u1:es')
    })

    it('keeps trusting auth_user when the token is not a decodable JWT', () => {
        localStorage.setItem('auth_token', 'opaque-session-token')
        expect(peekCacheScope()).toBe('o1:u1:es')
        localStorage.setItem('auth_token', 'a.%%%.c')
        expect(peekCacheScope()).toBe('o1:u1:es')
    })

    it('the metadata cache is unreadable while the SSO token and auth_user disagree', () => {
        useMetadataCache.getState().setMetadata('Sale', meta('mine'))
        localStorage.setItem('auth_token', jwt({ sub: 'u2', org: 'o1' }))
        expect(useMetadataCache.getState().getMetadata('Sale')).toBeUndefined()
    })

    it('setCacheScopeProvider feeds the scope and wins over localStorage', () => {
        localStorage.setItem('auth_token', jwt({ sub: 'u9', org: 'o9' }))
        setCacheScopeProvider(() => ({ org: 'oh', user: 'uh', lang: 'en' }))
        expect(peekCacheScope()).toBe('oh:uh:en')
        setCacheScopeProvider(() => ({ org: 'oh', user: 'uh' }))
        expect(peekCacheScope()).toBe('oh:uh:es')
        setCacheScopeProvider(() => null)
        expect(peekCacheScope()).toBeNull()
        setCacheScopeProvider(null)
        expect(peekCacheScope()).toBeNull() // token of u9 vs auth_user u1
    })
})

describe('options scope (H4)', () => {
    it('keys by org:user:lang and branch, and is empty without identity', () => {
        expect(optionsScope()).toBe('o1:u1:es|')
        localStorage.setItem('active_branch_id', 'b1')
        expect(optionsScope()).toBe('o1:u1:es|b1')
        login('u2', 'o1')
        expect(optionsScope()).toBe('o1:u2:es|b1')
        localStorage.removeItem('auth_user')
        expect(optionsScope()).toBe('')
        localStorage.removeItem('active_branch_id')
    })
})

describe('useOptionsResolver across identities (H4)', () => {
    function client() {
        return {
            get: vi.fn(async () => ({
                data: { success: true, data: [{ value: 'a', label: 'A' }], meta: { type: 'dynamic', count: 1 } },
            })),
            // Rejects like a host without /q: the resolver must fall back to GET.
            post: vi.fn(async () => {
                throw new Error('batch unavailable')
            }),
            put: vi.fn(),
            delete: vi.fn(),
        }
    }
    const wrap = (api: ReturnType<typeof client>) => ({ children }: { children: ReactNode }) =>
        createElement(ApiProvider, { client: api as never, batch: false, children })

    it('does not reuse one account options for the next one', async () => {
        const api = client()
        const args = { modelKey: 'Customer', fieldKey: 'id', query: 'zz-scope' }
        const first = renderHook(() => useOptionsResolver(args), { wrapper: wrap(api) })
        await waitFor(() => expect(first.result.current.options).toHaveLength(1))
        first.unmount()
        const calls = api.get.mock.calls.length
        const again = renderHook(() => useOptionsResolver(args), { wrapper: wrap(api) })
        await waitFor(() => expect(again.result.current.options).toHaveLength(1))
        expect(api.get.mock.calls.length).toBe(calls) // same account: cached
        again.unmount()
        login('u2', 'o1')
        cacheScope()
        const other = renderHook(() => useOptionsResolver(args), { wrapper: wrap(api) })
        await waitFor(() => expect(other.result.current.options).toHaveLength(1))
        expect(api.get.mock.calls.length).toBe(calls + 1) // new account: asked again
        other.unmount()
    })

    it('falls back to the plain GET when the batch is dropped by a scope change', async () => {
        const api = client()
        api.post = vi.fn(async () => ({ data: { success: true, parts: { q1: { success: true, data: [] } } } })) as never
        const hook = renderHook(() => useOptionsResolver({ modelKey: 'Customer', fieldKey: 'id', query: 'zz-miss' }), {
            wrapper: wrap(api),
        })
        login('u2', 'o1') // before the 8ms window closes
        await waitFor(() => expect(hook.result.current.options).toHaveLength(1))
        expect(hook.result.current.error).toBeNull()
        expect(api.get).toHaveBeenCalled()
        hook.unmount()
    })
})

describe('row cache of the table (sessionStorage)', () => {
    it('is wiped on a scope change', async () => {
        const { clearTableDataCache } = await import('./dynamic-table')
        sessionStorage.setItem('mc:tbl:data:v1|o1:u1:es|Sale||', '{"rows":[{"id":"u1-row"}],"rowCount":1,"ts":1}')
        sessionStorage.setItem('unrelated', 'keep')
        login('u2', 'o1')
        cacheScope()
        expect(sessionStorage.getItem('mc:tbl:data:v1|o1:u1:es|Sale||')).toBeNull()
        expect(sessionStorage.getItem('unrelated')).toBe('keep')
        sessionStorage.setItem('mc:tbl:data:v1|x', '1')
        clearTableDataCache()
        expect(sessionStorage.getItem('mc:tbl:data:v1|x')).toBeNull()
        sessionStorage.removeItem('unrelated')
        // The first import of dynamic-table is heavy: slow CI runners exceeded the 5 s default.
    }, 60_000)
})

describe('JWT decoding memo', () => {
    it('decodes the stored token once per distinct text, not on every peek', () => {
        localStorage.setItem('auth_token', jwt({ sub: 'u1', org: 'o1', n: 'memo-a' }))
        const atob = vi.spyOn(globalThis, 'atob')
        try {
            expect(peekCacheScope()).toBe('o1:u1:es')
            const first = atob.mock.calls.length
            expect(first).toBeGreaterThan(0)
            for (let i = 0; i < 5; i++) peekCacheScope()
            expect(atob.mock.calls.length).toBe(first)
            // A different token is decoded again (and still checked against auth_user).
            localStorage.setItem('auth_token', jwt({ sub: 'u2', org: 'o1', n: 'memo-b' }))
            expect(peekCacheScope()).toBeNull()
            expect(atob.mock.calls.length).toBeGreaterThan(first)
        } finally {
            atob.mockRestore()
        }
    })
})

describe('useOptionsResolver without identity (scope null)', () => {
    it('neither reads the cache, shares the in-flight request nor writes', async () => {
        const mk = () => ({
            get: vi.fn(async () => ({
                data: { success: true, data: [{ value: 'a', label: 'A' }], meta: { type: 'dynamic', count: 1 } },
            })),
            post: vi.fn(async () => {
                throw new Error('batch unavailable')
            }),
            put: vi.fn(),
            delete: vi.fn(),
        })
        const wrap = (api: ReturnType<typeof mk>) => ({ children }: { children: ReactNode }) =>
            createElement(ApiProvider, { client: api as never, batch: false, children })
        const args = { modelKey: 'Customer', fieldKey: 'id', query: 'zz-noident' }

        // 1) With identity, warm the cache for this exact lookup.
        const warm = mk()
        const h0 = renderHook(() => useOptionsResolver(args), { wrapper: wrap(warm) })
        await waitFor(() => expect(h0.result.current.options).toHaveLength(1))
        h0.unmount()
        expect(warm.get).toHaveBeenCalledTimes(1)

        // 2) Identity lost: the warm entry must not be served.
        localStorage.removeItem('auth_user')
        expect(cacheScope()).toBeNull()
        const api = mk()
        const h1 = renderHook(() => useOptionsResolver(args), { wrapper: wrap(api) })
        const h2 = renderHook(() => useOptionsResolver(args), { wrapper: wrap(api) })
        await waitFor(() => expect(h1.result.current.options).toHaveLength(1))
        await waitFor(() => expect(h2.result.current.options).toHaveLength(1))
        // no cache read + no shared in-flight: each hook asked on its own
        expect(api.get).toHaveBeenCalledTimes(2)
        h1.unmount()
        h2.unmount()

        // 3) Nothing was written: once logged in again, the lookup goes to the network.
        login('u1', 'o1')
        cacheScope()
        const after = mk()
        const h3 = renderHook(() => useOptionsResolver({ ...args, query: 'zz-noident' }), { wrapper: wrap(after) })
        await waitFor(() => expect(h3.result.current.options).toHaveLength(1))
        // the warm entry was dropped by the scope change, and the no-identity runs wrote nothing
        expect(after.get).toHaveBeenCalledTimes(1)
        h3.unmount()
    })
})

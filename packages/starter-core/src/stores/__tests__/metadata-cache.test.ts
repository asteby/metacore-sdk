import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cacheScope, setCacheScopeProvider } from '@asteby/metacore-runtime-react'
import type { TableMetadata } from '@/components/dynamic/types'

// Node has no localStorage; zustand's persist needs one to expose `.persist`.
vi.hoisted(() => {
    const m = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => void m.set(k, v),
        removeItem: (k: string) => void m.delete(k),
        clear: () => m.clear(),
        key: (i: number) => [...m.keys()][i] ?? null,
        get length() {
            return m.size
        },
    } })
    // zustand's persist reads `window.localStorage`.
    Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: globalThis })
})

const getMock = vi.fn()
vi.mock('@/lib/api', () => ({ api: { get: (...a: unknown[]) => getMock(...a) } }))

import { clearMetadataCache, useMetadataCache } from '../metadata-cache'

const meta = (title: string) => ({ title, actions: [{ key: 'x' }] }) as unknown as TableMetadata
let who: { org: string; user: string; lang: string } | null
const login = (user: string, org = 'o1') => {
    who = { org, user, lang: 'es' }
}

beforeEach(() => {
    getMock.mockReset()
    setCacheScopeProvider(() => who)
    login('u1')
    cacheScope()
    clearMetadataCache()
})
afterEach(() => {
    setCacheScopeProvider(null)
})

describe('starter-core metadata cache by org:user:lang scope', () => {
    it('serves what it stored for the same account', () => {
        useMetadataCache.getState().setMetadata('sales', meta('A'))
        expect(useMetadataCache.getState().hasMetadata('sales')).toBe(true)
        expect(useMetadataCache.getState().getMetadata('sales')?.title).toBe('A')
    })

    it('does not serve the previous account metadata (even if the store was not cleared)', () => {
        useMetadataCache.getState().setMetadata('sales', meta('u1'))
        useMetadataCache.getState().setModalMetadata('sales', meta('u1-modal'))
        login('u2')
        const s = useMetadataCache.getState()
        expect(s.getMetadata('sales')).toBeUndefined()
        expect(s.hasMetadata('sales')).toBe(false)
        expect(s.getModalMetadata('sales')).toBeUndefined()
        expect(s.hasModalMetadata('sales')).toBe(false)
    })

    it('a write under another account replaces, never merges with, the old entries', () => {
        useMetadataCache.getState().setMetadata('sales', meta('u1'))
        login('u2')
        useMetadataCache.getState().setMetadata('stock', meta('u2'))
        const s = useMetadataCache.getState()
        expect(s.getMetadata('stock')?.title).toBe('u2')
        expect(s.cache.sales).toBeUndefined()
    })

    it('neither reads nor writes without identity', () => {
        useMetadataCache.getState().setMetadata('sales', meta('u1'))
        who = null
        expect(useMetadataCache.getState().getMetadata('sales')).toBeUndefined()
        useMetadataCache.getState().setMetadata('x', meta('nope'))
        login('u1')
        expect(useMetadataCache.getState().cache.x).toBeUndefined()
    })

    it('drops an answer whose request was made under another scope', () => {
        const asked = (login('u1'), 'o1:u1:es')
        login('u2')
        useMetadataCache.getState().setMetadata('sales', meta('late-u1'), { scope: asked })
        expect(useMetadataCache.getState().cache.sales).toBeUndefined()
        useMetadataCache.getState().setMetadata('sales', meta('ok'), { scope: 'o1:u2:es' })
        expect(useMetadataCache.getState().getMetadata('sales')?.title).toBe('ok')
    })

    it('clears itself when the scope changes', () => {
        cacheScope()
        useMetadataCache.getState().setMetadata('sales', meta('u1'))
        login('u2')
        cacheScope() // notices the change and notifies the caches
        expect(useMetadataCache.getState().cache).toEqual({})
        expect(useMetadataCache.getState().scope).toBe('')
    })

    it('prefetchAll: does not fetch without identity and drops an answer that arrives after a switch', async () => {
        who = null
        await useMetadataCache.getState().prefetchAll()
        expect(getMock).not.toHaveBeenCalled()

        login('u1')
        let release: (v: unknown) => void = () => {}
        getMock.mockReturnValueOnce(new Promise((r) => (release = r)))
        const p = useMetadataCache.getState().prefetchAll()
        login('u2')
        release({ data: { data: { tables: { sales: meta('u1') }, modals: {}, version: 'v1' } } })
        await p
        expect(useMetadataCache.getState().cache).toEqual({})
        expect(useMetadataCache.getState().prefetched).toBe(false)
    })

    it('prefetchAll stores under the current scope and refetches for another account', async () => {
        getMock.mockResolvedValue({ data: { data: { tables: { sales: meta('A') }, modals: {}, version: 'v1' } } })
        await useMetadataCache.getState().prefetchAll()
        expect(useMetadataCache.getState().getMetadata('sales')?.title).toBe('A')
        await useMetadataCache.getState().prefetchAll() // same scope: already prefetched
        expect(getMock).toHaveBeenCalledTimes(1)
        login('u2')
        getMock.mockResolvedValue({ data: { data: { tables: { sales: meta('B') }, modals: {}, version: 'v1' } } })
        await useMetadataCache.getState().prefetchAll()
        expect(getMock).toHaveBeenCalledTimes(2)
        expect(useMetadataCache.getState().getMetadata('sales')?.title).toBe('B')
    })

    it('writes the scope with the persisted copy and clears it on scope change', () => {
        useMetadataCache.getState().setMetadata('sales', meta('u1'))
        const raw = JSON.parse(localStorage.getItem('metadata-cache') ?? 'null')
        expect(raw.state.scope).toBe('o1:u1:es')
        login('u2')
        cacheScope()
        expect(localStorage.getItem('metadata-cache')).toBeNull()
    })

    it('persist version 4 migrate discards anything persisted before (no owner)', () => {
        const opts = useMetadataCache.persist.getOptions()
        expect(opts.version).toBe(4)
        const migrated = opts.migrate!({ cache: { sales: meta('old') }, modalCache: {}, metadataVersion: 'v' }, 3) as {
            cache: object
            scope: string
        }
        expect(migrated.cache).toEqual({})
        expect(migrated.scope).toBe('')
    })
})

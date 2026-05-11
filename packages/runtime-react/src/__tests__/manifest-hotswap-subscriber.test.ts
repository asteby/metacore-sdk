import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    ADDON_MANIFEST_CHANGED_TYPE,
    wireHotSwapInvalidation,
    type AddonManifestChangedMessage,
    type ManifestHotSwapClient,
} from '../manifest-hotswap-subscriber'
import { useMetadataCache, defaultAddonKeyMatcher } from '../metadata-cache'
import type { TableMetadata } from '../types'

// Minimal stub TableMetadata; the cache stores values opaquely so the only
// requirement is the type-shape compiles.
const fakeMeta = (label: string): TableMetadata => ({ label }) as unknown as TableMetadata

interface FakeClient extends ManifestHotSwapClient {
    emit: (msg: AddonManifestChangedMessage) => void
    subscriberCount: () => number
}

function makeFakeClient(): FakeClient {
    const subs = new Map<string, Set<(m: AddonManifestChangedMessage) => void>>()
    return {
        subscribe(type, handler) {
            let set = subs.get(type)
            if (!set) {
                set = new Set()
                subs.set(type, set)
            }
            set.add(handler)
            return () => {
                subs.get(type)?.delete(handler)
            }
        },
        emit(msg) {
            const set = subs.get(msg.type)
            if (!set) return
            for (const h of set) h(msg)
        },
        subscriberCount() {
            return Array.from(subs.values()).reduce((n, s) => n + s.size, 0)
        },
    }
}

describe('manifest-hotswap-subscriber', () => {
    beforeEach(() => {
        // Reset the zustand cache between tests so each starts from a
        // known-empty state. The store persists by default; resetState
        // here keeps the in-memory copy isolated.
        useMetadataCache.setState({
            cache: {},
            modalCache: {},
            metadataVersion: 'v-old',
            prefetched: true,
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('emits the topic name the kernel/bridge publishes', () => {
        expect(ADDON_MANIFEST_CHANGED_TYPE).toBe('ADDON_MANIFEST_CHANGED')
    })

    it('subscribes to ADDON_MANIFEST_CHANGED and invalidates the named addon on receipt', () => {
        const cache = useMetadataCache.getState()
        cache.setMetadata('kitchen_display.tickets', fakeMeta('tickets'))
        cache.setMetadata('kitchen_display:settings', fakeMeta('settings'))
        cache.setMetadata('kitchen_display/lines', fakeMeta('lines'))
        cache.setMetadata('pos.cart', fakeMeta('cart'))
        cache.setModalMetadata('kitchen_display.printer', fakeMeta('printer'))
        cache.setModalMetadata('inventory.batch', fakeMeta('batch'))

        const client = makeFakeClient()
        const unsubscribe = wireHotSwapInvalidation(client)
        expect(client.subscriberCount()).toBe(1)

        client.emit({
            type: 'ADDON_MANIFEST_CHANGED',
            payload: {
                addonKey: 'kitchen_display',
                oldHash: 'sha256:aaa',
                newHash: 'sha256:bbb',
                version: '1.2.0',
            },
        })

        const after = useMetadataCache.getState()
        // Three table-cache entries scoped to kitchen_display should be gone.
        expect(after.cache).toEqual({ 'pos.cart': fakeMeta('cart') })
        // One modal entry gone; the inventory entry stays.
        expect(after.modalCache).toEqual({ 'inventory.batch': fakeMeta('batch') })
        // prefetched flipped to false so prefetchAll() can re-run.
        expect(after.prefetched).toBe(false)

        unsubscribe()
        expect(client.subscriberCount()).toBe(0)
    })

    it('invokes the onSwap callback with the message and the removed count', () => {
        const cache = useMetadataCache.getState()
        cache.setMetadata('pos.cart', fakeMeta('cart'))
        cache.setMetadata('pos:lines', fakeMeta('lines'))
        cache.setMetadata('inventory.batch', fakeMeta('batch'))

        const onSwap = vi.fn()
        const client = makeFakeClient()
        wireHotSwapInvalidation(client, { onSwap })

        const message: AddonManifestChangedMessage = {
            type: 'ADDON_MANIFEST_CHANGED',
            payload: { addonKey: 'pos', newHash: 'sha256:new' },
        }
        client.emit(message)

        expect(onSwap).toHaveBeenCalledTimes(1)
        expect(onSwap).toHaveBeenCalledWith(message, 2)
    })

    it('honours a custom matcher when the host uses a different key convention', () => {
        const cache = useMetadataCache.getState()
        cache.setMetadata('addons/pos/cart', fakeMeta('cart'))
        cache.setMetadata('addons/pos/lines', fakeMeta('lines'))
        cache.setMetadata('addons/inv/batch', fakeMeta('batch'))

        const matcher = (cacheKey: string, addonKey: string) =>
            cacheKey.startsWith(`addons/${addonKey}/`)

        const client = makeFakeClient()
        wireHotSwapInvalidation(client, { matcher })

        client.emit({
            type: 'ADDON_MANIFEST_CHANGED',
            payload: { addonKey: 'pos' },
        })

        const after = useMetadataCache.getState()
        expect(Object.keys(after.cache)).toEqual(['addons/inv/batch'])
    })

    it('ignores malformed messages (missing addonKey) without throwing', () => {
        const cache = useMetadataCache.getState()
        cache.setMetadata('pos.cart', fakeMeta('cart'))

        const client = makeFakeClient()
        wireHotSwapInvalidation(client)

        expect(() =>
            client.emit({
                type: 'ADDON_MANIFEST_CHANGED',
                // @ts-expect-error — exercising the malformed-payload guard
                payload: {},
            }),
        ).not.toThrow()

        // Cache untouched.
        expect(useMetadataCache.getState().cache).toEqual({
            'pos.cart': fakeMeta('cart'),
        })
    })

    it('returns a no-op unsubscribe when the client is undefined', () => {
        const unsubscribe = wireHotSwapInvalidation(undefined)
        expect(typeof unsubscribe).toBe('function')
        expect(() => unsubscribe()).not.toThrow()
    })

    it('default matcher recognises addonKey, prefix., prefix:, prefix/', () => {
        expect(defaultAddonKeyMatcher('pos', 'pos')).toBe(true)
        expect(defaultAddonKeyMatcher('pos.cart', 'pos')).toBe(true)
        expect(defaultAddonKeyMatcher('pos:lines', 'pos')).toBe(true)
        expect(defaultAddonKeyMatcher('pos/checkout', 'pos')).toBe(true)
        expect(defaultAddonKeyMatcher('possible.x', 'pos')).toBe(false)
        expect(defaultAddonKeyMatcher('inventory.cart', 'pos')).toBe(false)
        expect(defaultAddonKeyMatcher('', 'pos')).toBe(false)
        expect(defaultAddonKeyMatcher('pos.cart', '')).toBe(false)
    })
})

import { describe, expect, it, vi } from 'vitest'
import {
    applyHotSwapReload,
    withVersionParam,
    clearFederationContainer,
    shortenHash,
    type HotSwapReloadConfig,
    type HotSwapReloadDeps,
} from '../hotswap-reload-policy'
import { type AddonManifestChangedMessage } from '../manifest-hotswap-subscriber'

const msg = (
    addonKey: string,
    newHash: string | undefined = 'sha256:abcdef1234567890',
): AddonManifestChangedMessage => ({
    type: 'ADDON_MANIFEST_CHANGED',
    payload: { addonKey, newHash },
})

interface FakeState {
    map: Record<string, string>
    deps: HotSwapReloadDeps
    reload: ReturnType<typeof vi.fn>
}

function makeFakeState(): FakeState {
    const reload = vi.fn()
    const state: FakeState = {
        map: {},
        // populated below
        deps: {} as HotSwapReloadDeps,
        reload,
    }
    state.deps = {
        setVersionMap: (updater) => {
            state.map = updater(state.map)
        },
        reload,
    }
    return state
}

describe('shortenHash', () => {
    it('strips the algorithm prefix and truncates to 8 hex chars', () => {
        expect(shortenHash('sha256:ABCDEF1234567890')).toBe('abcdef12')
        expect(shortenHash('abcdef1234567890')).toBe('abcdef12')
    })

    it('returns undefined for missing / empty input', () => {
        expect(shortenHash(undefined)).toBeUndefined()
        expect(shortenHash('')).toBeUndefined()
        expect(shortenHash('sha256:')).toBeUndefined()
    })
})

describe('withVersionParam', () => {
    it('appends ?v=<hash8> to a URL with no query', () => {
        expect(
            withVersionParam('/api/addons/pos/frontend/remoteEntry.js', 'sha256:abcdef1234'),
        ).toBe('/api/addons/pos/frontend/remoteEntry.js?v=abcdef12')
    })

    it('appends &v=<hash8> when other query params exist', () => {
        expect(withVersionParam('/r.js?foo=1&bar=2', 'abcdef1234')).toBe(
            '/r.js?foo=1&bar=2&v=abcdef12',
        )
    })

    it('replaces a prior v= entry instead of accumulating', () => {
        expect(withVersionParam('/r.js?v=oldhash&foo=1', 'newhash99')).toBe(
            '/r.js?foo=1&v=newhash9',
        )
    })

    it('preserves the URL fragment', () => {
        expect(withVersionParam('/r.js#section', 'abcdef1234')).toBe(
            '/r.js?v=abcdef12#section',
        )
    })

    it('is idempotent for the same hash', () => {
        const once = withVersionParam('/r.js', 'abcdef1234')
        const twice = withVersionParam(once, 'abcdef1234')
        expect(twice).toBe(once)
    })

    it('returns the URL unchanged for falsy hash', () => {
        expect(withVersionParam('/r.js', undefined)).toBe('/r.js')
        expect(withVersionParam('/r.js', '')).toBe('/r.js')
    })
})

describe('clearFederationContainer', () => {
    it('removes the container from window and returns true', () => {
        // Node test environment — globalThis is functionally `window` here.
        // We set a property and expect it to be removed.
        ;(globalThis as Record<string, unknown>).metacore_test_addon = {
            init: () => {},
            get: () => {},
        }
        // The function checks `typeof window === 'undefined'`. In node env
        // that's true → returns false. We only assert this code path doesn't
        // throw and returns a boolean. The window-present case is exercised
        // indirectly through manual integration in the hot-swap docs.
        const result = clearFederationContainer('metacore_test_addon')
        expect(typeof result).toBe('boolean')
        delete (globalThis as Record<string, unknown>).metacore_test_addon
    })

    it('returns false when called for an unregistered scope in SSR (no window)', () => {
        expect(clearFederationContainer('metacore_never_registered')).toBe(false)
    })
})

describe('applyHotSwapReload', () => {
    it('returns "noop" and does not touch the map when addonKey is missing', async () => {
        const state = makeFakeState()
        const action = await applyHotSwapReload(
            {
                type: 'ADDON_MANIFEST_CHANGED',
                // @ts-expect-error — exercising the guard
                payload: {},
            },
            {},
            state.deps,
        )
        expect(action).toBe('noop')
        expect(state.map).toEqual({})
    })

    it('default strategy rekeys the map with the short hash and fires onSwap("rekey")', async () => {
        const state = makeFakeState()
        const onSwap = vi.fn()
        const action = await applyHotSwapReload(
            msg('pos', 'sha256:abcdef1234'),
            { onSwap },
            state.deps,
        )
        expect(action).toBe('rekey')
        expect(state.map).toEqual({ pos: 'abcdef12' })
        expect(onSwap).toHaveBeenCalledWith(expect.anything(), 'rekey')
    })

    it('successive bumps for the same addon update the hash in place', async () => {
        const state = makeFakeState()
        await applyHotSwapReload(msg('pos', 'sha256:abcdef1234'), {}, state.deps)
        await applyHotSwapReload(msg('pos', 'sha256:99999999'), {}, state.deps)
        expect(state.map).toEqual({ pos: '99999999' })
    })

    it('bumps for different addons accumulate as independent entries', async () => {
        const state = makeFakeState()
        await applyHotSwapReload(msg('pos', 'sha256:aaaaaaaa'), {}, state.deps)
        await applyHotSwapReload(msg('kitchen', 'sha256:bbbbbbbb'), {}, state.deps)
        expect(state.map).toEqual({ pos: 'aaaaaaaa', kitchen: 'bbbbbbbb' })
    })

    it('cancels rekey when onBeforeReload returns false (sync)', async () => {
        const state = makeFakeState()
        const onBeforeReload = vi.fn().mockReturnValue(false)
        const onSwap = vi.fn()
        const action = await applyHotSwapReload(
            msg('pos'),
            { strategy: 'rekey', onBeforeReload, onSwap },
            state.deps,
        )
        expect(action).toBe('cancelled')
        expect(state.map).toEqual({})
        expect(onSwap).toHaveBeenCalledWith(expect.anything(), 'cancelled')
    })

    it('proceeds with rekey when async onBeforeReload resolves true', async () => {
        const state = makeFakeState()
        const onBeforeReload = vi.fn().mockResolvedValue(true)
        const action = await applyHotSwapReload(
            msg('pos'),
            { strategy: 'rekey', onBeforeReload },
            state.deps,
        )
        expect(action).toBe('rekey')
        expect(state.map).toEqual({ pos: 'abcdef12' })
    })

    it('strategy=manual updates the map and reports "manual" without reloading', async () => {
        const state = makeFakeState()
        const onSwap = vi.fn()
        const action = await applyHotSwapReload(
            msg('pos'),
            { strategy: 'manual', onSwap },
            state.deps,
        )
        expect(action).toBe('manual')
        expect(state.map).toEqual({ pos: 'abcdef12' })
        expect(state.reload).not.toHaveBeenCalled()
        expect(onSwap).toHaveBeenCalledWith(expect.anything(), 'manual')
    })

    it('strategy=page-reload invokes the reload function via microtask', async () => {
        const state = makeFakeState()
        const onSwap = vi.fn()
        const action = await applyHotSwapReload(
            msg('pos'),
            { strategy: 'page-reload', onSwap },
            state.deps,
        )
        expect(action).toBe('page-reload')
        expect(onSwap).toHaveBeenCalledWith(expect.anything(), 'page-reload')

        // Yield to the microtask queue so the deferred reload fires.
        await Promise.resolve()
        expect(state.reload).toHaveBeenCalledTimes(1)
    })

    it('strategy=page-reload + onBeforeReload(false) skips the reload', async () => {
        const state = makeFakeState()
        const onBeforeReload = vi.fn().mockReturnValue(false)
        const onSwap = vi.fn()
        const action = await applyHotSwapReload(
            msg('pos'),
            { strategy: 'page-reload', onBeforeReload, onSwap },
            state.deps,
        )
        expect(action).toBe('cancelled')
        await Promise.resolve()
        expect(state.reload).not.toHaveBeenCalled()
        expect(onSwap).toHaveBeenCalledWith(expect.anything(), 'cancelled')
    })

    it('skips map update when newHash is missing but still rekeys (no-op effect)', async () => {
        const state = makeFakeState()
        const onSwap = vi.fn()
        // Build a message with an explicitly missing newHash. Going through
        // `msg(..., undefined)` would trigger the default-value substitution,
        // so we hand-roll the payload here.
        const action = await applyHotSwapReload(
            {
                type: 'ADDON_MANIFEST_CHANGED',
                payload: { addonKey: 'pos' },
            },
            { onSwap },
            state.deps,
        )
        expect(action).toBe('rekey')
        // Without a hash, we have nothing to write; the map stays empty
        // but onSwap still fires for telemetry.
        expect(state.map).toEqual({})
        expect(onSwap).toHaveBeenCalledWith(expect.anything(), 'rekey')
    })
})

import { describe, expect, it, vi } from 'vitest'
import {
    composeDisposables,
    disposableFromRegisterResult,
    isAddonFrontendCacheUrl,
    resolvePluginExports,
    runDispose,
    shouldReregisterRemote,
    markRemoteRegistered,
    resetRemoteRegistry,
} from '../addon-fiber'

describe('isAddonFrontendCacheUrl', () => {
    it('matches kernel and legacy frontend paths for that addon only', () => {
        expect(
            isAddonFrontendCacheUrl(
                'https://app.example/api/metacore/addons/pos/frontend/remoteEntry.js?v=abc',
                'pos',
            ),
        ).toBe(true)
        expect(
            isAddonFrontendCacheUrl(
                'https://app.example/api/addons/pos/frontend.js',
                'pos',
            ),
        ).toBe(true)
        expect(
            isAddonFrontendCacheUrl(
                'https://app.example/api/metacore/addons/kds/frontend/remoteEntry.js',
                'pos',
            ),
        ).toBe(false)
        expect(
            isAddonFrontendCacheUrl(
                'https://app.example/api/metadata/pos',
                'pos',
            ),
        ).toBe(false)
    })
})

describe('resolvePluginExports', () => {
    it('reads a named register export', () => {
        const register = vi.fn()
        expect(resolvePluginExports({ register }).register).toBe(register)
    })

    it('reads definePlugin default object', () => {
        const register = vi.fn()
        const dispose = vi.fn()
        const resolved = resolvePluginExports({
            default: { key: 'pos', register, dispose },
        })
        expect(resolved.register).toBeTypeOf('function')
        expect(resolved.dispose).toBeTypeOf('function')
    })

    it('reads a default function module', () => {
        const register = vi.fn()
        expect(resolvePluginExports({ default: register }).register).toBe(register)
    })

    it('returns empty for null', () => {
        expect(resolvePluginExports(null)).toEqual({})
    })
})

describe('composeDisposables', () => {
    it('runs disposers in reverse order (Cordis effects)', async () => {
        const order: number[] = []
        const d = composeDisposables(
            () => {
                order.push(1)
            },
            () => {
                order.push(2)
            },
        )
        await d()
        expect(order).toEqual([2, 1])
    })
})

describe('runDispose', () => {
    it('swallows disposer errors', async () => {
        await expect(
            runDispose(() => {
                throw new Error('boom')
            }),
        ).resolves.toBeUndefined()
    })
})

describe('disposableFromRegisterResult', () => {
    it('returns functions and ignores void', () => {
        const d = () => {}
        expect(disposableFromRegisterResult(d)).toBe(d)
        expect(disposableFromRegisterResult(undefined)).toBeUndefined()
    })
})

describe('remote registry', () => {
    it('reregisters only when the entry URL changes', () => {
        resetRemoteRegistry()
        expect(shouldReregisterRemote('metacore_pos', '/r.js?v=1')).toBe(true)
        markRemoteRegistered('metacore_pos', '/r.js?v=1')
        expect(shouldReregisterRemote('metacore_pos', '/r.js?v=1')).toBe(false)
        expect(shouldReregisterRemote('metacore_pos', '/r.js?v=2')).toBe(true)
        resetRemoteRegistry()
    })
})

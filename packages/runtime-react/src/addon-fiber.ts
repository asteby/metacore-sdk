/**
 * Addon fiber primitives — Cordis-style dispose/reload for federated modules
 * running inside a PWA host. Pure helpers so they unit-test without React
 * or the Module Federation runtime.
 */

import type { AddonAPI, Disposable, Plugin } from '@asteby/metacore-sdk'

export const PURGE_ADDON_MESSAGE = 'PURGE_ADDON' as const

export interface PurgeAddonMessage {
    type: typeof PURGE_ADDON_MESSAGE
    key: string
}

/** Shape of the exposed `./register` (or `./plugin`) module. */
export interface AddonRegisterModule {
    register?: Plugin['register']
    dispose?: Plugin['dispose']
    default?: Plugin['register'] | Plugin
}

export interface ResolvedPlugin {
    register?: Plugin['register']
    dispose?: Plugin['dispose']
}

/**
 * Accept every historical export shape:
 *   - `{ register, dispose? }`
 *   - `{ default: { register, dispose? } }`  (definePlugin)
 *   - `{ default: (api) => ... }`            (function module)
 */
export function resolvePluginExports(mod: AddonRegisterModule | null | undefined): ResolvedPlugin {
    if (!mod) return {}
    const fromDefault =
        mod.default && typeof mod.default === 'object'
            ? (mod.default as Plugin)
            : undefined
    const registerFn =
        typeof mod.register === 'function'
            ? mod.register
            : typeof fromDefault?.register === 'function'
              ? fromDefault.register.bind(fromDefault)
              : typeof mod.default === 'function'
                ? mod.default
                : undefined
    const disposeFn =
        typeof mod.dispose === 'function'
            ? mod.dispose
            : typeof fromDefault?.dispose === 'function'
              ? fromDefault.dispose.bind(fromDefault)
              : undefined
    return { register: registerFn, dispose: disposeFn }
}

export async function runDispose(dispose?: Disposable | null): Promise<void> {
    if (typeof dispose !== 'function') return
    try {
        await Promise.resolve(dispose())
    } catch {
        /* a failing disposer must not block the next fiber mount */
    }
}

export function composeDisposables(...fns: Array<Disposable | undefined | null>): Disposable {
    const list = fns.filter((f): f is Disposable => typeof f === 'function')
    return async () => {
        for (let i = list.length - 1; i >= 0; i--) {
            await runDispose(list[i])
        }
    }
}

/**
 * True when a Cache API / SW request is a federated frontend asset of `addonKey`.
 * Matches both `/api/addons/<key>/frontend` and `/api/metacore/addons/<key>/frontend`.
 */
export function isAddonFrontendCacheUrl(url: string, addonKey: string): boolean {
    if (!addonKey || !url) return false
    try {
        const path = new URL(url, 'http://local.invalid').pathname
        const escaped = addonKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        return new RegExp(`/api/(metacore/)?addons/${escaped}/frontend(/|\\.js)`).test(path)
    } catch {
        return false
    }
}

/**
 * Drop cached federation assets for one addon. Primary path is the page-side
 * Cache API (works even before the SW learns `PURGE_ADDON`). Also posts the
 * message so a current SW can drop its own entries.
 *
 * Never unregisters the SW and never deletes other caches — L1, not L2.
 */
export async function purgeAddonFrontendCache(addonKey: string): Promise<void> {
    if (!addonKey) return
    try {
        if (typeof caches !== 'undefined') {
            const names = await caches.keys()
            await Promise.all(
                names.map(async (name) => {
                    if (!name.includes('addon-federation')) return
                    const cache = await caches.open(name)
                    const requests = await cache.keys()
                    await Promise.all(
                        requests
                            .filter((req) => isAddonFrontendCacheUrl(req.url, addonKey))
                            .map((req) => cache.delete(req)),
                    )
                }),
            )
        }
    } catch {
        /* private mode / no Cache API */
    }
    try {
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
            const controller = navigator.serviceWorker.controller
            controller?.postMessage({ type: PURGE_ADDON_MESSAGE, key: addonKey } satisfies PurgeAddonMessage)
        }
    } catch {
        /* no SW */
    }
}

/** Test seam: which remote URL is currently registered per federation scope. */
export const remoteEntryByScope = new Map<string, string>()

export function shouldReregisterRemote(scope: string, url: string): boolean {
    return remoteEntryByScope.get(scope) !== url
}

export function markRemoteRegistered(scope: string, url: string): void {
    remoteEntryByScope.set(scope, url)
}

/** @internal tests */
export function resetRemoteRegistry(): void {
    remoteEntryByScope.clear()
}

/**
 * Safe no-op when `register()` returns void. Used by AddonLoader to treat
 * both historical and fiber-style plugins uniformly.
 */
export function disposableFromRegisterResult(
    result: void | Disposable,
): Disposable | undefined {
    return typeof result === 'function' ? result : undefined
}

/** Type-only re-export so AddonLoader does not import Plugin internals twice. */
export type { AddonAPI, Disposable }

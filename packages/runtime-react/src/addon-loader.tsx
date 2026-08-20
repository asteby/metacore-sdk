// Federated-module addon loader, built on the official Module Federation
// runtime (`@module-federation/runtime`). Per addon it registers the remote's
// `remoteEntry.js` as an ESM container, loads the exposed `./register` module,
// and calls `register(api)` with the AddonAPI injected by the host.
//
// Fiber lifecycle (Cordis-style): when `url` (the `?v=` cache-bust) changes,
// the previous plugin.dispose / returned Disposable run, the host registry
// unbinds that addonKey, the SW addon-federation cache for that key is
// purged, and register() runs again against the new remote. The host shell
// (auth, QueryClient, WebSocket, service worker controller) is not touched.
import { useEffect, useRef, useState } from 'react'
import { registerRemotes, loadRemote } from '@module-federation/runtime'
import type { AddonAPI, AddonLayout, Registry } from '@asteby/metacore-sdk'
import { useDeclareAddonLayout } from './addon-layout-context'
import {
    composeDisposables,
    disposableFromRegisterResult,
    markRemoteRegistered,
    purgeAddonFrontendCache,
    resolvePluginExports,
    runDispose,
    shouldReregisterRemote,
    type AddonRegisterModule,
    type Disposable,
} from './addon-fiber'

export interface AddonLoaderProps {
    /** Unique key of the addon — maps to the federation container name. */
    scope: string
    /** URL of the addon's remoteEntry.js bundle (may carry a `?v=` cache-bust). */
    url: string
    /** Exposed module to import from the remote (e.g. './register'). */
    module?: string
    /** Host-provided API passed to the addon's register() call. */
    api: AddonAPI
    /**
     * Host registry used to {@link Registry.unbind} this addon's contributions
     * on dispose. Optional so legacy hosts keep compiling; without it, fiber
     * remounts leak routes/actions.
     */
    hostRegistry?: Registry
    /**
     * Addon key for SW cache purge. Defaults to `api.manifest.key`.
     */
    addonKey?: string
    /**
     * Registry owner passed to {@link Registry.unbind}. Defaults to `addonKey`.
     * Immersive `./plugin` fibers use `${key}::view` so they don't wipe the
     * shell `./register` contributions of the same addon.
     */
    unbindKey?: string
    /** Optional rendering while loading. */
    fallback?: React.ReactNode
    /** Called once the addon has successfully registered (including re-register). */
    onReady?: () => void
    /** Called if loading fails. */
    onError?: (err: Error) => void
    /**
     * Layout the host shell should render the addon under, mirroring
     * `manifest.frontend.layout`. Default (undefined / `"shell"`) keeps the
     * legacy chrome (Sidebar, Topbar, breadcrumbs). `"immersive"` flips the
     * shared {@link useAddonLayout} context so the host shell hides chrome
     * while the addon is mounted and restores it on unmount.
     *
     * Hosts that consume the context (see `useAddonLayout` /
     * `<AddonLayoutProvider>`) do NOT need to branch on this prop themselves
     * — the loader sets the context value via {@link useDeclareAddonLayout}.
     */
    layout?: AddonLayout
    children?: React.ReactNode
}

// Derive the `loadRemote` id from the scope + exposed module name. MF resolves
// `"<remoteName>/<expose>"` — e.g. `metacore_tickets/register` for the
// `"./register"` expose. We strip the leading `./` of the expose path.
function remoteId(scope: string, module: string): string {
    const expose = module.replace(/^\.\//, '')
    return `${scope}/${expose}`
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// `@module-federation/vite` initialises the shared federation runtime instance
// asynchronously at host boot (it injects an init call into the entry). If an
// addon mounts before that init resolves — a real race on slow first paints,
// route preloads, or HMR — `registerRemotes`/`loadRemote` throw
// `[ Federation Runtime ]: Please call createInstance first. #RUNTIME-009`.
// It's transient: the runtime IS coming, we just raced it. So we treat
// RUNTIME-009 specifically as retryable and back off briefly until the host's
// init lands, instead of surfacing a dead "Addon load error" to the user.
function isRuntimeNotReady(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e)
    return msg.includes('#RUNTIME-009') || msg.includes('call createInstance')
}

// Retry an operation that may hit the boot race above. ~10 attempts × 60ms ≈
// 600ms worst case — generous for the host init, imperceptible in the common
// case (first attempt succeeds). Non-RUNTIME-009 errors (bad URL, 404, no
// export) rethrow immediately so genuine failures still surface fast.
async function withRuntimeReady<T>(op: () => T | Promise<T>): Promise<T> {
    const maxAttempts = 10
    for (let attempt = 1; ; attempt++) {
        try {
            return await op()
        } catch (e) {
            if (!isRuntimeNotReady(e) || attempt >= maxAttempts) throw e
            await sleep(60)
        }
    }
}

async function loadAddon(
    scope: string,
    url: string,
    module: string,
): Promise<AddonRegisterModule | null> {
    // Re-register whenever the `?v=` URL changes so a fiber swap actually
    // fetches the new remoteEntry. `force: true` wipes that remote's module
    // cache — without it, loadRemote would keep serving the previous bundle.
    if (shouldReregisterRemote(scope, url)) {
        await withRuntimeReady(() =>
            registerRemotes([{ name: scope, entry: url, type: 'module' }], { force: true }),
        )
        markRemoteRegistered(scope, url)
    }
    return withRuntimeReady(() =>
        loadRemote<AddonRegisterModule>(remoteId(scope, module)),
    )
}

export function AddonLoader({
    scope,
    url,
    module = './register',
    api,
    hostRegistry,
    addonKey,
    unbindKey,
    fallback = null,
    onReady,
    onError,
    layout,
    children,
}: AddonLoaderProps) {
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
    const [error, setError] = useState<Error | null>(null)
    const disposeRef = useRef<Disposable | undefined>(undefined)

    // Propagate the addon's preferred layout to the host shell via context.
    // No-op when `layout` is undefined or `"shell"` (legacy default). Cleanup
    // restores `"shell"` automatically when the loader unmounts, so chrome
    // returns as soon as the user navigates away from an immersive addon.
    useDeclareAddonLayout(layout)

    useEffect(() => {
        let cancelled = false
        const key = addonKey || api.manifest?.key
        const owner = unbindKey || key
        ;(async () => {
            try {
                setStatus('loading')
                if (key) await purgeAddonFrontendCache(key)
                const mod = await loadAddon(scope, url, module)
                if (cancelled) return
                const plugin = resolvePluginExports(mod)
                if (typeof plugin.register !== 'function') {
                    throw new Error(
                        `Addon "${scope}" module "${module}" has no register() export`,
                    )
                }
                // Drop leftover contributions from a previous fiber of this key
                // before the new register() runs (idempotent if none).
                if (owner && hostRegistry) hostRegistry.unbind(owner)
                const ret = await Promise.resolve(plugin.register(api))
                disposeRef.current = composeDisposables(
                    disposableFromRegisterResult(ret),
                    plugin.dispose,
                )
                setStatus('ready')
                onReady?.()
            } catch (e: unknown) {
                if (cancelled) return
                const err = e instanceof Error ? e : new Error(String(e))
                setError(err)
                setStatus('error')
                onError?.(err)
            }
        })()
        return () => {
            cancelled = true
            const d = disposeRef.current
            disposeRef.current = undefined
            void runDispose(d)
            if (owner && hostRegistry) hostRegistry.unbind(owner)
        }
        // api identity is expected to be stable per addon; including it would
        // re-register on every parent render. Fiber identity is (scope, url, module).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope, url, module, addonKey, unbindKey, hostRegistry])

    if (status === 'loading') return <>{fallback}</>
    if (status === 'error')
        return <div className="text-sm text-red-500">Addon load error: {error?.message}</div>
    return <>{children}</>
}

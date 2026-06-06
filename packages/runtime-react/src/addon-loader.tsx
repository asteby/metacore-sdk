// Federated-module addon loader, built on the official Module Federation
// runtime (`@module-federation/runtime`). Per addon it registers the remote's
// `remoteEntry.js` as an ESM container, loads the exposed `./register` module,
// and calls `register(api)` with the AddonAPI injected by the host.
//
// Why @module-federation/runtime (not the old manual init/get machinery):
// the host's Vite build uses `@module-federation/vite`'s `federation()` plugin,
// which auto-initialises the shared scope at host boot. `registerRemotes` +
// `loadRemote` then transparently wire the remote into that already-initialised
// share scope — so the remote consumes the HOST's React/SDK singletons instead
// of bundling its own. That's the whole point: it fixes the `useState`-null
// crash WITHOUT this loader ever touching a share scope manually.
import { useEffect, useRef, useState } from 'react'
import { registerRemotes, loadRemote } from '@module-federation/runtime'
import type { AddonAPI, AddonLayout } from '@asteby/metacore-sdk'
import { useDeclareAddonLayout } from './addon-layout-context'

export interface AddonLoaderProps {
    /** Unique key of the addon — maps to the federation container name. */
    scope: string
    /** URL of the addon's remoteEntry.js bundle (may carry a `?v=` cache-bust). */
    url: string
    /** Exposed module to import from the remote (e.g. './register'). */
    module?: string
    /** Host-provided API passed to the addon's register() call. */
    api: AddonAPI
    /** Optional rendering while loading. */
    fallback?: React.ReactNode
    /** Called once the addon has successfully registered. */
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

/** Shape of the exposed `./register` module. */
interface AddonRegisterModule {
    register?: (api: AddonAPI) => void | Promise<void>
    default?: (api: AddonAPI) => void | Promise<void>
}

// `registerRemotes` is additive + idempotent across re-mounts; we still track
// which scopes we've registered to avoid redundant `force` churn (each `force`
// re-register wipes that remote's module cache and logs a runtime warning).
const registered = new Set<string>()

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
    // Register the remote container as an ES module. `type: 'module'` matches
    // the `@module-federation/vite` remote (remoteEntry.js is an ESM bundle).
    // The `url` already carries the `?v=` cache-bust the host computed, so the
    // browser refetches a fresh remoteEntry when the addon version changes.
    //
    // Both calls are wrapped in `withRuntimeReady` because EITHER can throw
    // RUNTIME-009 when an addon mounts ahead of the host's federation init —
    // registration is what actually touches the (maybe-uninitialised) runtime.
    if (!registered.has(scope)) {
        await withRuntimeReady(() =>
            registerRemotes(
                [{ name: scope, entry: url, type: 'module' }],
                // `force: true` so a re-registration with a new `?v=` URL (addon
                // hot-swap / version bump) overwrites the stale entry + cache.
                { force: true },
            ),
        )
        registered.add(scope)
    }
    // loadRemote("<scope>/<expose>") returns the exposed module namespace (or
    // null if it can't be resolved). No manual share-scope init — the host's
    // federation runtime already initialised it.
    return withRuntimeReady(() =>
        loadRemote<AddonRegisterModule>(remoteId(scope, module)),
    )
}

export function AddonLoader({
    scope,
    url,
    module = './register',
    api,
    fallback = null,
    onReady,
    onError,
    layout,
    children,
}: AddonLoaderProps) {
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
    const [error, setError] = useState<Error | null>(null)
    const didRegister = useRef(false)

    // Propagate the addon's preferred layout to the host shell via context.
    // No-op when `layout` is undefined or `"shell"` (legacy default). Cleanup
    // restores `"shell"` automatically when the loader unmounts, so chrome
    // returns as soon as the user navigates away from an immersive addon.
    useDeclareAddonLayout(layout)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const mod = await loadAddon(scope, url, module)
                if (cancelled) return
                const register = mod?.register ?? mod?.default
                if (typeof register !== 'function') {
                    throw new Error(
                        `Addon "${scope}" module "${module}" has no register() export`,
                    )
                }
                if (!didRegister.current) {
                    didRegister.current = true
                    await Promise.resolve(register(api))
                }
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
        }
    }, [scope, url, module])

    if (status === 'loading') return <>{fallback}</>
    if (status === 'error')
        return <div className="text-sm text-red-500">Addon load error: {error?.message}</div>
    return <>{children}</>
}

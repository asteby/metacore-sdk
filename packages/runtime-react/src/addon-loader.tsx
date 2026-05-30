// Minimal federated-module addon loader. Injects a remoteEntry.js <script>,
// waits for the `window[scope]` container to initialize, then calls the
// addon's `register(api)` export with the AddonAPI injected by the host.
import { useEffect, useRef, useState } from 'react'
import type { AddonAPI, AddonLayout } from '@asteby/metacore-sdk'
import { useDeclareAddonLayout } from './addon-layout-context'

declare global {
    interface Window {
        [key: string]: any
        __webpack_init_sharing__?: (scope: string) => Promise<void>
        __webpack_share_scopes__?: Record<string, unknown>
    }
}

export interface AddonLoaderProps {
    /** Unique key of the addon — maps to the federation container name. */
    scope: string
    /** URL of the addon's remoteEntry.js bundle. */
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

interface FederationContainer {
    init: (shareScope: unknown) => Promise<void>
    get: (module: string) => Promise<() => any>
}

// Runtime dynamic import of an external URL. Wrapped in `new Function` so no
// build tool (tsc here, Vite in the consuming host) tries to statically
// analyse or rewrite the import — it stays a genuine runtime ESM fetch.
const importModule = new Function('u', 'return import(u)') as (
    u: string,
) => Promise<Record<string, unknown>>

const loadedScripts = new Map<string, Promise<void>>()

function loadScript(url: string, scope: string): Promise<void> {
    const key = `${scope}::${url}`
    const existing = loadedScripts.get(key)
    if (existing) return existing
    const promise = new Promise<void>((resolve, reject) => {
        const el = document.createElement('script')
        el.src = url
        el.type = 'text/javascript'
        el.async = true
        el.onload = () => resolve()
        el.onerror = () => reject(new Error(`Failed to load addon script: ${url}`))
        document.head.appendChild(el)
    })
    loadedScripts.set(key, promise)
    return promise
}

const esmContainers = new Map<string, Promise<FederationContainer | undefined>>()

// Resolve a federation container for the remote. Vite/@originjs remotes built
// with `format:"esm"` (our standard) are ES modules that top-level `import`
// their preload helper and export `{ init, get }` — they MUST be loaded as a
// module (a classic <script> throws "Cannot use import statement outside a
// module"), so we dynamic-import them and use the module namespace as the
// container. Legacy "var"/window remotes (which assign `window[scope]`) are
// still supported via the classic <script> fallback.
async function resolveContainer(scope: string, url: string): Promise<FederationContainer | undefined> {
    const key = `${scope}::${url}`
    const cached = esmContainers.get(key)
    if (cached) return cached
    const p = (async () => {
        try {
            const mod = await importModule(url)
            if (mod && typeof mod.init === 'function' && typeof mod.get === 'function') {
                return mod as unknown as FederationContainer
            }
        } catch {
            // Not an importable module (legacy var-format remote) — fall back.
        }
        await loadScript(url, scope)
        return (window as any)[scope] as FederationContainer | undefined
    })()
    esmContainers.set(key, p)
    p.catch(() => esmContainers.delete(key))
    return p
}

async function loadRemote(scope: string, url: string, module: string) {
    if (typeof window.__webpack_init_sharing__ === 'function') {
        await window.__webpack_init_sharing__('default')
    }
    const container = await resolveContainer(scope, url)
    if (!container) {
        throw new Error(`Addon container "${scope}" not found (neither ESM export nor window[scope])`)
    }
    if (typeof container.init === 'function') {
        const shareScope =
            window.__webpack_share_scopes__?.default ??
            ((window as any).__METACORE_SHARE_SCOPE__ ??= {})
        try {
            await container.init(shareScope)
        } catch {
            // Container already initialized (re-entrant load) — safe to ignore.
        }
    }
    const factory = await container.get(module)
    return factory()
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
                const mod = await loadRemote(scope, url, module)
                if (cancelled) return
                if (!didRegister.current && typeof mod?.register === 'function') {
                    didRegister.current = true
                    await Promise.resolve(mod.register(api))
                }
                setStatus('ready')
                onReady?.()
            } catch (e: any) {
                if (cancelled) return
                setError(e)
                setStatus('error')
                onError?.(e)
            }
        })()
        return () => { cancelled = true }
    }, [scope, url, module])

    if (status === 'loading') return <>{fallback}</>
    if (status === 'error') return <div className="text-sm text-red-500">Addon load error: {error?.message}</div>
    return <>{children}</>
}

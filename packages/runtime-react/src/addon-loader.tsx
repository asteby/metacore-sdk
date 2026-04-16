// Minimal federated-module addon loader. Injects a remoteEntry.js <script>,
// waits for the `window[scope]` container to initialize, then calls the
// addon's `register(api)` export with the AddonAPI injected by the host.
import { useEffect, useRef, useState } from 'react'
import type { AddonAPI } from '@asteby/metacore-sdk'

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
    children?: React.ReactNode
}

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

async function loadRemote(scope: string, module: string) {
    if (typeof window.__webpack_init_sharing__ === 'function') {
        await window.__webpack_init_sharing__('default')
    }
    const container = window[scope]
    if (!container) throw new Error(`Addon container "${scope}" not found on window`)
    if (typeof container.init === 'function' && window.__webpack_share_scopes__) {
        await container.init(window.__webpack_share_scopes__.default)
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
    children,
}: AddonLoaderProps) {
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
    const [error, setError] = useState<Error | null>(null)
    const didRegister = useRef(false)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                await loadScript(url, scope)
                if (cancelled) return
                const mod = await loadRemote(scope, module)
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

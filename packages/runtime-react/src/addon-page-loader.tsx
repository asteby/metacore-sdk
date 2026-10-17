// AddonPageLoader — mounts one `frontend.pages[]` entry of a federated remote.
//
// The host has already decided WHERE (embedded `/a/…` or full screen
// `/addons/…`) and WHETHER (permission) from the manifest; this component
// downloads the page's expose, verifies the remote entry (SRI), and renders
// the page inside:
//   FederatedErrorBoundary  → a crashing page never takes the shell down
//   AddonPageHost           → useHostApi / useHostContext / useAddonNavigate…
//   a sized container       → `contain: layout paint` + `isolation: isolate`
//                             so the page cannot paint over the host chrome
//
// Load failures (network, 404 expose, integrity) are not render errors: they
// show `errorFallback` (default: the boundary's card) with a retry that
// re-runs the load. `timeoutMs` turns a hung remote into that same error.
import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import {
    resolvePageModule,
    type AddonHostContext,
    type AddonPageProps,
    type FrontendPage,
    type HostApi,
} from '@asteby/metacore-sdk'
import { loadFederatedModule } from './addon-loader'
import { AddonPageHost, addonSubpath, type AddonPageHostProps, type PageChromeStore } from './addon-page-host'
import {
    FederatedErrorBoundary,
    type FederatedErrorBoundaryProps,
    type FederatedErrorInfo,
} from './federated-error-boundary'

export interface AddonPageLoaderProps {
    /** Federation container name (`metacore_shipping`). */
    scope: string
    /** remoteEntry.js URL (may carry the `?v=` cache-bust). */
    url: string
    /** `manifest.frontend.integrity`. */
    integrity?: string
    /** Addon key (incidents, data attributes). */
    addonKey: string
    /** The manifest page being mounted. */
    page: FrontendPage
    /** Absolute mount path (`pageMountPath(addonKey, page, frontend.layout)`). */
    basePath: string
    host: AddonHostContext
    api: HostApi
    location: AddonPageHostProps['location']
    navigate: AddonPageHostProps['navigate']
    chrome?: PageChromeStore
    /** Extra route params the host router extracted. */
    params?: Record<string, string>
    /** Shown while the remote downloads (default: page skeleton). */
    fallback?: ReactNode
    /** Abort the load after this many ms (default 10 000; 0 disables). */
    timeoutMs?: number
    /** Load failure or render crash, for telemetry (reportFrontendIncident). */
    onError?: (error: Error, info: FederatedErrorInfo & { phase: 'load' | 'render' }) => void
    /** Override the error UI (load and render). */
    errorFallback?: FederatedErrorBoundaryProps['fallback']
    errorStrings?: FederatedErrorBoundaryProps['strings']
}

type LoadState =
    | { status: 'loading' }
    | { status: 'ready'; Page: ComponentType<AddonPageProps> }
    | { status: 'error'; error: Error }

/** Page-sized skeleton: header line + content block, fixed heights (no layout shift). */
export function AddonPageSkeleton() {
    return (
        <div aria-busy="true" data-testid="addon-page-skeleton" className="flex flex-col gap-4 p-4">
            <div className="h-7 w-56 animate-pulse rounded-md bg-muted" />
            <div className="h-[60vh] w-full animate-pulse rounded-lg bg-muted/70" />
        </div>
    )
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
    if (!ms) return p
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`metacore: ${what} did not load within ${ms} ms`)), ms)
        p.then(
            (v) => {
                clearTimeout(t)
                resolve(v)
            },
            (e) => {
                clearTimeout(t)
                reject(e)
            },
        )
    })
}

export function AddonPageLoader({
    scope,
    url,
    integrity,
    addonKey,
    page,
    basePath,
    host,
    api,
    location,
    navigate,
    chrome,
    params,
    fallback,
    timeoutMs = 10_000,
    onError,
    errorFallback,
    errorStrings,
}: AddonPageLoaderProps) {
    const [state, setState] = useState<LoadState>({ status: 'loading' })
    const [attempt, setAttempt] = useState(0)

    useEffect(() => {
        let cancelled = false
        setState({ status: 'loading' })
        withTimeout(
            loadFederatedModule(scope, url, page.expose, integrity),
            timeoutMs,
            `page "${page.expose}" of ${addonKey}`,
        )
            .then((mod) => {
                if (cancelled) return
                setState({ status: 'ready', Page: resolvePageModule(mod, page.expose) })
            })
            .catch((e: unknown) => {
                if (cancelled) return
                const error = e instanceof Error ? e : new Error(String(e))
                setState({ status: 'error', error })
                onError?.(error, { addonKey, expose: page.expose, phase: 'load' })
            })
        return () => {
            cancelled = true
        }
        // onError identity is not part of the fiber identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope, url, page.expose, integrity, addonKey, timeoutMs, attempt])

    const retry = () => {
        setState({ status: 'loading' })
        setAttempt((n) => n + 1)
    }
    const subpath = addonSubpath(basePath, location.pathname)

    let body: ReactNode
    if (state.status === 'loading') {
        body = fallback ?? <AddonPageSkeleton />
    } else if (state.status === 'error') {
        // Reuse the boundary's UI for load failures so both look the same.
        body = (
            <FederatedErrorBoundary
                addonKey={addonKey}
                expose={page.expose}
                fallback={errorFallback}
                strings={errorStrings}
                onReset={retry}
            >
                <ThrowError error={state.error} />
            </FederatedErrorBoundary>
        )
    } else {
        const { Page } = state
        body = (
            <FederatedErrorBoundary
                addonKey={addonKey}
                expose={page.expose}
                resetKeys={[url, page.expose]}
                fallback={errorFallback}
                strings={errorStrings}
                onError={(error, info) => onError?.(error, { ...info, phase: 'render' })}
            >
                <Page host={host} basePath={basePath} params={{ ...params, '*': subpath }} page={page} />
            </FederatedErrorBoundary>
        )
    }

    return (
        <div
            data-addon-page={`${addonKey}:${page.key}`}
            className="relative min-h-0 w-full"
            style={{ contain: 'layout paint', isolation: 'isolate' }}
        >
            <AddonPageHost
                host={host}
                api={api}
                basePath={basePath}
                location={location}
                navigate={navigate}
                chrome={chrome}
            >
                {body}
            </AddonPageHost>
        </div>
    )
}

// Throws the load error during render so the boundary paints it; the
// boundary's retry (onReset) re-runs the load, not only the render.
function ThrowError({ error }: { error: Error }): null {
    throw error
}

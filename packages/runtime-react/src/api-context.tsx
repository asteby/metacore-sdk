// ApiContext — the host injects its HTTP client (axios-like interface) so
// runtime-react components (DynamicTable, dialogs, action dispatcher) can
// talk to the backend without a bundler alias to `@/lib/api`. Hosts wrap
// their app in <ApiProvider value={axiosInstance}> once at the root.
import React, { createContext, useContext, useEffect, useMemo } from 'react'
import { batchGet, invalidateQueryBatchData } from './query-batch'
import { invalidateOptionsCache } from './use-options-resolver'

/** Minimal axios-compatible client shape consumed by runtime-react. */
export interface ApiClient {
    get: (url: string, config?: any) => Promise<{ data: any; headers?: any }>
    post: (url: string, body?: any, config?: any) => Promise<{ data: any; headers?: any }>
    put: (url: string, body?: any, config?: any) => Promise<{ data: any; headers?: any }>
    delete: (url: string, config?: any) => Promise<{ data: any; headers?: any }>
}

const ApiContext = createContext<ApiClient | null>(null)

export interface ApiProviderProps {
    client: ApiClient
    children: React.ReactNode
}

export function ApiProvider({ client, children }: ApiProviderProps) {
    // Hosts also write through their own client (native dialogs, settings
    // screens) without going through useApi(). When the client is axios,
    // every non-GET response drops what the runtime remembered as well.
    useEffect(() => {
        const interceptors = (client as AxiosLike).interceptors?.response
        if (!interceptors?.use) return
        const onSettled = (config: { method?: string; url?: string } | undefined) => {
            if (isWrite(config?.method, config?.url)) forgetRemembered()
        }
        const id = interceptors.use(
            (res: any) => {
                onSettled(res?.config)
                return res
            },
            (err: any) => {
                onSettled(err?.config)
                return Promise.reject(err)
            },
        )
        return () => interceptors.eject?.(id)
    }, [client])
    return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>
}

interface AxiosLike {
    interceptors?: {
        response?: {
            use?: (onFulfilled: (res: any) => any, onRejected: (err: any) => any) => number
            eject?: (id: number) => void
        }
    }
}

// POSTs that do not change any record a list or picker shows: the read batch
// (/q) and the bell inbox the host writes on every control toast
// (/notifications/me). Counting them as writes dropped the caches on each read
// or toast.
const NOT_A_RECORD_WRITE = [/(^|\/)q\/?(\?|$)/, /(^|\/)notifications\/me\/?(\?|$)/]

function isWrite(method: string | undefined, url: string | undefined): boolean {
    const m = (method ?? '').toLowerCase()
    if (m === '' || m === 'get' || m === 'head' || m === 'options') return false
    const u = url ?? ''
    return !NOT_A_RECORD_WRITE.some((re) => re.test(u))
}

/** Drops the batch rows and the picker options the runtime remembered. */
function forgetRemembered(): void {
    invalidateQueryBatchData()
    invalidateOptionsCache()
}

function mutating<T>(request: Promise<T>): Promise<T> {
    forgetRemembered()
    return request.finally(forgetRemembered)
}

/** Returns the host-injected api client. Throws if no <ApiProvider> is mounted. */
export function useApi(): ApiClient {
    const ctx = useContext(ApiContext)
    if (!ctx) {
        throw new Error('useApi() requires an <ApiProvider> ancestor. Hosts must inject an axios-like client via runtime-react ApiProvider.')
    }
    // List, metadata and options GETs share one POST /api/q. Mutations stay
    // on the host client and, settled either way, drop the rows the batch
    // remembered, so the refresh after a save reads the saved row. The
    // wrapper is stable while the host client is.
    return useMemo<ApiClient>(() => ({
        get: (url, config) => batchGet(ctx, url, config),
        post: (url, body, config) =>
            isWrite('post', url) ? mutating(ctx.post(url, body, config)) : ctx.post(url, body, config),
        put: (url, body, config) => mutating(ctx.put(url, body, config)),
        delete: (url, config) => mutating(ctx.delete(url, config)),
    }), [ctx])
}

/** Optional branch context — hosts that support tenant branches can supply
 *  a `currentBranch` so DynamicTable resets pagination/selection on branch
 *  switches. Hosts without branches can omit this provider entirely. */
export interface BranchState {
    id: string | number | null | undefined
}

const BranchContext = createContext<BranchState>({ id: undefined })

export interface BranchProviderProps {
    branch: BranchState
    children: React.ReactNode
}

export function BranchProvider({ branch, children }: BranchProviderProps) {
    return <BranchContext.Provider value={branch}>{children}</BranchContext.Provider>
}

export function useCurrentBranch(): BranchState {
    return useContext(BranchContext)
}

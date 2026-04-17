// ApiContext — the host injects its HTTP client (axios-like interface) so
// runtime-react components (DynamicTable, dialogs, action dispatcher) can
// talk to the backend without a bundler alias to `@/lib/api`. Hosts wrap
// their app in <ApiProvider value={axiosInstance}> once at the root.
import React, { createContext, useContext } from 'react'

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
    return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>
}

/** Returns the host-injected api client. Throws if no <ApiProvider> is mounted. */
export function useApi(): ApiClient {
    const ctx = useContext(ApiContext)
    if (!ctx) {
        throw new Error('useApi() requires an <ApiProvider> ancestor. Hosts must inject an axios-like client via runtime-react ApiProvider.')
    }
    return ctx
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

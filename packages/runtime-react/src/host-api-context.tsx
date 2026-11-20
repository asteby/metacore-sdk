// HostApiProvider — hands the host-built HostApi to federated surfaces that
// mount OUTSIDE <AddonPageHost> (action modals, record pickers, widgets).
// Pages already get it from <AddonPageHost api=…>; both resolve through
// useHostApi() / useHostApiClient().
import { createContext, type ReactNode } from 'react'
import type { HostApi } from '@asteby/metacore-sdk'

export const HostApiContext = createContext<HostApi | null>(null)

export interface HostApiProviderProps {
    /** `createHostApi(hostAxios)` — the host owns baseURL, credentials and headers. */
    api: HostApi
    children: ReactNode
}

export function HostApiProvider({ api, children }: HostApiProviderProps) {
    return <HostApiContext.Provider value={api}>{children}</HostApiContext.Provider>
}

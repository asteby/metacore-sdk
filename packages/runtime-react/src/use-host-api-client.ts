import { useMemo } from 'react'
import { useHostApi } from './addon-page-host'
import { createHostApiClient, type HostApiClient } from './host-api-client'

/**
 * The addon's HTTP client, built over the host-injected HostApi. Works inside
 * <AddonPageHost> (pages) and <HostApiProvider> (modals, pickers). Without a
 * host it throws a clear error: there is no localStorage / fetch fallback.
 */
export function useHostApiClient(): HostApiClient {
    const api = useHostApi()
    return useMemo(() => createHostApiClient(api), [api])
}

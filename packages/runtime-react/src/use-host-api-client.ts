import { useMemo } from 'react'
import { useHostApi } from './addon-page-host'
import { createHostApiClient, type HostApiClient, type HostApiClientOptions } from './host-api-client'

/**
 * The addon's HTTP client, built over the host-injected HostApi. Works inside
 * <AddonPageHost> (pages) and <HostApiProvider> (modals, pickers). Without a
 * host it throws a clear error: there is no localStorage / fetch fallback.
 */
export function useHostApiClient(options?: HostApiClientOptions): HostApiClient {
    const api = useHostApi()
    const key = options?.defaultHeaders ? JSON.stringify(options.defaultHeaders) : ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(() => createHostApiClient(api, options), [api, key])
}

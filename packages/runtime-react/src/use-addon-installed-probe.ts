// useAddonInstalledProbe — "is addon X installed here?" for hosts/addons that do
// NOT mount an <InstalledAddonsProvider>: asks the installation API
// (`GET /addons/:key/settings`, the same call everyone used to hand-roll).
// With a provider present it answers from it and never touches the network.
//   installed: true  → 2xx
//              false → 404 (not installed) or the provider says no
//              undefined → still loading, or unknown (403/network error: never "absent")
import { useQuery } from '@tanstack/react-query'
import { useApi } from './api-context'
import { addonSettingsUrl } from './use-addon-settings'
import { useInstalledAddons } from './installed-addons-context'

export interface UseAddonInstalledProbeResult {
    installed: boolean | undefined
    isLoading: boolean
}

export function useAddonInstalledProbe(addonKey: string, opts: { enabled?: boolean } = {}): UseAddonInstalledProbeResult {
    const api = useApi()
    const ctx = useInstalledAddons()
    const query = useQuery<boolean | undefined>({
        queryKey: ['addon-installed', addonKey],
        queryFn: async () => {
            try {
                await api.get(addonSettingsUrl(addonKey))
                return true
            } catch (e) {
                const status = (e as { response?: { status?: number } })?.response?.status
                if (status === 404) return false
                throw e
            }
        },
        retry: false,
        staleTime: 60_000,
        enabled: !ctx && (opts.enabled ?? true) && !!addonKey,
    })
    if (ctx) return { installed: ctx.addons.has(addonKey), isLoading: false }
    return { installed: query.data, isLoading: query.isLoading }
}

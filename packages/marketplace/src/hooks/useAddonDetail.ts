/**
 * `useAddonDetail` — full addon page from the Hub. Includes README,
 * screenshots, and the version list.
 */
import { useQuery } from '@tanstack/react-query'
import type { AddonDetail } from '../client/types'
import { useMarketplace } from '../providers/MarketplaceProvider'
import { marketplaceKeys } from './keys'

export interface UseAddonDetailOptions {
  /** Disable the query (e.g. before the user has selected an addon). */
  enabled?: boolean
  staleTime?: number
}

export function useAddonDetail(
  key: string | null | undefined,
  options: UseAddonDetailOptions = {},
) {
  const { hub } = useMarketplace()
  return useQuery<AddonDetail>({
    queryKey: marketplaceKeys.addon(key ?? ''),
    queryFn: () => {
      if (!key) throw new Error('useAddonDetail: key is required')
      return hub.getAddon(key)
    },
    enabled: (options.enabled ?? true) && Boolean(key),
    staleTime: options.staleTime ?? 60_000,
  })
}

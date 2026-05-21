/**
 * `useInstalledAddons` — list of installations from the local kernel.
 */
import { useQuery } from '@tanstack/react-query'
import type { Installation } from '../client/types'
import { useMarketplace } from '../providers/MarketplaceProvider'
import { marketplaceKeys } from './keys'

export interface UseInstalledAddonsOptions {
  enabled?: boolean
  refetchInterval?: number
  staleTime?: number
}

export function useInstalledAddons(options: UseInstalledAddonsOptions = {}) {
  const { ops } = useMarketplace()
  return useQuery<Installation[]>({
    queryKey: marketplaceKeys.installed(),
    queryFn: () => ops.listInstalled(),
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval,
    // Installations can transition through `installing`/`upgrading` so a
    // short stale window keeps the UI honest. 15s mirrors what the kernel
    // takes for the slowest install path.
    staleTime: options.staleTime ?? 15_000,
  })
}

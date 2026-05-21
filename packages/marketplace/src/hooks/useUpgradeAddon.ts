/**
 * `useUpgradeAddon` — mutation that upgrades an installed addon. The
 * caller is responsible for resolving `accepted_capabilities` (typically
 * by diffing the current vs next manifests via `diffPermissions()` and
 * letting the user accept).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Capability, Installation } from '../client/types'
import { useMarketplace } from '../providers/MarketplaceProvider'
import { marketplaceKeys } from './keys'

export interface UpgradeAddonInput {
  key: string
  target_version: string
  accepted_capabilities: Capability[]
}

export function useUpgradeAddon() {
  const { ops } = useMarketplace()
  const qc = useQueryClient()
  return useMutation<Installation, Error, UpgradeAddonInput>({
    mutationFn: ({ key, target_version, accepted_capabilities }) =>
      ops.upgrade(key, { target_version, accepted_capabilities }),
    onSuccess: (_inst, vars) => {
      qc.invalidateQueries({ queryKey: marketplaceKeys.installed() })
      qc.invalidateQueries({ queryKey: marketplaceKeys.installation(vars.key) })
    },
  })
}

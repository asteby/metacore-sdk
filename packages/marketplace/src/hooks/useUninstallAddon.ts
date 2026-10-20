/**
 * `useUninstallAddon` — mutation against the Ops kernel that removes the
 * addon for the current organization.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMarketplace } from '../providers/MarketplaceProvider'
import { marketplaceKeys } from './keys'
import { invalidateAddon } from './invalidate'

export function useUninstallAddon() {
  const { ops } = useMarketplace()
  const qc = useQueryClient()
  return useMutation<void, Error, { key: string }>({
    mutationFn: ({ key }) => ops.uninstall(key),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: marketplaceKeys.installed() })
      qc.invalidateQueries({ queryKey: marketplaceKeys.installation(vars.key) })
      // Navigation, manifests, permissions, metadata and the addon's own data
      // all change with it: refresh them too, not just the marketplace slice.
      void invalidateAddon(qc, vars.key)
    },
  })
}

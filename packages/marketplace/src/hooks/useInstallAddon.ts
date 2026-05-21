/**
 * `useInstallAddon` — the full install mutation: Hub `initiateInstall`
 * then Ops `claimInstall`. Exposed as a single `mutate({key, version,
 * context})` so consumers don't have to choreograph the two-step dance.
 *
 * The hook deliberately does NOT prompt for consent — the UI layer
 * (InstallConfirmModal) is responsible for showing the permissions diff
 * and only calling `mutate` once the user has accepted. That separation
 * keeps the hook headless and the consent UX swappable.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Installation } from '../client/types'
import { useMarketplace } from '../providers/MarketplaceProvider'
import { marketplaceKeys } from './keys'

export interface InstallAddonInput {
  /** Addon key. */
  key: string
  /** Optional pinned version — defaults to latest on the Hub side. */
  version?: string
  /** Echoed back to the kernel for environment tagging. */
  context?: Record<string, string>
}

export function useInstallAddon() {
  const { hub, ops, organizationId } = useMarketplace()
  const qc = useQueryClient()

  return useMutation<Installation, Error, InstallAddonInput>({
    mutationFn: async ({ key, version, context }) => {
      // Step 1: ask the Hub to mint a token — the Hub does the auth +
      // billing checks here.
      const token = await hub.initiateInstall(key, {
        version,
        organization_id: organizationId,
        context,
      })
      // Step 2: redeem the token against the local kernel, which does
      // the actual download + lifecycle execution.
      return ops.claimInstall({ token: token.token })
    },
    onSuccess: (_installation, vars) => {
      qc.invalidateQueries({ queryKey: marketplaceKeys.installed() })
      qc.invalidateQueries({ queryKey: marketplaceKeys.installation(vars.key) })
    },
  })
}

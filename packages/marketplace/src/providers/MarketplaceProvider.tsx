/**
 * MarketplaceProvider — single context the rest of the package reads from.
 *
 * Why a context (and not "just pass the client into every hook")?
 *
 *   - Apps wire the Hub and Ops clients exactly once at the root and the
 *     rest of the tree can call `useMarketplace()` to get them. Mirrors
 *     the pattern in `@asteby/metacore-app-providers` (where every other
 *     provider lives).
 *   - Storybook + tests can swap the provider for a mock without touching
 *     consumer code.
 *
 * The provider itself is intentionally tiny — it just stashes the two
 * clients + a label bag (i18n strings) and exposes them via
 * `useMarketplace()`. State (catalog, installed addons, mutations) lives
 * in TanStack Query keyed off the clients.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { HubClient } from '../client/hub-client'
import type { OpsClient } from '../client/ops-client'

/** Strings the marketplace UI surfaces. Hosts pass their i18n bundle. */
export interface MarketplaceLabels {
  catalogTitle: string
  catalogSearchPlaceholder: string
  catalogEmpty: string
  catalogLoading: string
  installButton: string
  installInProgress: string
  installSuccess: string
  installFailure: string
  uninstallButton: string
  uninstallConfirm: string
  upgradeButton: string
  upgradeAvailable: (version: string) => string
  permissionsTitle: string
  permissionsNone: string
  permissionsConsentRequired: string
  versionsTitle: string
  screenshotsTitle: string
  readmeTitle: string
  cancel: string
  confirm: string
}

/** English defaults — every string is overridable via the provider prop. */
export const DEFAULT_LABELS: MarketplaceLabels = {
  catalogTitle: 'Marketplace',
  catalogSearchPlaceholder: 'Search addons…',
  catalogEmpty: 'No addons match your filters.',
  catalogLoading: 'Loading catalog…',
  installButton: 'Install',
  installInProgress: 'Installing…',
  installSuccess: 'Installed.',
  installFailure: 'Install failed.',
  uninstallButton: 'Uninstall',
  uninstallConfirm: 'Are you sure you want to uninstall this addon?',
  upgradeButton: 'Upgrade',
  upgradeAvailable: (version) => `Upgrade available: ${version}`,
  permissionsTitle: 'Permissions requested',
  permissionsNone: 'This addon requests no permissions.',
  permissionsConsentRequired:
    'This upgrade changes the permissions this addon needs. Review and approve to continue.',
  versionsTitle: 'Versions',
  screenshotsTitle: 'Screenshots',
  readmeTitle: 'About',
  cancel: 'Cancel',
  confirm: 'Confirm',
}

/** Context value exposed by `useMarketplace()`. */
export interface MarketplaceContextValue {
  hub: HubClient
  ops: OpsClient
  labels: MarketplaceLabels
  /** Organization id surfaced by the host — needed for install calls. */
  organizationId: string
}

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null)

/** Props for the provider. */
export interface MarketplaceProviderProps {
  hub: HubClient
  ops: OpsClient
  /** Caller's organization id. Required — install requests carry it. */
  organizationId: string
  /** Optional partial label overrides. Missing keys fall back to defaults. */
  labels?: Partial<MarketplaceLabels>
  children: ReactNode
}

export function MarketplaceProvider({
  hub,
  ops,
  organizationId,
  labels,
  children,
}: MarketplaceProviderProps) {
  const value = useMemo<MarketplaceContextValue>(
    () => ({
      hub,
      ops,
      organizationId,
      labels: { ...DEFAULT_LABELS, ...(labels ?? {}) },
    }),
    [hub, ops, organizationId, labels],
  )
  return (
    <MarketplaceContext.Provider value={value}>
      {children}
    </MarketplaceContext.Provider>
  )
}

/**
 * Read the marketplace context. Throws if called outside a
 * `<MarketplaceProvider>` so consumers get a clear error during wiring
 * instead of mysterious nulls down the tree.
 */
export function useMarketplace(): MarketplaceContextValue {
  const ctx = useContext(MarketplaceContext)
  if (!ctx) {
    throw new Error(
      'useMarketplace must be called inside <MarketplaceProvider>. ' +
        'Wrap your app root with the provider and pass `hub`, `ops`, ' +
        'and `organizationId`.',
    )
  }
  return ctx
}

/**
 * Lower-overhead variant for components that only need the labels (no
 * client access). Skips the throw so labels can render under storybook
 * fixtures that don't construct a full provider.
 */
export function useMarketplaceLabels(): MarketplaceLabels {
  const ctx = useContext(MarketplaceContext)
  return ctx?.labels ?? DEFAULT_LABELS
}

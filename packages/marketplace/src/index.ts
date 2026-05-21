// Public surface of `@asteby/metacore-marketplace`.
//
// Prefer the subpath imports (./client, ./hooks, ./components,
// ./providers) when bundling — they tree-shake cleanly. The root barrel
// is for ergonomic prototype wiring (`import { MarketplaceProvider } from
// '@asteby/metacore-marketplace'`).

// --- client ---
export {
  HubClient,
  createHubClient,
  OpsClient,
  createOpsClient,
  createFetchFetcher,
  unwrapEnvelope,
  toQueryString,
  normalizeManifest,
  diffPermissions,
  diffRequiresConsent,
  capabilityId,
} from './client'
export type {
  AddonDetail,
  AddonScreenshot,
  AddonSummary,
  AddonVersion,
  AddonVisibility,
  Capability,
  CapabilityKind,
  CatalogPage,
  CatalogQuery,
  ClaimInstallInput,
  CreateFetchFetcherOptions,
  HubClientOptions,
  InitiateInstallInput,
  Installation,
  InstallationStatus,
  InstallToken,
  Manifest,
  ManifestApiVersion,
  ManifestIdentity,
  ManifestV2,
  ManifestV3,
  MarketplaceFetcher,
  OpsClientOptions,
  Permission,
  PermissionChange,
  PermissionDiffRow,
  QueryParams,
  RawManifest,
  UpgradeInput,
} from './client'

// --- hooks ---
export {
  marketplaceKeys,
  useCatalog,
  useAddonDetail,
  useInstalledAddons,
  useInstallAddon,
  useUninstallAddon,
  useUpgradeAddon,
} from './hooks'
export type {
  InstallAddonInput,
  UpgradeAddonInput,
  UseAddonDetailOptions,
  UseCatalogOptions,
  UseInstalledAddonsOptions,
} from './hooks'

// --- providers ---
export {
  MarketplaceProvider,
  useMarketplace,
  useMarketplaceLabels,
  DEFAULT_LABELS,
} from './providers'
export type {
  MarketplaceContextValue,
  MarketplaceLabels,
  MarketplaceProviderProps,
} from './providers'

// --- components ---
export {
  AddonCard,
  AddonDetailPanel,
  InstallConfirmModal,
  InstalledAddonsList,
  MarketplaceCatalog,
  PermissionsDiff,
  cn,
} from './components'
export type {
  AddonCardProps,
  AddonDetailPanelProps,
  InstallConfirmModalProps,
  InstalledAddonsListProps,
  MarketplaceCatalogProps,
  PermissionsDiffProps,
} from './components'

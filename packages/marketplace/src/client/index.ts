// Public surface of `@asteby/metacore-marketplace/client`. Re-exports the
// transport, the two clients (HubClient + OpsClient), and the manifest
// normalization helpers.

export type {
  MarketplaceFetcher,
  CreateFetchFetcherOptions,
  QueryParams,
} from './fetcher'
export { createFetchFetcher, unwrapEnvelope, toQueryString } from './fetcher'

export { HubClient, createHubClient } from './hub-client'
export type { HubClientOptions } from './hub-client'

export { OpsClient, createOpsClient } from './ops-client'
export type { OpsClientOptions } from './ops-client'

export {
  normalizeManifest,
  diffPermissions,
  diffRequiresConsent,
  capabilityId,
} from './manifest'

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
  InitiateInstallInput,
  Installation,
  InstallationStatus,
  InstallToken,
  Manifest,
  ManifestApiVersion,
  ManifestIdentity,
  ManifestV2,
  ManifestV3,
  Permission,
  PermissionChange,
  PermissionDiffRow,
  RawManifest,
  UpgradeInput,
} from './types'

---
'@asteby/metacore-marketplace': minor
---

Initial release of `@asteby/metacore-marketplace`.

Adds a transport-agnostic marketplace SDK with two clients (`HubClient`
for the public catalog and install initiation, `OpsClient` for the local
kernel lifecycle), React Query hooks (`useCatalog`, `useAddonDetail`,
`useInstalledAddons`, `useInstallAddon` chained two-step,
`useUninstallAddon`, `useUpgradeAddon`), and headless UI primitives
(`MarketplaceCatalog`, `AddonCard`, `AddonDetailPanel`,
`InstallConfirmModal`, `InstalledAddonsList`, `PermissionsDiff`).

Supports both manifest v2 and v3 wire shapes — `normalizeManifest()`
collapses them into a single permissions list and `diffPermissions()` +
`diffRequiresConsent()` drive the upgrade consent prompt.

Consumers wire `MarketplaceProvider` once at the app root (hub client,
ops client, organization id, optional labels) — same pattern as
`@asteby/metacore-app-providers`.

# @asteby/metacore-marketplace

## 11.0.0

### Patch Changes

- Updated dependencies [acb5dcc]
  - @asteby/metacore-app-providers@17.1.0

## 10.0.0

### Patch Changes

- @asteby/metacore-app-providers@17.0.0

## 9.0.0

### Patch Changes

- @asteby/metacore-app-providers@16.0.0

## 8.0.0

### Patch Changes

- @asteby/metacore-app-providers@15.0.0

## 7.0.0

### Patch Changes

- @asteby/metacore-app-providers@14.0.0

## 6.0.0

### Patch Changes

- @asteby/metacore-app-providers@13.0.0

## 5.0.0

### Patch Changes

- @asteby/metacore-app-providers@12.0.0

## 4.0.0

### Patch Changes

- @asteby/metacore-app-providers@11.0.0

## 3.0.0

### Patch Changes

- @asteby/metacore-app-providers@10.0.0

## 2.0.0

### Patch Changes

- @asteby/metacore-app-providers@9.0.0

## 1.0.1

### Patch Changes

- 8dc21ba: fix(marketplace): align `HubClient.initiateInstall` with the real hub contract.

  The hub exposes `POST /v1/install/initiate` (not `POST /marketplace/addons/{key}/install`). The wire body is `{ addonKey, version?, instance_id? }` and the response is `{ install_token, expires_in, verification_url, addon_key, version }`. Previously every consumer of the SDK was hitting a 404. `HubClient.initiateInstall` now posts to the correct path with the correct body and normalises the response back into the existing `InstallToken` shape (with `expires_at` resolved to an absolute ISO timestamp + a new `verification_url` field).

  `InitiateInstallInput` drops `organization_id` and `context` (the hub takes tenant attribution from the user JWT, not the body) and adds an optional `instance_id`. `useInstallAddon` and the test stubs are updated accordingly. A new `installPath` option lets hosts behind a path-rewriting proxy override the install endpoint location.

## 1.0.0

### Minor Changes

- 6661a79: Initial release of `@asteby/metacore-marketplace`.

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

### Patch Changes

- @asteby/metacore-app-providers@8.0.0

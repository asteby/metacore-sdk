# @asteby/metacore-marketplace

## 60.0.0

### Patch Changes

- @asteby/metacore-app-providers@64.0.0

## 59.0.0

### Patch Changes

- @asteby/metacore-app-providers@63.0.0

## 58.0.0

### Patch Changes

- @asteby/metacore-app-providers@62.0.0

## 57.0.0

### Patch Changes

- @asteby/metacore-app-providers@61.0.0

## 56.0.0

### Patch Changes

- @asteby/metacore-app-providers@60.0.0

## 55.0.0

### Patch Changes

- @asteby/metacore-app-providers@59.0.0

## 54.0.0

### Patch Changes

- @asteby/metacore-app-providers@58.0.0

## 53.0.0

### Patch Changes

- @asteby/metacore-app-providers@57.0.0

## 52.0.0

### Patch Changes

- @asteby/metacore-app-providers@56.0.0

## 51.0.0

### Patch Changes

- @asteby/metacore-app-providers@55.0.0

## 50.0.0

### Patch Changes

- @asteby/metacore-app-providers@54.0.0

## 49.0.0

### Patch Changes

- @asteby/metacore-app-providers@53.0.0

## 48.0.0

### Patch Changes

- @asteby/metacore-app-providers@52.0.0

## 47.0.0

### Patch Changes

- @asteby/metacore-app-providers@51.0.0

## 46.0.0

### Patch Changes

- @asteby/metacore-app-providers@50.0.0

## 45.0.0

### Patch Changes

- @asteby/metacore-app-providers@49.0.0

## 44.0.0

### Patch Changes

- @asteby/metacore-app-providers@48.0.0

## 43.0.0

### Patch Changes

- @asteby/metacore-app-providers@47.0.0

## 42.0.0

### Patch Changes

- @asteby/metacore-app-providers@46.0.0

## 41.0.0

### Patch Changes

- @asteby/metacore-app-providers@45.0.0

## 40.0.0

### Patch Changes

- @asteby/metacore-app-providers@44.0.0

## 39.0.0

### Patch Changes

- @asteby/metacore-app-providers@43.0.0

## 38.0.0

### Patch Changes

- @asteby/metacore-app-providers@42.0.0

## 37.0.0

### Patch Changes

- @asteby/metacore-app-providers@41.0.0

## 36.0.0

### Patch Changes

- @asteby/metacore-app-providers@40.0.0

## 35.0.0

### Patch Changes

- @asteby/metacore-app-providers@39.0.0

## 34.0.0

### Patch Changes

- @asteby/metacore-app-providers@38.0.0

## 33.0.0

### Patch Changes

- @asteby/metacore-app-providers@37.0.0

## 32.0.0

### Patch Changes

- @asteby/metacore-app-providers@36.0.0

## 31.0.0

### Patch Changes

- @asteby/metacore-app-providers@35.0.0

## 30.0.0

### Patch Changes

- @asteby/metacore-app-providers@34.0.0

## 29.0.0

### Patch Changes

- @asteby/metacore-app-providers@33.0.0

## 28.0.0

### Patch Changes

- @asteby/metacore-app-providers@32.0.0

## 27.0.0

### Patch Changes

- @asteby/metacore-app-providers@31.0.0

## 26.0.0

### Patch Changes

- @asteby/metacore-app-providers@30.0.0

## 25.0.0

### Patch Changes

- @asteby/metacore-app-providers@29.0.0

## 24.0.0

### Patch Changes

- @asteby/metacore-app-providers@28.0.0

## 23.0.0

### Patch Changes

- @asteby/metacore-app-providers@27.0.0

## 22.0.0

### Patch Changes

- @asteby/metacore-app-providers@26.0.0

## 21.0.0

### Patch Changes

- @asteby/metacore-app-providers@25.0.0

## 20.0.0

### Patch Changes

- @asteby/metacore-app-providers@24.0.0

## 19.0.0

### Patch Changes

- @asteby/metacore-app-providers@23.0.0

## 18.0.0

### Patch Changes

- @asteby/metacore-app-providers@22.0.0

## 17.0.0

### Patch Changes

- @asteby/metacore-app-providers@21.0.0

## 16.0.0

### Patch Changes

- @asteby/metacore-app-providers@20.0.0

## 15.0.0

### Patch Changes

- Updated dependencies [da8139d]
  - @asteby/metacore-app-providers@19.0.0

## 14.0.0

### Patch Changes

- @asteby/metacore-app-providers@18.0.0

## 13.0.0

### Patch Changes

- Updated dependencies [08eaed4]
  - @asteby/metacore-app-providers@17.3.0

## 12.0.0

### Patch Changes

- Updated dependencies [32dce51]
  - @asteby/metacore-app-providers@17.2.0

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

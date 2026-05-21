# @asteby/metacore-marketplace

Marketplace SDK for the metacore ecosystem — a transport-agnostic Hub
catalog + local Ops kernel client, React Query hooks, and headless UI
primitives shared by every host app (Ops, link, future apps).

## What's in the box

```
src/
  client/       # HubClient (catalog + install initiation)
                # OpsClient (install/upgrade/uninstall against local kernel)
                # types + manifest normalization (v2 ⇆ v3) + diff helpers
  hooks/        # React Query wrappers: useCatalog, useAddonDetail,
                # useInstalledAddons, useInstallAddon (chained 2-step),
                # useUninstallAddon, useUpgradeAddon
  components/   # MarketplaceCatalog, AddonCard, AddonDetailPanel,
                # InstallConfirmModal, InstalledAddonsList, PermissionsDiff
  providers/    # MarketplaceProvider (wires hub + ops + labels into context)
```

## Quickstart

```tsx
import {
  MarketplaceProvider,
  createHubClient,
  createOpsClient,
  createFetchFetcher,
  MarketplaceCatalog,
} from '@asteby/metacore-marketplace'

const hubFetcher = createFetchFetcher({
  baseUrl: 'https://hub.metacore.dev',
  headers: () => ({ authorization: `Bearer ${getHubToken()}` }),
})

const opsFetcher = createFetchFetcher({
  baseUrl: '/api', // your own ops/link API base
  headers: () => ({ authorization: `Bearer ${getAccessToken()}` }),
})

const hub = createHubClient({ fetcher: hubFetcher })
const ops = createOpsClient({ fetcher: opsFetcher })

export function MarketplacePage() {
  return (
    <MarketplaceProvider hub={hub} ops={ops} organizationId={currentOrgId}>
      <MarketplaceCatalog onSelectAddon={(a) => navigate(`/marketplace/${a.key}`)} />
    </MarketplaceProvider>
  )
}
```

## Provider pattern

Mirrors `@asteby/metacore-app-providers` — the consumer wires transport
once at the app root and every hook/component reads from context. The
package itself ships zero global state.

- `hub`: catalog reader + install initiator (talks to the public Hub).
- `ops`: lifecycle writer (talks to the host's local kernel).
- `organizationId`: required — install requests carry it.
- `labels`: optional i18n overrides.

## Manifest v2 + v3

The marketplace already has two manifest shapes in production. This
package exposes:

- `RawManifest` (`ManifestV2 | ManifestV3`) — discriminated union as the
  Hub returns it.
- `Manifest` — normalized shape: `capabilities + permissions` collapsed
  into one ordered, de-duplicated list, with the original `raw` payload
  preserved.

Use `normalizeManifest()` once per version you display; pass the result
to `PermissionsDiff` and `InstallConfirmModal`. The hooks accept
normalized manifests directly.

## Consent rule

Per the kernel security policy, any capability addition or modification
between versions REQUIRES a re-consent prompt on upgrade. The helper
`diffRequiresConsent(diffPermissions(current, next))` returns `true` when
that's the case — `InstallConfirmModal` already uses it internally.

## Tailwind v4 wiring

Following the SDK rule for `@source` declarations
([reference](../../docs)), consumers MUST include this package's source
in their main CSS file so the utility classes used by the components
land in the bundle:

```css
/* app.css */
@import 'tailwindcss';
@source "../../node_modules/@asteby/metacore-marketplace/dist";
```

Skip this and your `MarketplaceCatalog` will render unstyled.

## Peer dependencies

- `react >= 18`
- `react-dom >= 18`
- `@tanstack/react-query >= 5`
- `@asteby/metacore-app-providers ^7` (optional — only if you want the
  `PlatformConfigProvider` brand variables to drive marketplace colors)

The components use plain Tailwind classes plus the CSS variables shipped
by `@asteby/metacore-app-providers` (`--primary`, `--background`,
`--border`, …). They do NOT pull `@asteby/metacore-ui` so any host that
prefers a different design system can still use the catalog without
extra deps.

## Consumers (planned)

- **Ops** — `/marketplace` browse + install for org admins.
- **link** — `/integrations` shows kernel-installed addons alongside the
  flow-runtime tools registry.
- **Pitsline preset UI** — pre-curated bundle install via this package's
  primitives (next step).

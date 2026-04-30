# @asteby/metacore-app-providers

Generic, reusable React providers for metacore host applications. One
package wires the cross-cutting concerns every metacore app shares —
direction, font, layout, search, platform branding — plus the optional
"full kit" `<MetacoreAppShell>` that bundles API + PWA + toaster in a
single tag.

## Stability

Stable as of v1.0. The exports below follow semver. Persistence keys
(cookie names, localStorage keys) and provider context shapes will not
change inside the major. Optional peer integrations (`@asteby/metacore-pwa`,
`@asteby/metacore-runtime-react`, `@asteby/metacore-ui`, `sonner`) move
on their own cadence — the shell tolerates compatible versions via the
peer ranges declared in `package.json`.

## Install

```bash
pnpm add @asteby/metacore-app-providers @radix-ui/react-direction
# transports / kits used by MetacoreAppShell + PlatformConfigProvider
pnpm add @tanstack/react-query sonner
# optional, only if you mount MetacoreAppShell:
pnpm add @asteby/metacore-pwa @asteby/metacore-runtime-react @asteby/metacore-ui
```

## Exports at a glance

| Export | Purpose |
|---|---|
| `DirectionProvider`, `useDirection`             | LTR/RTL with cookie persistence (`dir`). |
| `FontProvider`, `useFont`                       | Font class on `<html>`, cookie-persisted (`font`). Requires `fonts` prop. |
| `LayoutProvider`, `useLayout`                   | Sidebar variant + collapsible mode. Cookies: `layout_variant`, `layout_collapsible`. |
| `SearchProvider`, `useSearch`                   | Cmd/Ctrl+K hotkey + `open`/`setOpen` for command palettes. |
| `PlatformConfigProvider`, `usePlatformConfig`   | Tenant branding (name, logo, primary/accent color, support URLs) — transport-agnostic. |
| `applyBranding`, `applyCachedBranding`          | Imperative helpers for pre-React paint and SW updates. |
| `FALLBACK_BRANDING`                             | Empty defaults consumers can spread over. |
| `MetacoreAppShell`                              | Full kit: ApiProvider + QueryClient + PWA + Toaster + addon-install bridge. |
| `getCookie`, `setCookie`, `removeCookie`        | Tiny cookie helpers shared by the providers. |

Types: `Direction`, `Collapsible`, `Variant`, `FontProviderProps`,
`SearchProviderProps`, `PlatformBranding`, `BrandingFetcher`,
`PlatformConfigProviderProps`, `MetacoreAppShellProps`,
`MetacoreInstallRequest`.

## Basic providers

```tsx
import {
  DirectionProvider,
  FontProvider,
  LayoutProvider,
  SearchProvider,
} from '@asteby/metacore-app-providers'
import { fonts } from '@asteby/metacore-starter-config/fonts'

<DirectionProvider>
  <FontProvider fonts={fonts}>
    <LayoutProvider>
      <SearchProvider>
        <App />
      </SearchProvider>
    </LayoutProvider>
  </FontProvider>
</DirectionProvider>
```

- `FontProvider` requires `fonts` (the first entry is the default).
- `SearchProvider` accepts `hotkey` (default `'k'`, with Cmd/Ctrl). The
  consumer renders the command menu using `useSearch().open` /
  `setOpen()`.
- All four persist state in cookies so SSR/edge runtimes can restore the
  initial frame.

## PlatformConfigProvider — tenant branding

Centralised branding for any metacore app. Apps fetch their tenant's
branding (name, logo, primary color, support URLs) from a backend
endpoint they own; this provider caches it, applies CSS variables
(`--primary`, `--background`, `--sidebar-*`, ...) to `<html>`, persists
the payload in `localStorage` so subsequent loads paint the right brand
**before** React mounts, and re-applies on dark/light toggles.

The provider is transport-agnostic: callers pass an async `fetcher`. No
HTTP client is hard-wired — any of axios / fetch / ofetch / hand-rolled
works.

```tsx
import {
  PlatformConfigProvider,
  applyCachedBranding,
  type PlatformBranding,
} from '@asteby/metacore-app-providers'
import { api } from './lib/api'

// Paint the cached brand BEFORE React mounts.
applyCachedBranding()

const defaults: PlatformBranding = {
  platform_name: 'Acme Hub',
  platform_logo: '/logo.svg',
  primary_color: '#84cc16',
  accent_color: '#22d3ee',
  favicon_url: '/favicon.ico',
  support_email: 'support@acme.test',
  support_url: 'https://acme.test/support',
}

<PlatformConfigProvider
  fetcher={async () => (await api.get('/platform/branding')).data}
  defaults={defaults}
>
  <App />
</PlatformConfigProvider>
```

Inside the tree:

```tsx
const { platform_name, primary_color, refetch } = usePlatformConfig()
```

`refetch()` invalidates the query if the host knows the branding just
changed (e.g. after a settings save).

### Contract

- `fetcher` resolves to a `Partial<PlatformBranding>`. The provider merges
  it over `defaults`, so missing fields fall back instead of blanking the
  UI.
- Hex colors (`#rrggbb`) are converted to `oklch()` and pushed onto the
  `<html>` element as CSS variables. The dark/light variant is derived
  by reading `document.documentElement.classList`; the provider observes
  class changes and re-applies on toggle.
- Persistence key is `platform-branding` in `localStorage`. Override via
  `storageKey`. `applyCachedBranding(storageKey?)` is exported for hosts
  that need a non-default key in their pre-React boot script.
- `staleTime` defaults to 5 minutes (TanStack Query). The provider keeps
  one query per `storageKey`.

## MetacoreAppShell — the full kit

`<MetacoreAppShell>` wires every provider an app needs to run on the
metacore platform: API context, QueryClient, PWA install + update
prompts, offline indicator, sonner toaster, addon-install bridge for
embedded Hub iframes, and stale-while-revalidate metadata-cache
invalidation when a service-worker update is applied.

```tsx
import { MetacoreAppShell } from '@asteby/metacore-app-providers'
import { QueryClient } from '@tanstack/react-query'
import { api } from './lib/api'

const queryClient = new QueryClient()

<MetacoreAppShell api={api} queryClient={queryClient}>
  <RouterProvider router={router} />
</MetacoreAppShell>
```

Optional flags (all default to enabled):

| Prop | Effect |
|---|---|
| `hideToaster`              | Skip the bundled `<Toaster />`. |
| `hidePWAInstall`           | Skip `<PWAInstallPrompt />`. |
| `hidePWAUpdate`            | Skip `<PWAUpdatePrompt />`. |
| `hideOfflineIndicator`     | Skip `<OfflineIndicator />`. |
| `disableMetadataInvalidate`| Don't drop the runtime metadata cache on SW update. |
| `onAddonInstall`           | Custom handler for the `metacore:install` postMessage from an embedded Hub iframe. Set to `null` to disable the listener. |
| `toasterPosition`          | `'top-right'` by default; passed through to sonner. |

The shell pulls peers (`@asteby/metacore-pwa`,
`@asteby/metacore-runtime-react`, `@asteby/metacore-ui`, `sonner`) when
mounted. Apps that only want a subset wire the individual providers and
skip the shell.

### Addon install bridge

When mounted inside (or alongside) the metacore Hub, the shell listens
for `window.postMessage({ type: 'metacore:install', addonKey, ... })`
events and either:

1. invokes `onAddonInstall(req, source)` if you supplied one, OR
2. POSTs `req` to `/marketplace/install` on the bundled API client.

On success it shows a sonner toast, drops the runtime metadata cache,
dispatches a `metacore:metadata-changed` `CustomEvent` on `window` (so
sidebars and command menus refetch without a reload), and replies to
the iframe with `metacore:installed`. On failure it replies with
`metacore:install-failed` and surfaces the error.

## Persistence summary

| Cookie / key | Owner |
|---|---|
| `dir`                  | `DirectionProvider` |
| `font`                 | `FontProvider` |
| `layout_variant`       | `LayoutProvider` |
| `layout_collapsible`   | `LayoutProvider` |
| `platform-branding`    | `PlatformConfigProvider` (localStorage) |

## License

Apache-2.0

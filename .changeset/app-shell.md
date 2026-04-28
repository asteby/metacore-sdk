---
'@asteby/metacore-app-providers': minor
'@asteby/metacore-runtime-react': patch
---

Add `<MetacoreAppShell>` — single-line provider wiring for metacore apps.

Today every app reproduces the same eight-deep wedding cake of providers (QueryClient + ApiProvider + PWAProvider + Toaster + install/update/offline prompts + metadata cache invalidation). The new shell collapses it into:

```tsx
import { MetacoreAppShell } from '@asteby/metacore-app-providers'

<MetacoreAppShell api={api} queryClient={queryClient}>
  <RouterProvider router={router} />
</MetacoreAppShell>
```

What it bundles:

- `QueryClientProvider` (when `queryClient` is supplied)
- `ApiProvider` from `runtime-react`
- `PWAProvider` + `PWAInstallPrompt` + `PWAUpdatePrompt` + `OfflineIndicator`
- `Toaster` from `metacore-ui`
- A `MetadataInvalidator` that clears `useMetadataCache` the moment the PWA layer reports a new service worker — so the next mount of `<DynamicTable>` fetches fresh column / filter / actions definitions instead of replaying yesterday's metadata. Resolves the stale-cache bug where adding `filterable: true` to a column on the backend was invisible until users cleared localStorage.

Apps that want a subset can pass `hidePWAInstall` / `hidePWAUpdate` / `hideOfflineIndicator` / `hideToaster` / `disableMetadataInvalidate` to opt out per layer.

`runtime-react` patch: also switches `<DynamicTable>` to stale-while-revalidate metadata fetch (paint with cache, always re-fetch in background) so the shell isn't the only path that picks up backend changes.

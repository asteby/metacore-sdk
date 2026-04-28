// MetacoreAppShell — single-line wiring of every provider an app needs to
// run on the metacore platform: API context, query client, PWA install +
// update prompts, offline indicator, toasts, and stale-while-revalidate
// metadata cache invalidation when a service-worker update is applied.
//
// Apps mount it once and forget about the wedding-cake of providers:
//
//   import { MetacoreAppShell } from '@asteby/metacore-app-providers'
//   import { api } from './lib/api'
//
//   ReactDOM.createRoot(...).render(
//     <MetacoreAppShell api={api} queryClient={queryClient}>
//       <RouterProvider router={router} />
//     </MetacoreAppShell>
//   )
//
// Peer deps (`@asteby/metacore-pwa`, `@asteby/metacore-runtime-react`,
// `@asteby/metacore-ui`) are required — the shell is the full kit. Apps that
// want a subset wire providers directly and skip the shell.
import * as React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ApiProvider, useMetadataCache } from '@asteby/metacore-runtime-react'
import {
  PWAProvider,
  PWAInstallPrompt,
  PWAUpdatePrompt,
  OfflineIndicator,
  usePWAContext,
} from '@asteby/metacore-pwa'
import { Toaster } from '@asteby/metacore-ui/primitives'

export interface MetacoreAppShellProps {
  /** Axios-compatible API client used by ApiProvider + PWAProvider. */
  api: any
  /** TanStack QueryClient instance. Optional — skipped if not supplied. */
  queryClient?: any
  /** Hide the bundled <Toaster /> (e.g. when the app already mounts one). */
  hideToaster?: boolean
  /** Hide the PWA install prompt button. */
  hidePWAInstall?: boolean
  /** Hide the PWA update prompt button (banner that opens on a new SW). */
  hidePWAUpdate?: boolean
  /** Hide the offline indicator. */
  hideOfflineIndicator?: boolean
  /** Disable the metadata-cache invalidation that fires on SW updates. */
  disableMetadataInvalidate?: boolean
  /** Toaster position; passed straight to sonner. */
  toasterPosition?:
    | 'top-left'
    | 'top-right'
    | 'top-center'
    | 'bottom-left'
    | 'bottom-right'
    | 'bottom-center'
  children: React.ReactNode
}

/**
 * Drops every cached table/modal metadata entry the moment the PWA layer
 * tells us a new service worker has finished installing. The next mount of
 * <DynamicTable> hits the network instead of replaying yesterday's
 * column / filter / actions definitions.
 */
function MetadataInvalidator({ disabled }: { disabled: boolean }) {
  const { needRefresh } = usePWAContext()
  React.useEffect(() => {
    if (disabled) return
    if (!needRefresh) return
    try {
      const state = useMetadataCache.getState() as any
      if (state?.cache) {
        for (const key of Object.keys(state.cache)) delete state.cache[key]
      }
      if (state?.modalCache) {
        for (const key of Object.keys(state.modalCache)) delete state.modalCache[key]
      }
      if (typeof state?.set === 'function') {
        state.set({ prefetched: false })
      }
    } catch {
      /* best-effort */
    }
  }, [disabled, needRefresh])
  return null
}

export function MetacoreAppShell({
  api,
  queryClient,
  hideToaster,
  hidePWAInstall,
  hidePWAUpdate,
  hideOfflineIndicator,
  disableMetadataInvalidate,
  toasterPosition = 'top-right',
  children,
}: MetacoreAppShellProps) {
  const inner = (
    <ApiProvider client={api}>
      <PWAProvider api={api}>
        {children}
        <MetadataInvalidator disabled={!!disableMetadataInvalidate} />
        {!hidePWAInstall && <PWAInstallPrompt />}
        {!hidePWAUpdate && <PWAUpdatePrompt />}
        {!hideOfflineIndicator && <OfflineIndicator />}
      </PWAProvider>
      {!hideToaster && (
        <Toaster position={toasterPosition} richColors theme='light' />
      )}
    </ApiProvider>
  )

  if (queryClient) {
    return <QueryClientProvider client={queryClient}>{inner}</QueryClientProvider>
  }
  return inner
}

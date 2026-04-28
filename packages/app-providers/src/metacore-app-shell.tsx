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

export interface MetacoreInstallRequest {
  addonKey: string
  version?: string
  bundleURL?: string
}

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
  /**
   * Handle the `metacore:install` postMessage from an embedded Hub iframe.
   * Receives the addon key + version + bundle URL; the host runs its own
   * install pipeline (POST `/api/marketplace/install/<key>`, etc) and is
   * responsible for messaging back to the iframe with `metacore:installed`
   * once done. The MessageEventSource argument is the iframe's window —
   * call `source.postMessage({type:'metacore:installed', addonKey})` to
   * confirm.
   *
   * Default: POSTs `/marketplace/install` on the bundled API client and
   * replies on success. Set to `null` to disable the listener entirely.
   */
  onAddonInstall?:
    | ((req: MetacoreInstallRequest, source: MessageEventSource | null) => void | Promise<void>)
    | null
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
/**
 * Listens for the `metacore:install` postMessage from an embedded Hub
 * iframe and forwards to the supplied handler (or the default backend
 * call). Confirms back to the iframe with `metacore:installed` so the
 * Hub UI flips to the success state.
 */
function AddonInstallListener({
  api,
  onAddonInstall,
}: {
  api: any
  onAddonInstall: MetacoreAppShellProps['onAddonInstall']
}) {
  React.useEffect(() => {
    if (onAddonInstall === null) return
    const handler = async (e: MessageEvent) => {
      const data = e.data as { type?: string; addonKey?: string; version?: string; bundleURL?: string } | null
      if (!data || data.type !== 'metacore:install' || !data.addonKey) return
      const req = {
        addonKey: data.addonKey,
        version: data.version,
        bundleURL: data.bundleURL,
      }
      try {
        if (onAddonInstall) {
          await onAddonInstall(req, e.source)
        } else {
          // Default pipeline: POST to the host's marketplace install
          // endpoint. Apps that don't ship that endpoint should pass an
          // explicit `onAddonInstall` handler.
          await api.post('/marketplace/install', req)
        }
        e.source?.postMessage(
          { type: 'metacore:installed', addonKey: req.addonKey },
          { targetOrigin: '*' } as WindowPostMessageOptions,
        )
      } catch (err) {
        e.source?.postMessage(
          {
            type: 'metacore:install-failed',
            addonKey: req.addonKey,
            error: err instanceof Error ? err.message : String(err),
          },
          { targetOrigin: '*' } as WindowPostMessageOptions,
        )
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [api, onAddonInstall])
  return null
}

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
  onAddonInstall,
  toasterPosition = 'top-right',
  children,
}: MetacoreAppShellProps) {
  const inner = (
    <ApiProvider client={api}>
      <PWAProvider api={api}>
        {children}
        <MetadataInvalidator disabled={!!disableMetadataInvalidate} />
        <AddonInstallListener api={api} onAddonInstall={onAddonInstall} />
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

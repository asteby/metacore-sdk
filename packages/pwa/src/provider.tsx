/// <reference types="vite-plugin-pwa/react" />
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'
import { PushNotificationService, type PushApiClient, type PushServiceOptions } from './push-service'

export interface PWAContextValue {
  isOnline: boolean
  isInstallable: boolean
  needRefresh: boolean
  isPushSupported: boolean
  isPushSubscribed: boolean
  installApp: () => Promise<boolean>
  updateApp: () => void
  closeUpdatePrompt: () => void
  subscribeToPush: () => Promise<boolean>
  unsubscribeFromPush: () => Promise<boolean>
  testPushNotification: () => Promise<void>
}

const PWAContext = createContext<PWAContextValue | undefined>(undefined)

/** Narrow interface to the `beforeinstallprompt` event. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

declare global {
  interface Window {
    deferredPrompt: BeforeInstallPromptEvent | null
  }
}

export interface PWAProviderMessages {
  offlineReady?: string
  connectionRestored?: string
  offline?: string
  appInstalled?: string
  installCancelled?: string
  cannotInstall?: string
  installing?: string
}

const DEFAULT_MESSAGES: Required<PWAProviderMessages> = {
  offlineReady: 'App lista para funcionar sin conexión',
  connectionRestored: 'Conexión restaurada',
  offline: 'Sin conexión a internet',
  appInstalled: 'App instalada correctamente',
  installCancelled: 'Instalación cancelada',
  cannotInstall: 'La app ya está instalada o no se puede instalar',
  installing: 'Instalando app...',
}

export interface PWAProviderProps {
  children: ReactNode
  /**
   * Axios-like client used by the push service. Required for push support.
   * If omitted, push-related methods will be no-ops and `isPushSupported` will be false.
   */
  api?: PushApiClient
  /** Override push endpoint paths. */
  pushOptions?: PushServiceOptions
  /** Override user-facing toast messages. */
  messages?: PWAProviderMessages
  /** Interval in ms between SW update checks. Default: 1 hour. Set to 0 to disable. */
  updateCheckIntervalMs?: number
  /**
   * Automatically create the push subscription once notification permission is
   * granted (default: true). Having permission is NOT enough — without a
   * PushSubscription saved on the server, background/mobile push never arrives.
   * The provider subscribes on mount if permission is already granted, and
   * watches for a later grant, so apps don't have to wire subscribeToPush()
   * themselves. Set to false to manage subscription manually.
   */
  autoSubscribeOnGranted?: boolean
  /**
   * Called with the registration once the SW is ready. Useful for instrumentation.
   */
  onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void
  /** Called when SW registration fails. */
  onRegisterError?: (error: unknown) => void
}

export function PWAProvider({
  children,
  api,
  pushOptions,
  messages,
  updateCheckIntervalMs = 60 * 60 * 1000,
  autoSubscribeOnGranted = true,
  onRegistered,
  onRegisterError,
}: PWAProviderProps) {
  const msgs = useMemo(() => ({ ...DEFAULT_MESSAGES, ...messages }), [messages])

  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [isInstallable, setIsInstallable] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isPushSupported, setIsPushSupported] = useState(false)
  const [isPushSubscribed, setIsPushSubscribed] = useState(false)

  const pushServiceRef = useRef<PushNotificationService | null>(null)
  if (api && !pushServiceRef.current) {
    pushServiceRef.current = new PushNotificationService(api, pushOptions)
  }

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      onRegistered?.(registration)
      if (registration && updateCheckIntervalMs > 0) {
        setInterval(() => {
          registration.update()
        }, updateCheckIntervalMs)
      }
    },
    onRegisterError(error) {
      // eslint-disable-next-line no-console
      console.error('SW registration error:', error)
      onRegisterError?.(error)
    },
    onOfflineReady() {
      toast.success(msgs.offlineReady)
    },
  })

  useEffect(() => {
    const pushService = pushServiceRef.current
    if (!pushService) return

    let cancelled = false
    const hasPermission = () =>
      typeof Notification !== 'undefined' && Notification.permission === 'granted'

    const initPush = async () => {
      setIsPushSupported(pushService.getSupported())
      await pushService.init()
      if (cancelled) return
      let subscribed = pushService.isSubscribed()
      // Auto-subscribe when permission is already granted but no subscription
      // exists yet. Without this, an app that "has permission" still never
      // receives background/mobile push because nothing ever created the
      // PushSubscription the server sends to.
      if (autoSubscribeOnGranted && !subscribed && pushService.getSupported() && hasPermission()) {
        subscribed = await pushService.subscribe()
      }
      if (!cancelled) setIsPushSubscribed(subscribed)
    }
    void initPush()

    // Watch for a permission grant that happens AFTER mount (browser UI or a
    // custom prompt that only calls Notification.requestPermission). Subscribe
    // automatically so hosts don't have to wire subscribeToPush() themselves.
    let poll: ReturnType<typeof setInterval> | undefined
    if (autoSubscribeOnGranted && pushService.getSupported() && typeof Notification !== 'undefined') {
      poll = setInterval(() => {
        if (cancelled) return
        if (hasPermission() && !pushService.isSubscribed()) {
          void pushService.subscribe().then((ok) => {
            if (!cancelled) setIsPushSubscribed(ok)
          })
        }
      }, 3000)
    }

    return () => {
      cancelled = true
      if (poll) clearInterval(poll)
    }
  }, [autoSubscribeOnGranted])

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (window.deferredPrompt) {
      setDeferredPrompt(window.deferredPrompt)
      setIsInstallable(true)
    }

    const handleOnline = () => {
      setIsOnline(true)
      toast.success(msgs.connectionRestored)
    }

    const handleOffline = () => {
      setIsOnline(false)
      toast.warning(msgs.offline)
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      const evt = e as BeforeInstallPromptEvent
      setDeferredPrompt(evt)
      setIsInstallable(true)
      window.deferredPrompt = evt
    }

    const handleAppInstalled = () => {
      setIsInstallable(false)
      setDeferredPrompt(null)
      window.deferredPrompt = null
      toast.success(msgs.appInstalled)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [msgs])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    let refreshing = false
    const handleControllerChange = () => {
      if (!refreshing) {
        refreshing = true
        window.location.reload()
      }
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  // Independent SW update detection. A host may alias `virtual:pwa-register/react`
  // to a no-op stub (e.g. ops's module-federation setup), in which case
  // useRegisterSW.onRegistered never fires and the periodic update() above never
  // runs — so on an SPA (no full navigation) a new deploy is never detected and
  // the user stays on the stale build until a manual hard reload / cache clear.
  // Drive the check from the LIVE registration instead so it works regardless of
  // the stub: poll on an interval AND on every tab focus/visibility regain
  // (immediate, so coming back to the tab picks up a fresh deploy at once). A
  // detected update self-activates (sw.js skipWaiting + clientsClaim) →
  // controllerchange → the reload effect above swaps to the new build by itself.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    if (updateCheckIntervalMs <= 0) return

    let reg: ServiceWorkerRegistration | undefined
    let interval: ReturnType<typeof setInterval> | undefined
    const check = () => {
      void reg?.update().catch(() => {})
    }

    navigator.serviceWorker.ready
      .then((registration) => {
        reg = registration
        check()
        interval = setInterval(check, updateCheckIntervalMs)
      })
      .catch(() => {})

    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') check()
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible)
    }
    window.addEventListener('focus', check)

    return () => {
      if (interval) clearInterval(interval)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible)
      }
      window.removeEventListener('focus', check)
    }
  }, [updateCheckIntervalMs])

  const installApp = async (): Promise<boolean> => {
    if (!deferredPrompt) {
      toast.error(msgs.cannotInstall)
      return false
    }

    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      toast.success(msgs.installing)
      setDeferredPrompt(null)
      setIsInstallable(false)
      return true
    }

    toast.info(msgs.installCancelled)
    return false
  }

  const updateApp = () => {
    // For autoUpdate SWs (skipWaiting + clientsClaim on install) there is no
    // "waiting" worker at click-time — the new SW is already active and
    // serving the updated assets.  updateServiceWorker(true) posts a
    // SKIP_WAITING message which becomes a no-op in that case, leaving the
    // user stuck on the old build.
    //
    // Strategy: call updateServiceWorker(true) for the prompt-strategy path,
    // AND schedule a reload after a short grace window so that either path
    // works:
    //   - autoUpdate: SW is already active → reload immediately picks up
    //     the new build.
    //   - prompt: SKIP_WAITING → controllerchange → the controllerchange
    //     handler reloads; if it fires within the grace window the setTimeout
    //     is a harmless double-reload (browser dedupes it); if it doesn't fire
    //     in time the setTimeout covers us.
    void updateServiceWorker(true)
    setTimeout(() => {
      window.location.reload()
    }, 400)
  }

  const subscribeToPush = async (): Promise<boolean> => {
    const pushService = pushServiceRef.current
    if (!pushService) return false
    const result = await pushService.subscribe()
    setIsPushSubscribed(result)
    return result
  }

  const unsubscribeFromPush = async (): Promise<boolean> => {
    const pushService = pushServiceRef.current
    if (!pushService) return false
    const result = await pushService.unsubscribe()
    if (result) {
      setIsPushSubscribed(false)
    }
    return result
  }

  const testPushNotification = async (): Promise<void> => {
    const pushService = pushServiceRef.current
    if (!pushService) return
    await pushService.testNotification()
  }

  const value: PWAContextValue = {
    isOnline,
    isInstallable,
    needRefresh,
    isPushSupported,
    isPushSubscribed,
    installApp,
    updateApp,
    closeUpdatePrompt: () => setNeedRefresh(false),
    subscribeToPush,
    unsubscribeFromPush,
    testPushNotification,
  }

  return <PWAContext.Provider value={value}>{children}</PWAContext.Provider>
}

export function usePWAContext(): PWAContextValue {
  const context = useContext(PWAContext)
  if (context === undefined) {
    throw new Error('usePWA must be used within a PWAProvider')
  }
  return context
}

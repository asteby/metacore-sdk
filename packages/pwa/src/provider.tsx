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

    const initPush = async () => {
      setIsPushSupported(pushService.getSupported())
      await pushService.init()
      setIsPushSubscribed(pushService.isSubscribed())
    }
    void initPush()
  }, [])

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
    void updateServiceWorker(true)
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

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'
import { pushService } from '@/lib/push-notifications'

interface PWAContextType {
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

const PWAContext = createContext<PWAContextType | undefined>(undefined)

declare global {
    interface Window {
        deferredPrompt: any
    }
}

export function PWAProvider({ children }: { children: ReactNode }) {
    const { t } = useTranslation()
    const [isOnline, setIsOnline] = useState(navigator.onLine)
    const [isInstallable, setIsInstallable] = useState(false)
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
    const [isPushSupported, setIsPushSupported] = useState(false)
    const [isPushSubscribed, setIsPushSubscribed] = useState(false)

    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(registration) {
            console.log('SW Registered:', registration)
            if (registration) {
                setInterval(() => {
                    console.log('Checking for SW update...')
                    registration.update()
                }, 60 * 60 * 1000) // Check every hour
            }
        },
        onRegisterError(error) {
            console.error('SW registration error:', error)
        },
        onOfflineReady() {
            toast.success('App lista para funcionar sin conexión')
        }
    })

    // Initialize push notifications
    useEffect(() => {
        const initPush = async () => {
            setIsPushSupported(pushService.getSupported())
            await pushService.init()
            setIsPushSubscribed(pushService.isSubscribed())
        }
        initPush()
    }, [])

    useEffect(() => {
        // Check if event already fired
        if (window.deferredPrompt) {
            setDeferredPrompt(window.deferredPrompt)
            setIsInstallable(true)
        }

        const handleOnline = () => {
            setIsOnline(true)
            toast.success('Conexión restaurada')
        }

        const handleOffline = () => {
            setIsOnline(false)
            toast.warning('Sin conexión a internet')
        }

        const handleBeforeInstallPrompt = (e: Event) => {
            console.log('👀 PWA Install Prompt captured!', e)
            e.preventDefault()
            setDeferredPrompt(e)
            setIsInstallable(true)
            window.deferredPrompt = e // Keep in sync
        }

        const handleAppInstalled = () => {
            setIsInstallable(false)
            setDeferredPrompt(null)
            window.deferredPrompt = null
            toast.success('App instalada correctamente')
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
    }, [])

    useEffect(() => {
        let refreshing = false
        const handleControllerChange = () => {
            if (!refreshing) {
                refreshing = true
                window.location.reload()
            }
        }

        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
        return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }, [])

    const installApp = async () => {
        if (!deferredPrompt) {
            toast.error('La app ya está instalada o no se puede instalar')
            return false
        }

        deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice

        if (outcome === 'accepted') {
            toast.success('Instalando app...')
            setDeferredPrompt(null)
            setIsInstallable(false)
            return true
        } else {
            toast.info(t('agents.installation_cancelled'))
            return false
        }
    }

    const updateApp = () => {
        updateServiceWorker(true)
    }

    const subscribeToPush = async (): Promise<boolean> => {
        const result = await pushService.subscribe()
        setIsPushSubscribed(result)
        return result
    }

    const unsubscribeFromPush = async (): Promise<boolean> => {
        const result = await pushService.unsubscribe()
        if (result) {
            setIsPushSubscribed(false)
        }
        return result
    }

    const testPushNotification = async (): Promise<void> => {
        await pushService.testNotification()
    }

    return (
        <PWAContext.Provider value={{
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
            testPushNotification
        }}>
            {children}
        </PWAContext.Provider>
    )
}

export function usePWA() {
    const context = useContext(PWAContext)
    if (context === undefined) {
        throw new Error('usePWA must be used within a PWAProvider')
    }
    return context
}

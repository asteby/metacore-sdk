import { useEffect, useState } from 'react'
import { usePWAContext, type PWAContextValue } from './provider'
import { notificationManager, type NotificationOptions } from './notification-manager'

/** Convenience re-export of the PWA context hook. */
export function usePWA(): PWAContextValue {
  return usePWAContext()
}

export interface UseNotificationsResult {
  permission: NotificationPermission
  isSupported: boolean
  requestPermission: () => Promise<boolean>
  showNotification: (options: NotificationOptions) => Promise<void>
  isGranted: boolean
  isDenied: boolean
  isDefault: boolean
}

/**
 * React hook around {@link NotificationManager} for browser notifications.
 * Polls permission every second to reflect changes made outside the app.
 */
export function useNotifications(): UseNotificationsResult {
  const [permission, setPermission] = useState<NotificationPermission>(
    notificationManager.getPermission()
  )
  const [isSupported] = useState<boolean>(notificationManager.isSupported())

  useEffect(() => {
    if (!isSupported) return

    const updatePermission = () => {
      setPermission(notificationManager.getPermission())
    }

    const interval = setInterval(updatePermission, 1000)
    return () => clearInterval(interval)
  }, [isSupported])

  const requestPermission = async (): Promise<boolean> => {
    const granted = await notificationManager.requestPermission()
    setPermission(notificationManager.getPermission())
    return granted
  }

  const showNotification = async (options: NotificationOptions): Promise<void> => {
    await notificationManager.show(options)
  }

  return {
    permission,
    isSupported,
    requestPermission,
    showNotification,
    isGranted: permission === 'granted',
    isDenied: permission === 'denied',
    isDefault: permission === 'default',
  }
}

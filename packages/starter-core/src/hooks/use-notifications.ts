import { useEffect, useState } from 'react'
import { notificationManager, NotificationOptions } from '@/lib/notifications'

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    notificationManager.getPermission()
  )
  const [isSupported] = useState(notificationManager.isSupported())

  useEffect(() => {
    if (!isSupported) return

    const updatePermission = () => {
      setPermission(notificationManager.getPermission())
    }

    // Check permission changes
    const interval = setInterval(updatePermission, 1000)
    return () => clearInterval(interval)
  }, [isSupported])

  const requestPermission = async () => {
    const granted = await notificationManager.requestPermission()
    setPermission(notificationManager.getPermission())
    return granted
  }

  const showNotification = async (options: NotificationOptions) => {
    await notificationManager.show(options)
  }

  return {
    permission,
    isSupported,
    requestPermission,
    showNotification,
    isGranted: permission === 'granted',
    isDenied: permission === 'denied',
    isDefault: permission === 'default'
  }
}

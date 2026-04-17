import { toast } from 'sonner'

export interface NotificationOptions {
  title: string
  body: string
  icon?: string
  tag?: string
  data?: any
  requireInteraction?: boolean
  silent?: boolean
}

class NotificationManager {
  private permission: NotificationPermission = 'default'

  constructor() {
    if ('Notification' in window) {
      this.permission = Notification.permission
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      toast.error('Este navegador no soporta notificaciones')
      return false
    }

    if (this.permission === 'granted') {
      return true
    }

    try {
      const permission = await Notification.requestPermission()
      this.permission = permission
      
      if (permission === 'granted') {
        toast.success('Notificaciones activadas')
        return true
      } else {
        toast.error('Permiso de notificaciones denegado')
        return false
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error)
      toast.error('Error al solicitar permisos')
      return false
    }
  }

  async show(options: NotificationOptions): Promise<void> {
    if (!('Notification' in window)) {
      toast(options.title, { description: options.body })
      return
    }

    if (this.permission !== 'granted') {
      const granted = await this.requestPermission()
      if (!granted) {
        toast(options.title, { description: options.body })
        return
      }
    }

    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // Use service worker for better notification handling
        const registration = await navigator.serviceWorker.ready
        await registration.showNotification(options.title, {
          body: options.body,
          icon: options.icon || '/images/icons/android/android-launchericon-192-192.png',
          badge: '/images/icons/android/android-launchericon-96-96.png',
          tag: options.tag,
          data: options.data,
          requireInteraction: options.requireInteraction || false,
          silent: options.silent || false
        })
      } else {
        // Fallback to regular notification
        const notification = new Notification(options.title, {
          body: options.body,
          icon: options.icon || '/images/icons/android/android-launchericon-192-192.png',
          tag: options.tag,
          data: options.data,
          requireInteraction: options.requireInteraction || false,
          silent: options.silent || false
        })

        notification.onclick = () => {
          window.focus()
          notification.close()
        }
      }

      // Also show toast for in-app notification
      toast(options.title, { 
        description: options.body,
        duration: 5000
      })
    } catch (error) {
      console.error('Error showing notification:', error)
      toast(options.title, { description: options.body })
    }
  }

  isSupported(): boolean {
    return 'Notification' in window
  }

  getPermission(): NotificationPermission {
    return this.permission
  }
}

export const notificationManager = new NotificationManager()

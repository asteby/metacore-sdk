import { toast } from 'sonner'

export interface NotificationOptions {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  data?: unknown
  requireInteraction?: boolean
  silent?: boolean
}

export interface NotificationManagerOptions {
  /** Default icon used when an `options.icon` is not provided. */
  defaultIcon?: string
  /** Default badge used when an `options.badge` is not provided. */
  defaultBadge?: string
}

export class NotificationManager {
  private permission: NotificationPermission = 'default'
  private readonly defaultIcon: string | undefined
  private readonly defaultBadge: string | undefined

  constructor(options: NotificationManagerOptions = {}) {
    this.defaultIcon = options.defaultIcon
    this.defaultBadge = options.defaultBadge
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.permission = Notification.permission
    }
  }

  async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
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
      }

      toast.error('Permiso de notificaciones denegado')
      return false
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error requesting notification permission:', error)
      toast.error('Error al solicitar permisos')
      return false
    }
  }

  async show(options: NotificationOptions): Promise<void> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
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
      const icon = options.icon ?? this.defaultIcon
      const badge = options.badge ?? this.defaultBadge

      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const registration = await navigator.serviceWorker.ready
        await registration.showNotification(options.title, {
          body: options.body,
          icon,
          badge,
          tag: options.tag,
          data: options.data,
          requireInteraction: options.requireInteraction ?? false,
          silent: options.silent ?? false,
        })
      } else {
        const notification = new Notification(options.title, {
          body: options.body,
          icon,
          tag: options.tag,
          data: options.data,
          requireInteraction: options.requireInteraction ?? false,
          silent: options.silent ?? false,
        })

        notification.onclick = () => {
          window.focus()
          notification.close()
        }
      }

      toast(options.title, {
        description: options.body,
        duration: 5000,
      })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error showing notification:', error)
      toast(options.title, { description: options.body })
    }
  }

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window
  }

  getPermission(): NotificationPermission {
    return this.permission
  }
}

/** Shared default singleton. Uses no default icons/badges. */
export const notificationManager = new NotificationManager()

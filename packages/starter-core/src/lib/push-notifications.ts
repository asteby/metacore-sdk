import { api } from './api'
import { toast } from 'sonner'

interface PushSubscriptionKeys {
  p256dh: string
  auth: string
}

class PushNotificationService {
  private vapidPublicKey: string | null = null
  private subscription: PushSubscription | null = null
  private isSupported: boolean = false

  constructor() {
    this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window
  }

  async init(): Promise<void> {
    if (!this.isSupported) {
      console.log('⚠️ Push notifications not supported')
      return
    }

    try {
      // Get VAPID public key from backend
      const response = await api.get('/push/public-key')
      if (response.data?.publicKey) {
        this.vapidPublicKey = response.data.publicKey
        console.log('✅ VAPID public key loaded')
      }

      // Check existing subscription
      const registration = await navigator.serviceWorker.ready
      this.subscription = await registration.pushManager.getSubscription()
      
      if (this.subscription) {
        console.log('✅ Existing push subscription found')
      }
    } catch (error) {
      console.error('Failed to initialize push service:', error)
    }
  }

  async subscribe(): Promise<boolean> {
    if (!this.isSupported) {
      toast.error('Tu navegador no soporta notificaciones push')
      return false
    }

    if (!this.vapidPublicKey) {
      await this.init()
      if (!this.vapidPublicKey) {
        toast.error('No se pudo obtener la clave del servidor')
        return false
      }
    }

    try {
      // Request notification permission first
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.error('Permiso de notificaciones denegado')
        return false
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey) as BufferSource
      })

      this.subscription = subscription

      // Send subscription to backend
      const keys = subscription.toJSON().keys as unknown as PushSubscriptionKeys
      await api.post('/push/subscribe', {
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        device_type: this.detectDeviceType()
      })

      toast.success('🔔 Notificaciones push activadas')
      console.log('✅ Push subscription registered')
      return true
    } catch (error) {
      console.error('Failed to subscribe to push:', error)
      toast.error('Error al activar notificaciones push')
      return false
    }
  }

  async unsubscribe(): Promise<boolean> {
    if (!this.subscription) {
      return true
    }

    try {
      // Unsubscribe from push manager
      await this.subscription.unsubscribe()

      // Remove from backend
      await api.post('/push/unsubscribe', {
        endpoint: this.subscription.endpoint
      })

      this.subscription = null
      toast.success('Notificaciones push desactivadas')
      return true
    } catch (error) {
      console.error('Failed to unsubscribe:', error)
      toast.error('Error al desactivar notificaciones')
      return false
    }
  }

  async testNotification(): Promise<void> {
    try {
      await api.post('/push/test')
      toast.success('Notificación de prueba enviada')
    } catch (error) {
      console.error('Failed to send test notification:', error)
      toast.error('Error al enviar notificación de prueba')
    }
  }

  isSubscribed(): boolean {
    return this.subscription !== null
  }

  getSupported(): boolean {
    return this.isSupported
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/')

    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  private detectDeviceType(): string {
    const userAgent = navigator.userAgent.toLowerCase()
    
    if (/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent)) {
      return 'mobile'
    }
    
    if (/electron/i.test(userAgent)) {
      return 'desktop'
    }
    
    return 'web'
  }
}

export const pushService = new PushNotificationService()

import { toast } from 'sonner'

export interface PushApiClient {
  get: <T = unknown>(url: string) => Promise<{ data: T }>
  post: <T = unknown>(url: string, body?: unknown) => Promise<{ data: T }>
}

interface PushSubscriptionKeys {
  p256dh: string
  auth: string
}

interface PublicKeyResponse {
  publicKey?: string
}

export interface PushServiceOptions {
  /** Endpoint to fetch VAPID public key (GET). Default: `/push/public-key` */
  publicKeyPath?: string
  /** Endpoint to register subscription (POST). Default: `/push/subscribe` */
  subscribePath?: string
  /** Endpoint to remove subscription (POST). Default: `/push/unsubscribe` */
  unsubscribePath?: string
  /** Endpoint to trigger a test notification (POST). Default: `/push/test` */
  testPath?: string
}

export class PushNotificationService {
  private vapidPublicKey: string | null = null
  private subscription: PushSubscription | null = null
  private readonly isSupportedFlag: boolean
  private readonly api: PushApiClient
  private readonly opts: Required<PushServiceOptions>

  constructor(api: PushApiClient, options: PushServiceOptions = {}) {
    this.api = api
    this.opts = {
      publicKeyPath: options.publicKeyPath ?? '/push/public-key',
      subscribePath: options.subscribePath ?? '/push/subscribe',
      unsubscribePath: options.unsubscribePath ?? '/push/unsubscribe',
      testPath: options.testPath ?? '/push/test',
    }
    this.isSupportedFlag =
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      typeof window !== 'undefined' &&
      'PushManager' in window
  }

  async init(): Promise<void> {
    if (!this.isSupportedFlag) {
      // eslint-disable-next-line no-console
      console.log('Push notifications not supported')
      return
    }

    try {
      const response = await this.api.get<PublicKeyResponse>(this.opts.publicKeyPath)
      if (response.data?.publicKey) {
        this.vapidPublicKey = response.data.publicKey
      }

      const registration = await navigator.serviceWorker.ready
      this.subscription = await registration.pushManager.getSubscription()
    } catch (error) {
      // 404 means the backend doesn't have VAPID configured (push is opt-in
      // on the kernel, gated by `EnablePush`) — that's a valid deployment,
      // not an error. Surface other failures so misconfigured keys still
      // show up in the console.
      const status = (error as { response?: { status?: number } })?.response?.status
      if (status === 404) return
      // eslint-disable-next-line no-console
      console.error('Failed to initialize push service:', error)
    }
  }

  async subscribe(): Promise<boolean> {
    if (!this.isSupportedFlag) {
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
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.error('Permiso de notificaciones denegado')
        return false
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey) as BufferSource,
      })

      this.subscription = subscription

      const keys = subscription.toJSON().keys as unknown as PushSubscriptionKeys
      await this.api.post(this.opts.subscribePath, {
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        device_type: this.detectDeviceType(),
      })

      toast.success('Notificaciones push activadas')
      return true
    } catch (error) {
      // eslint-disable-next-line no-console
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
      await this.subscription.unsubscribe()

      await this.api.post(this.opts.unsubscribePath, {
        endpoint: this.subscription.endpoint,
      })

      this.subscription = null
      toast.success('Notificaciones push desactivadas')
      return true
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to unsubscribe:', error)
      toast.error('Error al desactivar notificaciones')
      return false
    }
  }

  async testNotification(): Promise<void> {
    try {
      await this.api.post(this.opts.testPath)
      toast.success('Notificación de prueba enviada')
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to send test notification:', error)
      toast.error('Error al enviar notificación de prueba')
    }
  }

  isSubscribed(): boolean {
    return this.subscription !== null
  }

  getSupported(): boolean {
    return this.isSupportedFlag
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  private detectDeviceType(): string {
    if (typeof navigator === 'undefined') return 'web'
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

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

  /**
   * Subscribe to Web Push and register the subscription with the backend.
   *
   * Robust against the two ways this used to fail in production:
   *  - A stale/rotated subscription (or one created under a different
   *    applicationServerKey / legacy gcm_sender_id) makes pushManager.subscribe
   *    throw "A subscription with a different applicationServerKey already
   *    exists" → surfaced as "Error al activar notificaciones push". We now drop
   *    any existing subscription whose key doesn't match and re-subscribe.
   *  - Push silently dying after the subscription expires: we always re-POST to
   *    the backend (re-activating the server-side row) and re-create the
   *    subscription when it's missing, so returning to the app restores it.
   *
   * @param opts.silent       suppress toasts (auto/background refresh paths)
   * @param opts.allowPrompt  may call Notification.requestPermission() (true for
   *                          user-initiated; false for auto paths so we never
   *                          prompt unexpectedly)
   */
  async subscribe(opts: { silent?: boolean; allowPrompt?: boolean } = {}): Promise<boolean> {
    const { silent = false, allowPrompt = true } = opts
    const fail = (msg: string) => {
      if (!silent) toast.error(msg)
      return false
    }

    if (!this.isSupportedFlag) {
      return fail('Tu navegador no soporta notificaciones push')
    }

    if (!this.vapidPublicKey) {
      await this.init()
      if (!this.vapidPublicKey) {
        return fail('No se pudo obtener la clave del servidor')
      }
    }

    try {
      if (Notification.permission !== 'granted') {
        if (!allowPrompt) return false // auto path: never prompt
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          return fail('Permiso de notificaciones denegado')
        }
      }

      const appKey = this.urlBase64ToUint8Array(this.vapidPublicKey)
      const registration = await navigator.serviceWorker.ready

      // Reuse an existing subscription only if it was created with the SAME
      // VAPID key; otherwise drop it (rotated key / legacy gcm_sender_id) so the
      // subscribe below doesn't throw.
      let subscription = await registration.pushManager.getSubscription()
      if (subscription && !this.keyMatches(subscription, appKey)) {
        try {
          await subscription.unsubscribe()
        } catch {
          /* ignore — we'll try to subscribe fresh anyway */
        }
        subscription = null
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appKey as BufferSource,
        })
      }

      this.subscription = subscription

      // Always (re-)register with the backend so an expired/deactivated row is
      // reactivated when the user comes back.
      const keys = subscription.toJSON().keys as unknown as PushSubscriptionKeys
      await this.api.post(this.opts.subscribePath, {
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        device_type: this.detectDeviceType(),
      })

      if (!silent) toast.success('Notificaciones push activadas')
      return true
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to subscribe to push:', error)
      return fail('Error al activar notificaciones push')
    }
  }

  /** True if the existing subscription's applicationServerKey equals `appKey`. */
  private keyMatches(subscription: PushSubscription, appKey: Uint8Array): boolean {
    const existing = subscription.options?.applicationServerKey
    if (!existing) return false // legacy sub (no VAPID key) → treat as mismatch
    const a = new Uint8Array(existing as ArrayBuffer)
    if (a.length !== appKey.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== appKey[i]) return false
    }
    return true
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

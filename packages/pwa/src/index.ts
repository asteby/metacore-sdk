export { PWAProvider, usePWAContext } from './provider'
export type {
  PWAContextValue,
  PWAProviderProps,
  PWAProviderMessages,
} from './provider'

export { usePWA, useNotifications } from './hooks'
export type { UseNotificationsResult } from './hooks'

export {
  PushNotificationService,
} from './push-service'
export type { PushApiClient, PushServiceOptions } from './push-service'

export {
  NotificationManager,
  notificationManager,
} from './notification-manager'
export type { NotificationOptions, NotificationManagerOptions } from './notification-manager'

export {
  PWAInstallPrompt,
  PWAUpdatePrompt,
  OfflineIndicator,
  NotificationPermissionPrompt,
} from './components'

export { metacorePWA } from './vite-plugin'
export type { MetacorePWAOptions } from './vite-plugin'

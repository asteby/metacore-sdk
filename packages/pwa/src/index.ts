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

// `metacorePWA` lives in the dedicated `@asteby/metacore-pwa/vite-plugin`
// sub-export. Re-exporting it from the root would drag `vite-plugin-pwa`
// (Node-only) into every consumer's browser bundle and crash with
// `module.createRequire is not a function`. Apps that need it import the
// sub-export directly:
//
//   import { metacorePWA } from '@asteby/metacore-pwa/vite-plugin'

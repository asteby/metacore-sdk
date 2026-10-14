export { PWAProvider, usePWAContext } from './provider'
export {
  attachConnectionReporter,
  configureConnectionProbe,
  getConnectionState,
  onConnectionRestored,
  reportNetworkError,
  reportReachable,
  useConnectionState,
} from './connection'
export type { ConnectionState, ConnectionProbeOptions } from './connection'
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
  decideUpdate,
  resolveUpdatePolicy,
  autoApplyThreshold,
  isWithinTtl,
  DEFAULT_UPDATE_POLICY,
} from './update-policy'
export type { UpdatePolicy, UpdateState, UpdateDecision } from './update-policy'
export { isSafeSnapshot, readSafetySnapshot, installActivityTracking } from './dom-safety'
export type { SafetySnapshot, SafetyOptions } from './dom-safety'
export { createUpdateController } from './update-controller'
export type {
  UpdateController,
  UpdateControllerOptions,
  UpdateSnapshot,
  VersionCheck,
} from './update-controller'
export { useServiceWorkerUpdate } from './use-service-worker-update'
export type {
  UseServiceWorkerUpdateOptions,
  UseServiceWorkerUpdateResult,
} from './use-service-worker-update'

export { useModalOpen, hasOpenModal } from './use-modal-open'

export {
  PWAInstallPrompt,
  PWAUpdatePrompt,
  OfflineIndicator,
  NotificationPermissionPrompt,
} from './components'
export type { UpdatePromptProps, UpdatePromptToastContext } from './components'

// `metacorePWA` lives in the dedicated `@asteby/metacore-pwa/vite-plugin`
// sub-export. Re-exporting it from the root would drag `vite-plugin-pwa`
// (Node-only) into every consumer's browser bundle and crash with
// `module.createRequire is not a function`. Apps that need it import the
// sub-export directly:
//
//   import { metacorePWA } from '@asteby/metacore-pwa/vite-plugin'

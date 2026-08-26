export { NotificationsDropdown } from './dropdown'
export { useAppBadge, useNotifications } from './hooks'
export {
  showNotificationToast,
  installUnifiedToasts,
  type ShowNotificationToastOptions,
  type PersistNotificationInput,
  type InstallUnifiedToastsOptions,
  type ToastActionButton,
} from './toast'
export {
  subscribeNotificationSSE,
  useNotificationSSE,
  type NotificationStreamOptions,
} from './sse'
export {
  resolveNotificationVisual,
  resolveNotificationIcon,
  resolveNotificationTone,
  moduleLabelFromMeta,
  parseNotificationMeta,
  registerModuleLabel,
  toPascalCase,
  type NotificationMeta,
  type NotificationTone,
} from './visual'
export {
  formatNotificationBodyHtml,
  enhancePlainNotificationText,
  sanitizeNotificationHtml,
} from './rich-text'
export type {
  NotificationItem,
  NotificationType,
  NotificationsApiClient,
  NotificationWsPayload,
  NotificationsDropdownLabels,
  NotificationsDropdownProps,
} from './types'

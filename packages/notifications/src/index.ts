export { NotificationsDropdown } from './dropdown'
export { useAppBadge, useNotifications } from './hooks'
export {
  showNotificationToast,
  installUnifiedToasts,
  type ShowNotificationToastOptions,
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
export type {
  NotificationItem,
  NotificationType,
  NotificationsApiClient,
  NotificationWsPayload,
  NotificationsDropdownLabels,
  NotificationsDropdownProps,
} from './types'

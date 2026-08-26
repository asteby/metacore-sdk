import type { Locale } from 'date-fns'

/**
 * Severity of a notification. Drives default icon + colour palette when no
 * custom `icon` is supplied in the payload.
 */
export type NotificationType = 'info' | 'success' | 'warning' | 'error'

/**
 * Canonical shape of a notification as returned by the Metacore API and
 * rendered inside the dropdown. Extra fields may be present on the wire and
 * are tolerated (but ignored) by the component.
 */
export interface NotificationItem {
  id: string
  title: string
  message: string
  type: NotificationType
  is_read: boolean
  created_at: string
  link?: string
  icon?: string
  image?: string
  /** JSON string or already-parsed object (addon_key, color, …). */
  metadata?: string | Record<string, unknown>
  conversation_id?: string
}

/**
 * Subset of an HTTP client (axios-compatible) used by the notifications
 * package. Declared locally so consumers can inject any compatible client
 * without this package depending on axios.
 */
export interface NotificationsApiClient {
  get: <T = unknown>(
    url: string,
    config?: { params?: Record<string, unknown> },
  ) => Promise<{ data: T }>
  patch: <T = unknown>(
    url: string,
    data?: unknown,
  ) => Promise<{ data: T }>
}

/**
 * Shape of a live `NOTIFICATION` payload (WebSocket or SSE).
 */
export interface NotificationWsPayload {
  id?: string
  title: string
  body?: string
  message?: string
  description?: string
  type?: NotificationType
  link?: string
  icon?: string
  image?: string
  metadata?: string | Record<string, unknown>
  conversation_id?: string
  /** Optional explicit module chip (overrides metadata.addon_key map). */
  apartado?: string
  addon_key?: string
  /** Optional CSS/hex colour for the icon disc. */
  color?: string
}

/**
 * Strings used by the dropdown. Overridable for i18n. Defaults to Spanish.
 */
export interface NotificationsDropdownLabels {
  title: string
  newBadge: (count: number) => string
  empty: string
  markAllAsRead: string
  enableNotifications: string
  notificationsEnabled: string
  permissionsBlocked: string
  permissionsBlockedDescription: string
  permissionRequestFailed: string
  permissionRequired: string
  srLabel: string
}

export interface NotificationsDropdownProps {
  /** Injected HTTP client (never imported as singleton). */
  apiClient: NotificationsApiClient
  /**
   * Base collection path for the current user's notifications. Typical
   * values: `/data/notifications/me` or `/dynamic/notifications/me`,
   * depending on the host. Items are mutated under `${apiBasePath}/${id}`.
   */
  apiBasePath: string
  /** When true (default), updates `navigator.setAppBadge` with unread count. */
  enableBadge?: boolean
  /**
   * Invoked when the user clicks a notification. If omitted, the component
   * falls back to `window.open` for absolute URLs and a no-op otherwise.
   */
  onNotificationClick?: (notification: NotificationItem) => void
  /** Number of items fetched on the initial request. Defaults to 20. */
  perPage?: number
  /** `date-fns` locale used for relative time formatting. */
  locale?: Locale
  /** Override built-in labels (Spanish by default). */
  labels?: Partial<NotificationsDropdownLabels>
  /**
   * Optional URL normaliser for `notification.image` (e.g. bare storage
   * filenames → absolute `/storage/…` URLs). When omitted, the raw value is
   * used as `img.src`.
   */
  resolveImageUrl?: (src: string) => string
  /**
   * Optional override for WebSocket subscription. When supplied, the
   * component does NOT call `useWebSocketMessage` and instead exposes the
   * handler via this prop — useful when the app owns its own socket or when
   * `@asteby/metacore-websocket` is unavailable. The caller must invoke
   * `onMessage` with every incoming `NOTIFICATION` payload.
   */
  subscribeToNotifications?: (
    onMessage: (payload: NotificationWsPayload) => void,
  ) => void | (() => void)
  /**
   * Preferred live transport: Server-Sent Events URL
   * (e.g. `/api/notifications/stream`). When set, opens EventSource in
   * addition to (or instead of, when `subscribeToNotifications` is also
   * omitted and `preferSse` is true) the WebSocket path.
   */
  sseUrl?: string
  /** Bearer token for SSE (`?access_token=` — EventSource cannot set headers). */
  sseAccessToken?: string | null
  /**
   * When true (default if `sseUrl` is set), skip the built-in WebSocket hook
   * and rely on SSE (+ optional `subscribeToNotifications`).
   */
  preferSse?: boolean
  /**
   * Show the canonical card toast when a live notification arrives.
   * Default true — one visual pipeline for bell + toast.
   */
  showToastOnIngest?: boolean
}

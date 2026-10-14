import type { ReactNode } from 'react'
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
export type NotificationId = string | number

export interface NotificationItem {
  id: NotificationId
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
  /**
   * Optional author of the notification. Used by the default avatar: when no
   * `image` is present, `user.avatar` is shown, falling back to the initials
   * of `user.name`.
   */
  user?: { name?: string; avatar?: string }
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
  /** Optional: not used by the component itself, available to host handlers. */
  post?: <T = unknown>(
    url: string,
    data?: unknown,
  ) => Promise<{ data: T }>
  /** Optional: not used by the component itself, available to host handlers. */
  delete?: <T = unknown>(
    url: string,
    config?: { params?: Record<string, unknown> },
  ) => Promise<{ data: T }>
}

/** Result of `parseList`: the rows plus optional server-side counters. */
export interface NotificationListResult {
  /** Raw rows. `normalizeItem` (when given) is applied to each one. */
  items: unknown[]
  /** Server-side unread total. Takes priority over the local count. */
  unreadCount?: number
  total?: number
}

/**
 * Shape of a live `NOTIFICATION` payload (WebSocket or SSE).
 */
export interface NotificationWsPayload {
  id?: NotificationId
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
  /**
   * Short plain-text summary for the live toast (falls back to
   * `metadata.summary`). The bell keeps the full `body`.
   */
  summary?: string
  /**
   * Toast action buttons (falls back to `metadata.actions`). Each click goes
   * through `onNotificationClick` with the action's `link` as the
   * notification link, so the host keeps control of navigation.
   */
  actions?: NotificationLinkAction[]
}

/** A toast action that navigates to `link` through the host click handler. */
export interface NotificationLinkAction {
  label: string
  link: string
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
  /** Shown while the first list request is in flight. */
  loading?: string
  /** Shown when the list request fails. */
  error?: string
  /** Retry button in the error state. */
  retry?: string
  /** aria-label / title of the per-row delete button (needs `onDelete`). */
  delete?: string
  /** Label of the delete button after the first click (needs a 2nd click). */
  confirmDelete?: string
  /** Live-region announcement after the first Delete key press on a row. */
  confirmDeleteKey?: string
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

  // ---- Configurable list contract (all optional; defaults = legacy) -------
  /**
   * Query params of the list request. Defaults to
   * `{ orderBy: 'created_at', orderDir: 'desc', per_page }`.
   *
   * The result is serialized on every render to detect changes, so a function
   * must be deterministic (no `Date.now()`, random values or fresh objects with
   * unstable content) or the list is refetched on every render. A function that
   * throws or returns something non-serializable does not break rendering.
   */
  listParams?:
    | Record<string, unknown>
    | ((perPage: number) => Record<string, unknown>)
  /**
   * Reads the list response body. Defaults to `body.data ?? []`.
   * `unreadCount` (when returned) wins over the locally computed count.
   */
  parseList?: (body: unknown) => NotificationListResult
  /**
   * Maps a raw row (list element or live payload) to a `NotificationItem`.
   * For hosts whose wire format differs (`read_at`, `action_url`, …).
   */
  normalizeItem?: (raw: unknown) => NotificationItem

  // ---- Injectable actions ------------------------------------------------
  /** Replaces the default `PATCH ${apiBasePath}/${id}`. Optimistic + rollback. */
  onMarkRead?: (ids: Array<NotificationId>) => Promise<void>
  /**
   * Replaces the default one-PATCH-per-item "mark all". Falls back to
   * `onMarkRead(unreadIds)` when only that one is given.
   */
  onMarkAllRead?: () => Promise<void>
  /**
   * When given, each row shows a delete button (2nd click confirms). Keyboard:
   * focus the row and press Delete twice (announced via a live region).
   */
  onDelete?: (id: NotificationId) => Promise<void>

  // ---- Unread counter ----------------------------------------------------
  /** Server-side unread count, e.g. `GET /notifications/unread-count`. */
  fetchUnreadCount?: () => Promise<number>
  /** Poll interval for `fetchUnreadCount` (visible tab only). 0/undefined = off. */
  unreadPollMs?: number
  /** Badge cap; above it renders `${badgeMax}+`. Defaults to 99. */
  badgeMax?: number
  /** aria-label of the trigger button, given the unread count. */
  triggerAriaLabel?: (unread: number) => string

  // ---- Realtime ----------------------------------------------------------
  /**
   * Called once per NEW live notification (after dedup) with the raw payload
   * and the normalized item. For sound, query invalidation, hidden-tab push…
   */
  onIngest?: (payload: NotificationWsPayload, item: NotificationItem) => void

  // ---- UI ----------------------------------------------------------------
  /** Extra footer (e.g. "Ver todas"). The function form receives `close`. */
  footer?: ReactNode | ((close: () => void) => ReactNode)
  /**
   * Menu behaviour after clicking an item. Unset (default) keeps the Radix
   * behaviour the dropdown always had (the menu closes on select); `true`
   * also closes it explicitly; `false` keeps it open.
   */
  closeOnClick?: boolean
  /** Custom avatar for each row (replaces the built-in one). */
  renderAvatar?: (item: NotificationItem) => ReactNode
  /**
   * Render bodies through the HTML sanitizer (default true). Pass `false`
   * for user-authored content: the body is then plain text (React-escaped).
   */
  richText?: boolean
  /** Reload the page after the user grants push permission. Default true. */
  reloadAfterPermission?: boolean
  /**
   * Render the "loading" and "error + retry" states of the list. Default
   * `false` (legacy): the empty message is shown while loading and when the
   * request fails, exactly as before.
   */
  showLoadStates?: boolean
}

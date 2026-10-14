import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as LucideIcons from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@asteby/metacore-ui/primitives'
import { useWebSocketMessage } from '@asteby/metacore-websocket/hooks'
import type { WebSocketMessage } from '@asteby/metacore-websocket'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'

import { useAppBadge } from './hooks'
import { subscribeNotificationSSE } from './sse'
import { showNotificationToast } from './toast'
import { formatNotificationBodyHtml } from './rich-text'
import {
  moduleLabelFromMeta,
  parseNotificationMeta,
  resolveNotificationIcon,
  resolveNotificationTone,
} from './visual'
import type {
  NotificationId,
  NotificationItem,
  NotificationLinkAction,
  NotificationListResult,
  NotificationWsPayload,
  NotificationsDropdownLabels,
  NotificationsDropdownProps,
} from './types'

const DEFAULT_LABELS: Required<NotificationsDropdownLabels> = {
  title: 'Notificaciones',
  newBadge: (count) => `${count} nuevas`,
  empty: 'No tienes notificaciones',
  markAllAsRead: 'Marcar todo como leído',
  enableNotifications: 'Activar notificaciones',
  notificationsEnabled: '¡Notificaciones activadas!',
  permissionsBlocked: 'Permisos bloqueados por el navegador',
  permissionsBlockedDescription:
    'Debes habilitarlas desde el icono en la barra de direcciones.',
  permissionRequestFailed: 'No se pudo abrir la solicitud de permisos',
  permissionRequired: 'Permisos requeridos',
  srLabel: 'Notificaciones',
  loading: 'Cargando…',
  error: 'No se pudieron cargar las notificaciones',
  retry: 'Reintentar',
  delete: 'Eliminar notificación',
  confirmDelete: 'Pulsa de nuevo para eliminar',
  confirmDeleteKey: 'Pulsa Supr otra vez para eliminar',
}

type Locale = Parameters<typeof formatDistanceToNow>[1] extends
  | { locale?: infer L }
  | undefined
  ? NonNullable<L>
  : never

/** Default list contract: `{ data: NotificationItem[] }`. */
function defaultParseList(body: unknown): NotificationListResult {
  const data = (body as { data?: unknown } | null | undefined)?.data
  return { items: Array.isArray(data) ? data : [] }
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  const first = parts[0]![0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : ''
  return (first + last).toUpperCase()
}

function sameId(a: NotificationId, b: NotificationId): boolean {
  return String(a) === String(b)
}

/**
 * Bell-icon dropdown: REST list + live ingest (SSE preferred, WebSocket
 * fallback) + optional canonical card toast on every new item.
 *
 * Every prop beyond `apiClient` / `apiBasePath` is optional; without them the
 * component keeps its original contract (`{ data: [] }` list, one PATCH per
 * item, local unread count).
 */
export function NotificationsDropdown({
  apiClient,
  apiBasePath,
  enableBadge = true,
  onNotificationClick,
  perPage = 20,
  locale = es,
  labels: labelsOverride,
  resolveImageUrl,
  subscribeToNotifications,
  sseUrl,
  sseAccessToken,
  preferSse,
  showToastOnIngest = true,
  listParams,
  parseList,
  normalizeItem,
  onMarkRead,
  onMarkAllRead,
  onDelete,
  fetchUnreadCount,
  unreadPollMs,
  badgeMax = 99,
  triggerAriaLabel,
  onIngest,
  footer,
  closeOnClick,
  renderAvatar,
  richText = true,
  reloadAfterPermission = true,
  showLoadStates = false,
}: NotificationsDropdownProps) {
  const labels = useMemo<Required<NotificationsDropdownLabels>>(
    () => ({ ...DEFAULT_LABELS, ...labelsOverride }),
    [labelsOverride],
  )

  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [open, setOpen] = useState(false)
  const { setBadge } = useAppBadge()
  const seenIdsRef = useRef<Set<string>>(new Set())
  const requestSeqRef = useRef(0)

  // Latest-props refs: callbacks stay referentially stable (the live
  // subscriptions must not reconnect when a host passes inline functions).
  const latest = {
    apiClient,
    apiBasePath,
    perPage,
    listParams,
    parseList,
    normalizeItem,
    onMarkRead,
    onMarkAllRead,
    onDelete,
    fetchUnreadCount,
    onIngest,
    onNotificationClick,
    richText,
  }
  const latestRef = useRef(latest)
  latestRef.current = latest
  const notificationsRef = useRef(notifications)
  notificationsRef.current = notifications
  const unreadCountRef = useRef(unreadCount)
  unreadCountRef.current = unreadCount
  // Optimistic actions in flight. The unread poll ignores any result that
  // overlaps an action (it would overwrite the optimistic counter).
  const inflightRef = useRef(0)
  const epochRef = useRef(0)
  // Rows removed optimistically by a pending delete, with their CURRENT
  // is_read, so a failed delete restores the up-to-date state.
  const pendingDeletesRef = useRef<Map<string, NotificationItem>>(new Map())

  /** Apply a list update synchronously to the ref too, so chained rollbacks see it. */
  const commitList = (fn: (prev: NotificationItem[]) => NotificationItem[]) => {
    const next = fn(notificationsRef.current)
    notificationsRef.current = next
    setNotifications(next)
  }
  const commitCount = (fn: (prev: number) => number) => {
    const next = fn(unreadCountRef.current)
    unreadCountRef.current = next
    setUnreadCount(next)
  }
  const trackAction = async <T,>(run: () => Promise<T>): Promise<T> => {
    inflightRef.current += 1
    epochRef.current += 1
    try {
      return await run()
    } finally {
      inflightRef.current -= 1
      epochRef.current += 1
    }
  }

  useEffect(() => {
    if (!enableBadge) return
    setBadge(unreadCount)
  }, [unreadCount, setBadge, enableBadge])

  const resolveParams = (): Record<string, unknown> => {
    const lp = latestRef.current.listParams
    const pp = latestRef.current.perPage
    if (typeof lp === 'function') return lp(pp)
    if (lp) return lp
    return { orderBy: 'created_at', orderDir: 'desc', per_page: pp }
  }
  // A non-serializable / throwing `listParams` must never break rendering; the
  // request itself reports the failure through the error state.
  let paramsKey: string
  try {
    paramsKey = JSON.stringify(resolveParams())
  } catch {
    paramsKey = '__unserializable__'
  }

  const toItem = (raw: unknown): NotificationItem => {
    const fn = latestRef.current.normalizeItem
    return fn ? fn(raw) : (raw as NotificationItem)
  }

  const fetchNotifications = useCallback(async () => {
    const seq = ++requestSeqRef.current
    try {
      setLoading(true)
      setError(null)
      const cur = latestRef.current
      const response = await cur.apiClient.get<unknown>(cur.apiBasePath, {
        params: resolveParams(),
      })
      if (seq !== requestSeqRef.current) return
      const parsed = (cur.parseList ?? defaultParseList)(response.data)
      const items = parsed.items.map(toItem)
      commitList(() => items)
      commitCount(() =>
        typeof parsed.unreadCount === 'number'
          ? parsed.unreadCount
          : items.filter((n) => !n.is_read).length,
      )
      seenIdsRef.current = new Set(items.map((n) => String(n.id)))
    } catch (err) {
      if (seq !== requestSeqRef.current) return
      setError(err)
      // eslint-disable-next-line no-console
      console.error('Failed to fetch notifications:', err)
    } finally {
      if (seq === requestSeqRef.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void fetchNotifications()
  }, [fetchNotifications, apiBasePath, perPage, paramsKey])

  // Server-side unread counter polling (visible tab only).
  const hasUnreadFetcher = Boolean(fetchUnreadCount)
  useEffect(() => {
    if (!hasUnreadFetcher || !unreadPollMs || unreadPollMs <= 0) return
    if (typeof document === 'undefined') return
    let cancelled = false
    const poll = async () => {
      if (document.visibilityState !== 'visible') return
      const fn = latestRef.current.fetchUnreadCount
      if (!fn) return
      const startEpoch = epochRef.current
      try {
        const n = await fn()
        // An optimistic action started or finished while the poll was in
        // flight: its result may predate the action, so drop it (the next
        // tick reconciles).
        if (inflightRef.current > 0 || epochRef.current !== startEpoch) return
        if (!cancelled && typeof n === 'number' && Number.isFinite(n)) {
          commitCount(() => Math.max(0, n))
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch unread count:', err)
      }
    }
    const timer = setInterval(() => void poll(), unreadPollMs)
    const onVisible = () => void poll()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [hasUnreadFetcher, unreadPollMs])

  const ingestWsPayload = useCallback(
    (payload: NotificationWsPayload) => {
      // Deterministic id BEFORE the random fallback: the same notification
      // arrives over BOTH transports (WS frame + SSE, by design — SSE can
      // drop frames), and only one of the two paths used to synthesize a
      // stable id. The other fell straight to randomUUID, so seenIdsRef
      // could never collapse the pair → duplicate toast + bell entry for
      // every declarative notification. Derive the same `ntf:` identity from
      // the payload's metadata on every path; random stays as last resort
      // for payloads with no distinguishing fields at all.
      const earlyMeta =
        typeof payload.metadata === 'object' && payload.metadata
          ? (payload.metadata as Record<string, unknown>)
          : parseNotificationMeta(
              typeof payload.metadata === 'string' ? payload.metadata : undefined,
            )
      const recordId = earlyMeta.record_id as string | undefined
      const eventKey = (earlyMeta.event ?? earlyMeta.rule) as string | undefined
      const hasPayloadId = payload.id !== undefined && payload.id !== null && payload.id !== ''
      // `payload.id` of 0 is a valid id: test for null/undefined/'' only.
      const id: NotificationId = hasPayloadId
        ? (payload.id as NotificationId)
        : recordId && eventKey
          ? `ntf:${eventKey}:${recordId}`
          : typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`

      const baseMeta =
        typeof payload.metadata === 'object' && payload.metadata
          ? { ...payload.metadata }
          : parseNotificationMeta(
              typeof payload.metadata === 'string' ? payload.metadata : undefined,
            )
      if (payload.addon_key) baseMeta.addon_key = payload.addon_key
      if (payload.apartado) baseMeta.apartado = payload.apartado
      if (payload.color) baseMeta.color = payload.color

      const metadataStr =
        typeof payload.metadata === 'string'
          ? payload.metadata
          : JSON.stringify(baseMeta)

      let newNotification: NotificationItem = {
        id,
        title: payload.title,
        message: payload.body || payload.message || payload.description || '',
        type: payload.type || 'info',
        is_read: false,
        created_at: new Date().toISOString(),
        link: payload.link,
        icon: payload.icon,
        image: payload.image,
        metadata: metadataStr,
        conversation_id: payload.conversation_id,
      }

      let metaObj = baseMeta
      const normalize = latestRef.current.normalizeItem
      if (normalize) {
        try {
          const normalized = normalize(payload)
          const hasId =
            normalized.id !== undefined && normalized.id !== null && normalized.id !== ''
          newNotification = { ...normalized, id: hasId ? normalized.id : id }
          metaObj =
            typeof normalized.metadata === 'object' && normalized.metadata
              ? { ...normalized.metadata }
              : parseNotificationMeta(
                  typeof normalized.metadata === 'string' ? normalized.metadata : undefined,
                )
          if (payload.addon_key) metaObj.addon_key = payload.addon_key
          if (payload.apartado) metaObj.apartado = payload.apartado
          if (payload.color) metaObj.color = payload.color
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('normalizeItem failed for a live notification:', err)
        }
      }

      const key = String(newNotification.id)
      if (seenIdsRef.current.has(key)) return
      seenIdsRef.current.add(key)

      commitList((prev) => [newNotification, ...prev])
      commitCount((prev) => prev + 1)

      // Quiet frames from POST /notifications/me already toasted on the client.
      const skipToast =
        Boolean((payload as { skip_toast?: boolean }).skip_toast) ||
        metaObj.skip_toast === true ||
        metaObj.source === 'toast'

      if (showToastOnIngest && !skipToast) {
        const openNotification = (target: NotificationItem) => {
          const click = latestRef.current.onNotificationClick
          if (click) click(target)
          else if (target.link?.startsWith('http'))
            window.open(target.link, '_blank', 'noopener,noreferrer')
        }
        const summary =
          typeof payload.summary === 'string'
            ? payload.summary
            : typeof metaObj.summary === 'string'
              ? metaObj.summary
              : undefined
        const actions = linkActions(payload.actions ?? metaObj.actions).map((a) => ({
          label: a.label,
          onClick: () => openNotification({ ...newNotification, link: a.link }),
        }))
        showNotificationToast({
          // String id with a prefix: a raw numeric id could collide with
          // sonner's own auto-incremented numeric toast ids.
          id: `ntf-${String(newNotification.id)}`,
          title: newNotification.title,
          body: newNotification.message || undefined,
          type: newNotification.type || 'info',
          icon: newNotification.icon,
          image: newNotification.image,
          apartado: payload.apartado,
          addonKey: payload.addon_key || (metaObj.addon_key as string | undefined),
          metadata: metaObj,
          richText: latestRef.current.richText,
          summary,
          actions: actions.length ? actions : undefined,
          onClick: () => openNotification(newNotification),
        })
      }

      const ingestHook = latestRef.current.onIngest
      if (ingestHook) {
        try {
          ingestHook(payload, newNotification)
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('onIngest handler failed:', err)
        }
      }

      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'default' &&
        !(window as unknown as { __mcPushPromptDispatched?: boolean }).__mcPushPromptDispatched
      ) {
        // Once per page load — the prompt component coalesces by toast id;
        // don't spam the event on every SSE/WS ingest.
        ;(window as unknown as { __mcPushPromptDispatched?: boolean }).__mcPushPromptDispatched =
          true
        window.dispatchEvent(new CustomEvent('show-notification-prompt'))
      }
    },
    [showToastOnIngest],
  )

  const useCustomSubscription = Boolean(subscribeToNotifications)
  const useSse = Boolean(sseUrl)
  const skipBuiltInWs = useCustomSubscription || (useSse && preferSse !== false)

  useEffect(() => {
    if (!useCustomSubscription || !subscribeToNotifications) return
    const unsub = subscribeToNotifications(ingestWsPayload)
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [useCustomSubscription, subscribeToNotifications, ingestWsPayload])

  useEffect(() => {
    if (!useSse || !sseUrl) return
    return subscribeNotificationSSE({
      url: sseUrl,
      accessToken: sseAccessToken,
      onMessage: ingestWsPayload,
    })
  }, [useSse, sseUrl, sseAccessToken, ingestWsPayload])

  /**
   * Undo an optimistic "mark read". Only rows that are still present AND
   * currently read are reverted (and counted): rows deleted meanwhile or
   * already reverted must not inflate the counter.
   */
  const rollbackRead = (ids: NotificationId[]) => {
    const has = (n: NotificationItem) => ids.some((id) => sameId(id, n.id))
    const reverted = notificationsRef.current.filter((n) => n.is_read && has(n)).length
    if (reverted > 0) {
      commitList((prev) => prev.map((n) => (n.is_read && has(n) ? { ...n, is_read: false } : n)))
      commitCount((prev) => prev + reverted)
    }
    // A row being deleted right now keeps its up-to-date flag for its own rollback.
    for (const [key, row] of pendingDeletesRef.current) {
      if (row.is_read && has(row)) pendingDeletesRef.current.set(key, { ...row, is_read: false })
    }
  }

  const markRead = async (ids: NotificationId[]) => {
    const targets = notificationsRef.current
      .filter((n) => !n.is_read && ids.some((id) => sameId(id, n.id)))
      .map((n) => n.id)
    if (targets.length === 0) return
    commitList((prev) =>
      prev.map((n) =>
        targets.some((id) => sameId(id, n.id)) ? { ...n, is_read: true } : n,
      ),
    )
    commitCount((prev) => Math.max(0, prev - targets.length))
    const cur = latestRef.current
    await trackAction(async () => {
      if (cur.onMarkRead) {
        try {
          await cur.onMarkRead(targets)
        } catch (err) {
          rollbackRead(targets)
          // eslint-disable-next-line no-console
          console.error('Failed to mark notification as read:', err)
        }
        return
      }
      try {
        await Promise.all(
          targets.map((id) =>
            cur.apiClient.patch(`${cur.apiBasePath}/${id}`, { is_read: true }),
          ),
        )
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to mark notification as read:', err)
      }
    })
  }

  const markAllRead = async () => {
    const unreadIds = notificationsRef.current.filter((n) => !n.is_read).map((n) => n.id)
    const cur = latestRef.current
    // Only `onMarkRead` given and nothing unread locally: no empty call.
    if (!cur.onMarkAllRead && cur.onMarkRead && unreadIds.length === 0) return
    commitList((prev) => prev.map((n) => (n.is_read ? n : { ...n, is_read: true })))
    commitCount(() => 0)
    const custom =
      cur.onMarkAllRead ??
      (cur.onMarkRead ? () => cur.onMarkRead!(unreadIds) : undefined)
    await trackAction(async () => {
      if (custom) {
        try {
          await custom()
        } catch (err) {
          // Incremental rollback: count only the rows still present that
          // were unread; live notifications that arrived meanwhile stay.
          const has = (n: NotificationItem) => unreadIds.some((id) => sameId(id, n.id))
          const reverted = notificationsRef.current.filter((n) => n.is_read && has(n)).length
          commitList((prev) => prev.map((n) => (n.is_read && has(n) ? { ...n, is_read: false } : n)))
          commitCount((prev) => prev + reverted)
          // eslint-disable-next-line no-console
          console.error('Failed to mark all as read:', err)
        }
        return
      }
      try {
        await Promise.all(
          unreadIds.map((id) =>
            cur.apiClient.patch(`${cur.apiBasePath}/${id}`, { is_read: true }),
          ),
        )
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to mark all as read:', err)
      }
    })
  }

  const deleteItem = async (id: NotificationId) => {
    const remove = latestRef.current.onDelete
    if (!remove) return
    const list = notificationsRef.current
    const index = list.findIndex((n) => sameId(n.id, id))
    if (index < 0) return
    const removed = list[index]!
    const key = String(id)
    pendingDeletesRef.current.set(key, removed)
    commitList((prev) => prev.filter((n) => !sameId(n.id, id)))
    if (!removed.is_read) commitCount((prev) => Math.max(0, prev - 1))
    await trackAction(async () => {
      try {
        await remove(id)
        pendingDeletesRef.current.delete(key)
      } catch (err) {
        // Restore with the CURRENT read flag (a concurrent rollback may have
        // flipped it while the row was out of the list).
        const restored = pendingDeletesRef.current.get(key) ?? removed
        pendingDeletesRef.current.delete(key)
        if (!notificationsRef.current.some((n) => sameId(n.id, id))) {
          commitList((prev) => {
            const next = prev.slice()
            next.splice(Math.min(index, next.length), 0, restored)
            return next
          })
          if (!restored.is_read) commitCount((prev) => prev + 1)
        }
        // eslint-disable-next-line no-console
        console.error('Failed to delete notification:', err)
      }
    })
  }

  const shellProps: InnerDropdownProps = {
    labels,
    locale,
    notifications,
    unreadCount,
    isLoading: showLoadStates && isLoading,
    error: showLoadStates ? error : null,
    onRetry: () => void fetchNotifications(),
    resolveImageUrl,
    onNotificationClick,
    onMarkAsRead: (id) => markRead([id]),
    onMarkAllAsRead: markAllRead,
    onDelete: onDelete ? deleteItem : undefined,
    badgeMax,
    triggerAriaLabel,
    footer,
    closeOnClick,
    renderAvatar,
    richText,
    reloadAfterPermission,
    open,
    onOpenChange: setOpen,
  }

  return skipBuiltInWs ? (
    <DropdownShell {...shellProps} />
  ) : (
    <DropdownWithWebSocket ingestWsPayload={ingestWsPayload} {...shellProps} />
  )
}

interface InnerDropdownProps {
  labels: Required<NotificationsDropdownLabels>
  locale: Locale
  notifications: NotificationItem[]
  unreadCount: number
  isLoading: boolean
  error: unknown
  onRetry: () => void
  resolveImageUrl?: (src: string) => string
  onMarkAsRead: (id: NotificationId) => void | Promise<void>
  onMarkAllAsRead: () => void | Promise<void>
  onDelete?: (id: NotificationId) => void | Promise<void>
  onNotificationClick?: (notification: NotificationItem) => void
  badgeMax: number
  triggerAriaLabel?: (unread: number) => string
  footer?: ReactNode | ((close: () => void) => ReactNode)
  closeOnClick?: boolean
  renderAvatar?: (item: NotificationItem) => ReactNode
  richText: boolean
  reloadAfterPermission: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface DropdownWithWebSocketProps extends InnerDropdownProps {
  ingestWsPayload: (payload: NotificationWsPayload) => void
}

interface WsNotificationMessage
  extends WebSocketMessage<'NOTIFICATION', NotificationWsPayload> {}

function DropdownWithWebSocket({
  ingestWsPayload,
  ...rest
}: DropdownWithWebSocketProps) {
  useWebSocketMessage<WsNotificationMessage>('NOTIFICATION', (message) => {
    if (message.payload) ingestWsPayload(message.payload)
  })
  return <DropdownShell {...rest} />
}

/** Max toast actions taken from a live payload. */
const MAX_LIVE_ACTIONS = 3

/** Validates `actions` from an untrusted live payload: `{label, link}` only. */
export function linkActions(value: unknown): NotificationLinkAction[] {
  if (!Array.isArray(value)) return []
  const out: NotificationLinkAction[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const { label, link } = item as Record<string, unknown>
    if (typeof label !== 'string' || typeof link !== 'string') continue
    const l = label.trim()
    const href = link.trim()
    if (!l || !href) continue
    out.push({ label: l.slice(0, 40), link: href })
    if (out.length >= MAX_LIVE_ACTIONS) break
  }
  return out
}

const MESSAGE_CLASS =
  'line-clamp-2 text-[11px] leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground/85 [&_b]:font-semibold [&_b]:text-foreground/85 [&_em]:italic [&_i]:italic [&_u]:underline [&_mark]:rounded-sm [&_mark]:bg-amber-500/20 [&_mark]:px-0.5 [&_mark]:text-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[10px] [&_code]:text-foreground'

function relativeTime(createdAt: string, locale: Locale): string {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return ''
  return formatDistanceToNow(date, { addSuffix: true, locale })
}

function DropdownShell({
  labels,
  locale,
  notifications,
  unreadCount,
  isLoading,
  error,
  onRetry,
  resolveImageUrl,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onNotificationClick,
  badgeMax,
  triggerAriaLabel,
  footer,
  closeOnClick,
  renderAvatar,
  richText,
  reloadAfterPermission,
  open,
  onOpenChange,
}: InnerDropdownProps) {
  const notificationApiAvailable =
    typeof window !== 'undefined' && 'Notification' in window
  const permission: NotificationPermission | null = notificationApiAvailable
    ? Notification.permission
    : null
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='relative'
          aria-label={triggerAriaLabel ? triggerAriaLabel(unreadCount) : undefined}
        >
          {notificationApiAvailable && permission !== 'granted' ? (
            <div className='relative'>
              <LucideIcons.BellOff className='h-[1.2rem] w-[1.2rem] text-muted-foreground' />
              {permission === 'default' && (
                <span
                  className='absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-yellow-500 ring-2 ring-background'
                  title={labels.permissionRequired}
                />
              )}
            </div>
          ) : (
            <LucideIcons.Bell className='h-[1.2rem] w-[1.2rem] text-foreground' />
          )}

          {unreadCount > 0 && (
            <span className='absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background'>
              {unreadCount > badgeMax ? `${badgeMax}+` : unreadCount}
            </span>
          )}
          <span className='sr-only'>{labels.srLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className='w-[min(100vw-1.5rem,22rem)] overflow-hidden p-0 sm:w-96'
        align='end'
        forceMount
      >
        <div className='sr-only' role='status' aria-live='polite'>
          {confirmDeleteId ? labels.confirmDeleteKey : ''}
        </div>
        <DropdownMenuLabel className='border-b px-4 py-3 font-normal'>
          <div className='flex items-center justify-between gap-3'>
            <p className='text-sm font-semibold text-foreground'>{labels.title}</p>
            {unreadCount > 0 ? (
              <span className='rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary'>
                {labels.newBadge(unreadCount)}
              </span>
            ) : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuGroup className='max-h-[min(24rem,60vh)] overflow-y-auto py-1'>
          {notifications.length === 0 && isLoading ? (
            <div
              className='px-4 py-10 text-center text-sm text-muted-foreground'
              role='status'
              data-state='loading'
            >
              {labels.loading}
            </div>
          ) : notifications.length === 0 && error ? (
            <div
              className='flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground'
              role='alert'
              data-state='error'
            >
              <span>{labels.error}</span>
              <Button variant='outline' size='sm' className='h-8 text-xs' onClick={onRetry}>
                {labels.retry}
              </Button>
            </div>
          ) : notifications.length === 0 ? (
            <div className='px-4 py-10 text-center text-sm text-muted-foreground'>
              {labels.empty}
            </div>
          ) : (
            notifications.map((notification) => {
              const meta = parseNotificationMeta(notification.metadata)
              const Icon = resolveNotificationIcon(notification.icon, notification.type)
              const tone = resolveNotificationTone(notification.type, meta)
              const mod = moduleLabelFromMeta(meta)
              const unread = !notification.is_read
              const idKey = String(notification.id)
              const confirming = confirmDeleteId === idKey
              return (
                <DropdownMenuItem
                  key={idKey}
                  className={[
                    'cursor-pointer rounded-none border-0 px-3 py-1.5 focus:bg-muted/50 data-[highlighted]:bg-muted/50 sm:px-3.5',
                    unread ? 'bg-primary/[0.035]' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-keyshortcuts={onDelete ? 'Delete' : undefined}
                  onMouseLeave={() => {
                    if (confirming) setConfirmDeleteId(null)
                  }}
                  onBlur={(event) => {
                    // Focus left the row (arrow keys, Tab, outside click).
                    if (
                      confirming &&
                      !event.currentTarget.contains(event.relatedTarget as Node | null)
                    ) {
                      setConfirmDeleteId(null)
                    }
                  }}
                  onKeyDown={(event) => {
                    // Keyboard path for deletion: the trash button inside a
                    // menuitem is not reachable (Radix only focuses items).
                    if (!onDelete || event.key !== 'Delete') return
                    event.preventDefault()
                    event.stopPropagation()
                    if (!confirming) {
                      setConfirmDeleteId(idKey)
                      return
                    }
                    setConfirmDeleteId(null)
                    void onDelete(notification.id)
                  }}
                  onSelect={(event) => {
                    // Radix closes the menu on select (legacy behaviour).
                    // closeOnClick={false} opts into keeping it open.
                    if (closeOnClick === false) event.preventDefault()
                  }}
                  onClick={() => {
                    if (unread) void onMarkAsRead(notification.id)
                    if (onNotificationClick) {
                      onNotificationClick(notification)
                    } else if (
                      notification.link &&
                      notification.link.startsWith('http')
                    ) {
                      window.open(notification.link, '_blank', 'noopener,noreferrer')
                    }
                    if (closeOnClick === true) close()
                  }}
                >
                  <div className='flex w-full items-center gap-2.5'>
                    {renderAvatar ? (
                      <div className='shrink-0'>{renderAvatar(notification)}</div>
                    ) : (
                      <NotificationAvatar
                        notification={notification}
                        Icon={Icon}
                        toneClass={tone.iconClass}
                        customColor={tone.customColor}
                        resolveImageUrl={resolveImageUrl}
                      />
                    )}

                    <div className='min-w-0 flex-1 space-y-0.5'>
                      <div className='flex items-start justify-between gap-2'>
                        <p
                          className={[
                            'truncate text-[13px] leading-snug',
                            unread
                              ? 'font-semibold text-foreground'
                              : 'font-medium text-foreground/90',
                          ].join(' ')}
                        >
                          {notification.title}
                        </p>
                        <div className='mt-0.5 flex shrink-0 items-center gap-1.5'>
                          <span className='whitespace-nowrap text-[10px] tabular-nums text-muted-foreground'>
                            {relativeTime(notification.created_at, locale)}
                          </span>
                          {unread ? (
                            <span
                              className='h-1.5 w-1.5 rounded-full bg-primary'
                              aria-hidden
                            />
                          ) : null}
                        </div>
                      </div>
                      {notification.message ? (
                        richText ? (
                          <p
                            className={MESSAGE_CLASS}
                            dangerouslySetInnerHTML={{
                              __html: formatNotificationBodyHtml(notification.message),
                            }}
                          />
                        ) : (
                          <p className={MESSAGE_CLASS}>{notification.message}</p>
                        )
                      ) : null}
                      {mod ? (
                        <span className='inline-flex max-w-full truncate rounded px-1 py-px text-[10px] font-medium text-muted-foreground ring-1 ring-border/70'>
                          {mod}
                        </span>
                      ) : null}
                    </div>
                    {onDelete ? (
                      <button
                        type='button'
                        // Pointer-only affordance: an interactive control inside
                        // role=menuitem violates ARIA; keyboard users use Delete.
                        aria-hidden
                        tabIndex={-1}
                        data-confirming={confirming ? 'true' : undefined}
                        aria-label={confirming ? labels.confirmDelete : labels.delete}
                        title={confirming ? labels.confirmDelete : labels.delete}
                        className={[
                          'inline-flex h-6 shrink-0 items-center justify-center rounded px-1.5 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                          confirming ? 'bg-destructive/10 text-destructive' : 'opacity-60 hover:opacity-100',
                        ].join(' ')}
                        onBlur={() => {
                          if (confirming) setConfirmDeleteId(null)
                        }}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          if (!confirming) {
                            setConfirmDeleteId(idKey)
                            return
                          }
                          setConfirmDeleteId(null)
                          void onDelete(notification.id)
                        }}
                      >
                        <LucideIcons.Trash2 className='h-3.5 w-3.5' aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </DropdownMenuItem>
              )
            })
          )}
        </DropdownMenuGroup>
        {notifications.length > 0 ? (
          <div className='border-t bg-popover p-1.5'>
            <Button
              variant='ghost'
              size='sm'
              className='h-8 w-full text-xs text-muted-foreground hover:text-foreground'
              onClick={() => void onMarkAllAsRead()}
            >
              {labels.markAllAsRead}
            </Button>
          </div>
        ) : null}
        {footer ? (
          <div className='border-t bg-popover p-1.5'>
            {typeof footer === 'function' ? footer(close) : footer}
          </div>
        ) : null}
        {notificationApiAvailable && permission !== 'granted' ? (
          <div className='border-t bg-popover p-1.5'>
            <Button
              variant='outline'
              size='sm'
              className='h-8 w-full gap-2 border-primary/25 bg-primary/5 text-xs text-primary hover:bg-primary/10'
              onClick={async () => {
                try {
                  const next = await Notification.requestPermission()
                  if (next === 'granted') {
                    toast.success(labels.notificationsEnabled)
                    if (reloadAfterPermission) {
                      setTimeout(() => window.location.reload(), 1500)
                    }
                  } else {
                    toast.error(labels.permissionsBlocked, {
                      description: labels.permissionsBlockedDescription,
                    })
                  }
                } catch {
                  toast.error(labels.permissionRequestFailed)
                }
              }}
            >
              <LucideIcons.BellRing className='h-3 w-3' />
              {labels.enableNotifications}
            </Button>
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationAvatar({
  notification,
  Icon,
  toneClass,
  customColor,
  resolveImageUrl,
}: {
  notification: NotificationItem
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  toneClass: string
  customColor?: string
  resolveImageUrl?: (src: string) => string
}) {
  const [failed, setFailed] = useState(false)
  const raw = (notification.image || notification.user?.avatar || '').trim()
  const resolved = raw && !failed ? (resolveImageUrl ? resolveImageUrl(raw) : raw) : ''
  const showPhoto = Boolean(resolved)

  if (showPhoto) {
    return (
      <div className='relative shrink-0'>
        <img
          src={resolved}
          alt=''
          className='h-7 w-7 rounded-full object-cover'
          onError={() => setFailed(true)}
        />
        <div className='absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-background text-primary ring-1 ring-border'>
          <Icon className='size-2.5 text-current' strokeWidth={2.5} />
        </div>
      </div>
    )
  }

  const initials = notification.user?.name ? initialsOf(notification.user.name) : ''
  if (initials) {
    return (
      <div
        className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground'
        aria-hidden
      >
        {initials}
      </div>
    )
  }

  return (
    <div
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${toneClass}`}
      style={customColor ? { backgroundColor: customColor, color: '#fff' } : undefined}
    >
      <Icon className='h-3.5 w-3.5 text-white' strokeWidth={2.5} />
    </div>
  )
}

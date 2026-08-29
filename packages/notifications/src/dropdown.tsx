import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  NotificationItem,
  NotificationWsPayload,
  NotificationsDropdownLabels,
  NotificationsDropdownProps,
} from './types'

const DEFAULT_LABELS: NotificationsDropdownLabels = {
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
}

type Locale = Parameters<typeof formatDistanceToNow>[1] extends
  | { locale?: infer L }
  | undefined
  ? NonNullable<L>
  : never

/**
 * Bell-icon dropdown: REST list + live ingest (SSE preferred, WebSocket
 * fallback) + optional canonical card toast on every new item.
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
}: NotificationsDropdownProps) {
  const labels = useMemo<NotificationsDropdownLabels>(
    () => ({ ...DEFAULT_LABELS, ...labelsOverride }),
    [labelsOverride],
  )

  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [, setLoading] = useState(false)
  const { setBadge } = useAppBadge()
  const seenIdsRef = useRef<Set<string>>(new Set())

  const apiClientRef = useRef(apiClient)
  apiClientRef.current = apiClient
  const basePathRef = useRef(apiBasePath)
  basePathRef.current = apiBasePath

  useEffect(() => {
    if (!enableBadge) return
    setBadge(unreadCount)
  }, [unreadCount, setBadge, enableBadge])

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true)
      const response = await apiClientRef.current.get<{ data?: NotificationItem[] }>(
        basePathRef.current,
        {
          params: {
            orderBy: 'created_at',
            orderDir: 'desc',
            per_page: perPage,
          },
        },
      )
      const items = response.data?.data ?? []
      setNotifications(items)
      setUnreadCount(items.filter((n) => !n.is_read).length)
      seenIdsRef.current = new Set(items.map((n) => n.id))
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch notifications:', error)
    } finally {
      setLoading(false)
    }
  }, [perPage])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications, apiBasePath])

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
      const id =
        payload.id ||
        (recordId && eventKey ? `ntf:${eventKey}:${recordId}` : '') ||
        (typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`)

      if (seenIdsRef.current.has(id)) return
      seenIdsRef.current.add(id)

      const metaObj =
        typeof payload.metadata === 'object' && payload.metadata
          ? { ...payload.metadata }
          : parseNotificationMeta(
              typeof payload.metadata === 'string' ? payload.metadata : undefined,
            )
      if (payload.addon_key) metaObj.addon_key = payload.addon_key
      if (payload.apartado) metaObj.apartado = payload.apartado
      if (payload.color) metaObj.color = payload.color

      const metadataStr =
        typeof payload.metadata === 'string'
          ? payload.metadata
          : JSON.stringify(metaObj)

      const newNotification: NotificationItem = {
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
      setNotifications((prev) => [newNotification, ...prev])
      setUnreadCount((prev) => prev + 1)

      // Quiet frames from POST /notifications/me already toasted on the client.
      const skipToast =
        Boolean((payload as { skip_toast?: boolean }).skip_toast) ||
        metaObj.skip_toast === true ||
        metaObj.source === 'toast'

      if (showToastOnIngest && !skipToast) {
        showNotificationToast({
          id,
          title: payload.title,
          body: payload.body || payload.message || payload.description,
          type: payload.type || 'info',
          icon: payload.icon,
          image: payload.image,
          apartado: payload.apartado,
          addonKey: payload.addon_key || (metaObj.addon_key as string | undefined),
          metadata: metaObj,
          onClick: () => {
            if (onNotificationClick) onNotificationClick(newNotification)
            else if (payload.link?.startsWith('http')) window.open(payload.link, '_blank')
          },
        })
      }

      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission !== 'granted'
      ) {
        window.dispatchEvent(new CustomEvent('show-notification-prompt'))
      }
    },
    [showToastOnIngest, onNotificationClick],
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

  const markHandlers = {
    onMarkAsRead: async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
      try {
        await apiClientRef.current.patch(`${basePathRef.current}/${id}`, {
          is_read: true,
        })
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to mark notification as read:', error)
      }
    },
    onMarkAllAsRead: async () => {
      const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id)
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
      try {
        await Promise.all(
          unreadIds.map((id) =>
            apiClientRef.current.patch(`${basePathRef.current}/${id}`, {
              is_read: true,
            }),
          ),
        )
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to mark all as read:', error)
      }
    },
  }

  const shellProps = {
    labels,
    locale,
    notifications,
    unreadCount,
    resolveImageUrl,
    onNotificationClick,
    ...markHandlers,
  }

  return skipBuiltInWs ? (
    <DropdownShell {...shellProps} />
  ) : (
    <DropdownWithWebSocket ingestWsPayload={ingestWsPayload} {...shellProps} />
  )
}

interface InnerDropdownProps {
  labels: NotificationsDropdownLabels
  locale: Locale
  notifications: NotificationItem[]
  unreadCount: number
  resolveImageUrl?: (src: string) => string
  onMarkAsRead: (id: string) => void | Promise<void>
  onMarkAllAsRead: () => void | Promise<void>
  onNotificationClick?: (notification: NotificationItem) => void
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

function DropdownShell({
  labels,
  locale,
  notifications,
  unreadCount,
  resolveImageUrl,
  onMarkAsRead,
  onMarkAllAsRead,
  onNotificationClick,
}: InnerDropdownProps) {
  const notificationApiAvailable =
    typeof window !== 'undefined' && 'Notification' in window
  const permission: NotificationPermission | null = notificationApiAvailable
    ? Notification.permission
    : null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' className='relative'>
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
              {unreadCount > 99 ? '99+' : unreadCount}
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
          {notifications.length === 0 ? (
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
              return (
                <DropdownMenuItem
                  key={notification.id}
                  className={[
                    'cursor-pointer rounded-none border-0 px-3 py-1.5 focus:bg-muted/50 data-[highlighted]:bg-muted/50 sm:px-3.5',
                    unread ? 'bg-primary/[0.035]' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    if (unread) void onMarkAsRead(notification.id)
                    if (onNotificationClick) {
                      onNotificationClick(notification)
                    } else if (
                      notification.link &&
                      notification.link.startsWith('http')
                    ) {
                      window.open(notification.link, '_blank')
                    }
                  }}
                >
                  <div className='flex w-full items-center gap-2.5'>
                    <NotificationAvatar
                      notification={notification}
                      Icon={Icon}
                      toneClass={tone.iconClass}
                      customColor={tone.customColor}
                      resolveImageUrl={resolveImageUrl}
                    />

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
                            {formatDistanceToNow(new Date(notification.created_at), {
                              addSuffix: true,
                              locale,
                            })}
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
                        <p
                          className='line-clamp-2 text-[11px] leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground/85 [&_b]:font-semibold [&_b]:text-foreground/85 [&_em]:italic [&_i]:italic [&_u]:underline [&_mark]:rounded-sm [&_mark]:bg-amber-500/20 [&_mark]:px-0.5 [&_mark]:text-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[10px] [&_code]:text-foreground'
                          dangerouslySetInnerHTML={{
                            __html: formatNotificationBodyHtml(notification.message),
                          }}
                        />
                      ) : null}
                      {mod ? (
                        <span className='inline-flex max-w-full truncate rounded px-1 py-px text-[10px] font-medium text-muted-foreground ring-1 ring-border/70'>
                          {mod}
                        </span>
                      ) : null}
                    </div>
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
                    setTimeout(() => window.location.reload(), 1500)
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
  const raw = (notification.image || '').trim()
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

  return (
    <div
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${toneClass}`}
      style={customColor ? { backgroundColor: customColor, color: '#fff' } : undefined}
    >
      <Icon className='h-3.5 w-3.5 text-white' strokeWidth={2.5} />
    </div>
  )
}

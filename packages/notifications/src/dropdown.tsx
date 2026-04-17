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
import type {
  NotificationItem,
  NotificationWsPayload,
  NotificationsDropdownLabels,
  NotificationsDropdownProps,
} from './types'

/** Convert kebab-case to PascalCase ("message-circle" -> "MessageCircle"). */
const toPascalCase = (str: string): string =>
  str
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

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

const getIconFor = (
  notification: NotificationItem,
): React.ComponentType<{ className?: string; strokeWidth?: number }> => {
  if (notification.icon) {
    const pascalName = toPascalCase(notification.icon)
    const DynamicIcon = (
      LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>>
    )[pascalName]
    if (DynamicIcon) return DynamicIcon
  }
  switch (notification.type) {
    case 'warning':
      return LucideIcons.AlertTriangle
    case 'success':
      return LucideIcons.CheckCircle2
    case 'error':
      return LucideIcons.XCircle
    case 'info':
    default:
      return LucideIcons.Info
  }
}

const getStyle = (type: string): string => {
  switch (type) {
    case 'warning':
      return 'bg-amber-500 text-white'
    case 'success':
      return 'bg-emerald-500 text-white'
    case 'error':
      return 'bg-red-500 text-white'
    case 'info':
    default:
      return 'bg-blue-500 text-white'
  }
}

/**
 * Bell-icon dropdown that lists the authenticated user's notifications,
 * marks them read, shows an unread counter (and optional PWA app badge),
 * and streams new items pushed over WebSocket under the `NOTIFICATION`
 * message type.
 *
 * This component is transport-agnostic: the HTTP client is injected via
 * `apiClient`. The collection base path is injected via `apiBasePath` —
 * the component fetches `GET {apiBasePath}?orderBy=created_at&...` and
 * mutates items via `PATCH {apiBasePath}/{id}`.
 */
export function NotificationsDropdown({
  apiClient,
  apiBasePath,
  enableBadge = true,
  onNotificationClick,
  perPage = 20,
  locale = es,
  labels: labelsOverride,
  subscribeToNotifications,
}: NotificationsDropdownProps) {
  const labels = useMemo<NotificationsDropdownLabels>(
    () => ({ ...DEFAULT_LABELS, ...labelsOverride }),
    [labelsOverride],
  )

  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [, setLoading] = useState(false)
  const { setBadge } = useAppBadge()

  // Keep fetch callbacks stable across apiClient / basePath changes.
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

  // Normalise an incoming WS payload + prepend it to the list.
  const ingestWsPayload = useCallback((payload: NotificationWsPayload) => {
    const newNotification: NotificationItem = {
      id: payload.id || (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`),
      title: payload.title,
      message: payload.body || payload.message || payload.description || '',
      type: payload.type || 'info',
      is_read: false,
      created_at: new Date().toISOString(),
      link: payload.link,
      icon: payload.icon,
      image: payload.image,
      metadata: payload.metadata,
      conversation_id: payload.conversation_id,
    }
    setNotifications((prev) => [newNotification, ...prev])
    setUnreadCount((prev) => prev + 1)

    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission !== 'granted'
    ) {
      window.dispatchEvent(new CustomEvent('show-notification-prompt'))
    }
  }, [])

  // WebSocket wiring: use provided hook unless caller supplies a custom
  // subscription. We always run one of the two branches exactly once.
  const useCustomSubscription = Boolean(subscribeToNotifications)

  useEffect(() => {
    if (!useCustomSubscription || !subscribeToNotifications) return
    const unsub = subscribeToNotifications(ingestWsPayload)
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [useCustomSubscription, subscribeToNotifications, ingestWsPayload])

  // Hooks must be called unconditionally. When the caller overrides the
  // subscription we still call `useWebSocketMessage` but with a no-op —
  // this requires a provider in context even when unused, so we skip it
  // entirely via a separate component when override is present.
  return useCustomSubscription ? (
    <DropdownShell
      labels={labels}
      locale={locale}
      notifications={notifications}
      unreadCount={unreadCount}
      onMarkAsRead={async (id) => {
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
      }}
      onMarkAllAsRead={async () => {
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
      }}
      onNotificationClick={onNotificationClick}
    />
  ) : (
    <DropdownWithWebSocket
      labels={labels}
      locale={locale}
      notifications={notifications}
      unreadCount={unreadCount}
      ingestWsPayload={ingestWsPayload}
      onMarkAsRead={async (id) => {
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
      }}
      onMarkAllAsRead={async () => {
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
      }}
      onNotificationClick={onNotificationClick}
    />
  )
}

/** Inner variant that subscribes to `useWebSocketMessage`. */
interface InnerDropdownProps {
  labels: NotificationsDropdownLabels
  locale: Locale
  notifications: NotificationItem[]
  unreadCount: number
  onMarkAsRead: (id: string) => void | Promise<void>
  onMarkAllAsRead: () => void | Promise<void>
  onNotificationClick?: (notification: NotificationItem) => void
}
interface DropdownWithWebSocketProps extends InnerDropdownProps {
  ingestWsPayload: (payload: NotificationWsPayload) => void
}

type Locale = Parameters<typeof formatDistanceToNow>[1] extends
  | { locale?: infer L }
  | undefined
  ? NonNullable<L>
  : never

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
            <span className='absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-sm ring-2 ring-background'>
              {unreadCount}
              <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75'></span>
            </span>
          )}
          <span className='sr-only'>{labels.srLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-85 sm:w-96 p-0' align='end' forceMount>
        <DropdownMenuLabel className='p-4 font-normal border-b'>
          <div className='flex items-center justify-between'>
            <p className='text-sm font-semibold'>{labels.title}</p>
            {unreadCount > 0 && (
              <span className='rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'>
                {labels.newBadge(unreadCount)}
              </span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuGroup className='max-h-[350px] overflow-y-auto'>
          {notifications.length === 0 ? (
            <div className='p-8 text-center text-muted-foreground text-sm'>
              {labels.empty}
            </div>
          ) : (
            notifications.map((notification) => {
              const Icon = getIconFor(notification)
              return (
                <DropdownMenuItem
                  key={notification.id}
                  className='cursor-pointer p-3 sm:p-4 focus:bg-muted/50 data-[state=open]:bg-muted/50'
                  onClick={() => {
                    if (!notification.is_read) onMarkAsRead(notification.id)
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
                  <div className='flex items-start gap-4 w-full'>
                    <div className='relative shrink-0'>
                      {notification.image ? (
                        <>
                          <img
                            src={notification.image}
                            alt='Avatar'
                            className='h-10 w-10 rounded-full object-cover border border-muted/40 shadow-sm'
                          />
                          <div className='absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-background ring-1 ring-border text-primary shadow-sm'>
                            <Icon
                              className='h-[10px] w-[10px] text-current'
                              strokeWidth={3}
                            />
                          </div>
                        </>
                      ) : (
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full shadow-sm ring-1 ring-inset ring-black/5 ${getStyle(notification.type)}`}
                        >
                          <Icon
                            className='h-5 w-5 text-white'
                            strokeWidth={2.5}
                          />
                        </div>
                      )}
                    </div>

                    <div className='flex flex-col gap-1 w-full min-w-0'>
                      <div className='flex items-center justify-between gap-2'>
                        <p
                          className={`text-sm leading-none truncate ${!notification.is_read ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                        >
                          {notification.title}
                        </p>
                        <span className='text-[10px] text-muted-foreground whitespace-nowrap shrink-0'>
                          {formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                            locale,
                          })}
                        </span>
                      </div>
                      <p className='text-xs text-muted-foreground line-clamp-2 leading-relaxed'>
                        {notification.message}
                      </p>
                    </div>
                    {!notification.is_read && (
                      <div className='self-center shrink-0'>
                        <div className='h-2.5 w-2.5 rounded-full bg-primary shadow-sm' />
                      </div>
                    )}
                  </div>
                </DropdownMenuItem>
              )
            })
          )}
        </DropdownMenuGroup>
        {notifications.length > 0 && (
          <div className='p-2 border-t bg-muted/20'>
            <Button
              variant='ghost'
              size='sm'
              className='w-full text-xs h-8'
              onClick={() => void onMarkAllAsRead()}
            >
              {labels.markAllAsRead}
            </Button>
          </div>
        )}
        {notificationApiAvailable && permission !== 'granted' && (
          <div className='p-2 border-t bg-muted/20'>
            <Button
              variant='outline'
              size='sm'
              className='w-full text-xs h-8 gap-2 bg-primary/10 hover:bg-primary/20 text-primary border-primary/20'
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
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

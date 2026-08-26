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
      const id =
        payload.id ||
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

      if (showToastOnIngest) {
        showNotificationToast({
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
            <span className='absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm ring-2 ring-background'>
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
              const meta = parseNotificationMeta(notification.metadata)
              const Icon = resolveNotificationIcon(notification.icon, notification.type)
              const tone = resolveNotificationTone(notification.type, meta)
              const mod = moduleLabelFromMeta(meta)
              return (
                <DropdownMenuItem
                  key={notification.id}
                  className={`cursor-pointer border-l-2 p-3 focus:bg-muted/50 data-[state=open]:bg-muted/50 sm:p-4 ${tone.rowAccentClass} ${!notification.is_read ? 'bg-primary/[0.03]' : ''}`}
                  onClick={() => {
                    if (!notification.is_read) void onMarkAsRead(notification.id)
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
                  <div className='flex w-full items-start gap-3'>
                    <NotificationAvatar
                      notification={notification}
                      Icon={Icon}
                      toneClass={tone.iconClass}
                      customColor={tone.customColor}
                      resolveImageUrl={resolveImageUrl}
                    />

                    <div className='flex min-w-0 w-full flex-col gap-1.5'>
                      <div className='flex items-center justify-between gap-2'>
                        <p
                          className={`truncate text-sm leading-snug ${!notification.is_read ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'}`}
                        >
                          {notification.title}
                        </p>
                        <span className='shrink-0 whitespace-nowrap text-[10px] text-muted-foreground'>
                          {formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                            locale,
                          })}
                        </span>
                      </div>
                      {notification.message ? (
                        <p className='line-clamp-2 text-xs leading-relaxed text-muted-foreground'>
                          {notification.message}
                        </p>
                      ) : null}
                      {mod ? (
                        <div className='flex items-center gap-1.5 pt-0.5'>
                          <span className='inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium capitalize text-muted-foreground'>
                            {mod}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    {!notification.is_read && (
                      <div className='shrink-0 self-center'>
                        <div className='h-2 w-2 rounded-full bg-primary shadow-sm' />
                      </div>
                    )}
                  </div>
                </DropdownMenuItem>
              )
            })
          )}
        </DropdownMenuGroup>
        {notifications.length > 0 && (
          <div className='border-t bg-muted/20 p-2'>
            <Button
              variant='ghost'
              size='sm'
              className='h-8 w-full text-xs'
              onClick={() => void onMarkAllAsRead()}
            >
              {labels.markAllAsRead}
            </Button>
          </div>
        )}
        {notificationApiAvailable && permission !== 'granted' && (
          <div className='border-t bg-muted/20 p-2'>
            <Button
              variant='outline'
              size='sm'
              className='h-8 w-full gap-2 border-primary/20 bg-primary/10 text-xs text-primary hover:bg-primary/20'
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
          className='h-10 w-10 rounded-full border border-muted/40 object-cover shadow-sm'
          onError={() => setFailed(true)}
        />
        <div className='absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-background p-1 text-primary shadow-sm ring-1 ring-border'>
          <Icon className='size-3.5 text-current' strokeWidth={2.25} />
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ring-inset ring-black/5 ${toneClass}`}
      style={customColor ? { backgroundColor: customColor, color: '#fff' } : undefined}
    >
      <Icon className='h-5 w-5' strokeWidth={2.5} />
    </div>
  )
}

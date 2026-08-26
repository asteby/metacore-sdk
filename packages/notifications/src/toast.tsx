import { toast } from 'sonner'
import { resolveNotificationVisual } from './visual'
import type { NotificationType } from './types'

export type ShowNotificationToastOptions = {
  title: string
  body?: string
  type?: NotificationType | string
  icon?: string
  image?: string
  /** Inventario / Almacén / POS — or pass metadata.addon_key */
  apartado?: string
  metadata?: string | Record<string, unknown>
  addonKey?: string
  duration?: number
  onClick?: () => void
}

/**
 * Canonical in-app notification toast — same card as the bell dropdown
 * (dynamic Lucide icon, severity color, module chip).
 */
export function showNotificationToast(opts: ShowNotificationToastOptions): void {
  const meta =
    typeof opts.metadata === 'object' && opts.metadata
      ? { ...opts.metadata }
      : opts.metadata
  const { Icon, tone, moduleLabel } = resolveNotificationVisual({
    icon: opts.icon,
    type: opts.type,
    metadata: meta as string | Record<string, unknown> | null | undefined,
    addonKey: opts.addonKey,
  })
  const apartado = (opts.apartado || moduleLabel || '').trim()
  const duration = opts.duration ?? 5000

  toast.custom(
    (id) => (
      <button
        type='button'
        className={[
          'flex w-full min-w-[280px] max-w-[360px] items-start gap-3 rounded-xl border border-border/60 bg-card p-3 text-left shadow-lg ring-1 ring-black/5',
          opts.onClick ? 'cursor-pointer hover:bg-accent/40' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          opts.onClick?.()
          toast.dismiss(id)
        }}
      >
        {opts.image ? (
          <img
            src={opts.image}
            alt=''
            className='mt-0.5 h-9 w-9 shrink-0 rounded-full object-cover'
          />
        ) : (
          <span
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.iconClass}`}
            style={tone.customColor ? { backgroundColor: tone.customColor, color: '#fff' } : undefined}
          >
            <Icon className='h-4 w-4' aria-hidden />
          </span>
        )}
        <span className='min-w-0 flex-1'>
          {apartado ? (
            <span className='mb-0.5 inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium capitalize text-muted-foreground'>
              {apartado}
            </span>
          ) : null}
          <span className='block text-sm font-semibold text-foreground'>{opts.title}</span>
          {opts.body ? (
            <span className='mt-0.5 block text-xs text-muted-foreground line-clamp-2'>
              {opts.body}
            </span>
          ) : null}
        </span>
      </button>
    ),
    { duration },
  )
}

type ToastData = {
  description?: unknown
  duration?: number
  apartado?: string
  icon?: string
  metadata?: string | Record<string, unknown>
} & Record<string, unknown>

function extract(message: unknown, data?: ToastData) {
  const title =
    typeof message === 'string' ? message : message == null ? 'Notificación' : String(message)
  const body = typeof data?.description === 'string' ? data.description : undefined
  return {
    title,
    body,
    duration: typeof data?.duration === 'number' ? data.duration : undefined,
    apartado: typeof data?.apartado === 'string' ? data.apartado : undefined,
    icon: typeof data?.icon === 'string' ? data.icon : undefined,
    metadata: data?.metadata,
  }
}

let installed = false

/**
 * Patch the shared sonner singleton so every `toast.success/info/warning/error`
 * (host + Module Federation remotes) renders the same card as WS/SSE notifications.
 * Call once at app boot (e.g. main.tsx).
 */
export function installUnifiedToasts(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  const wrap =
    (type: NotificationType, defaultIcon: string) =>
    (message: unknown, data?: ToastData) => {
      const x = extract(message, data)
      showNotificationToast({
        title: x.title,
        body: x.body,
        type,
        icon: x.icon || defaultIcon,
        duration: x.duration,
        apartado: x.apartado,
        metadata: x.metadata,
      })
      return '' as ReturnType<typeof toast.success>
    }

  toast.success = wrap('success', 'check-circle-2') as typeof toast.success
  toast.info = wrap('info', 'info') as typeof toast.info
  toast.warning = wrap('warning', 'alert-triangle') as typeof toast.warning
  toast.error = wrap('error', 'x-circle') as typeof toast.error
  toast.message = wrap('info', 'bell') as typeof toast.message
}

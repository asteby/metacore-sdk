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
  /**
   * Stable id so concurrent toasts stack instead of replacing each other.
   * Auto-generated when omitted.
   */
  id?: string | number
}

export type PersistNotificationInput = {
  title: string
  body?: string
  type: NotificationType
  icon?: string
  image?: string
  link?: string
  apartado?: string
  addonKey?: string
  metadata?: Record<string, unknown>
}

export type InstallUnifiedToastsOptions = {
  /**
   * Persist control toasts into the bell inbox (host wires POST /api/notifications/me).
   * Skipped when the caller passes `{ persist: false }`.
   * Default: persist success / info / warning / error (not invoked for SSE ingest —
   * that path uses `showNotificationToast` directly).
   */
  persist?: (input: PersistNotificationInput) => void | Promise<void>
  /** Types that auto-persist. Default: all of success|info|warning|error. */
  persistTypes?: NotificationType[]
}

/**
 * Canonical in-app notification toast — same card as the bell dropdown
 * (dynamic Lucide icon, severity color, module chip).
 *
 * Uses Sonner `unstyled` so the host Toaster chrome does not paint a second
 * card behind this one.
 */
export function showNotificationToast(opts: ShowNotificationToastOptions): string | number {
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
  const id =
    opts.id ??
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`)

  toast.custom(
    (tId) => (
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
          toast.dismiss(tId)
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
    {
      id,
      duration,
      unstyled: true,
      className: '!bg-transparent !border-0 !shadow-none !p-0 w-auto',
    },
  )

  return id
}

type ToastData = {
  description?: unknown
  duration?: number
  apartado?: string
  icon?: string
  image?: string
  link?: string
  metadata?: string | Record<string, unknown>
  addonKey?: string
  addon_key?: string
  /** Opt out of bell persistence for ephemeral noise. */
  persist?: boolean
  id?: string | number
} & Record<string, unknown>

function extract(message: unknown, data?: ToastData) {
  const title =
    typeof message === 'string' ? message : message == null ? 'Notificación' : String(message)
  const body = typeof data?.description === 'string' ? data.description : undefined
  const meta =
    typeof data?.metadata === 'object' && data.metadata
      ? { ...data.metadata }
      : typeof data?.metadata === 'string'
        ? undefined
        : {}
  return {
    title,
    body,
    duration: typeof data?.duration === 'number' ? data.duration : undefined,
    apartado: typeof data?.apartado === 'string' ? data.apartado : undefined,
    icon: typeof data?.icon === 'string' ? data.icon : undefined,
    image: typeof data?.image === 'string' ? data.image : undefined,
    link: typeof data?.link === 'string' ? data.link : undefined,
    metadata: meta as Record<string, unknown> | undefined,
    addonKey:
      (typeof data?.addonKey === 'string' && data.addonKey) ||
      (typeof data?.addon_key === 'string' && data.addon_key) ||
      undefined,
    persist: data?.persist,
    id: data?.id,
  }
}

let installed = false

const DEFAULT_PERSIST_TYPES: NotificationType[] = ['success', 'info', 'warning', 'error']

/**
 * Patch the shared sonner singleton so every `toast.success/info/warning/error`
 * (host + Module Federation remotes) renders the same card as WS/SSE notifications.
 * Call once at app boot (e.g. main.tsx).
 *
 * Pass `persist` so control toasts are written to the bell inbox (audit trail).
 */
export function installUnifiedToasts(options?: InstallUnifiedToastsOptions): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  const persistTypes = new Set(options?.persistTypes ?? DEFAULT_PERSIST_TYPES)
  const persistFn = options?.persist

  const wrap =
    (type: NotificationType, defaultIcon: string, defaultPersist?: boolean) =>
    (message: unknown, data?: ToastData) => {
      const x = extract(message, data)
      const toastId = showNotificationToast({
        title: x.title,
        body: x.body,
        type,
        icon: x.icon || defaultIcon,
        image: x.image,
        duration: x.duration,
        apartado: x.apartado,
        metadata: x.metadata,
        addonKey: x.addonKey,
        id: x.id,
      })

      const persistFlag =
        x.persist !== undefined ? x.persist : defaultPersist !== false
      const shouldPersist =
        Boolean(persistFn) && persistTypes.has(type) && persistFlag

      if (shouldPersist && persistFn) {
        const meta: Record<string, unknown> = { ...(x.metadata || {}) }
        meta.source = meta.source || 'toast'
        if (x.addonKey) meta.addon_key = x.addonKey
        if (x.apartado) meta.apartado = x.apartado
        void Promise.resolve(
          persistFn({
            title: x.title,
            body: x.body,
            type,
            icon: x.icon || defaultIcon,
            image: x.image,
            link: x.link,
            apartado: x.apartado,
            addonKey: x.addonKey,
            metadata: meta,
          }),
        ).catch(() => {
          /* bell persist is best-effort — never break UX toast */
        })
      }

      return toastId as ReturnType<typeof toast.success>
    }

  toast.success = wrap('success', 'check-circle-2') as typeof toast.success
  toast.info = wrap('info', 'info') as typeof toast.info
  toast.warning = wrap('warning', 'alert-triangle') as typeof toast.warning
  toast.error = wrap('error', 'x-circle') as typeof toast.error
  // Ephemeral by default (calls, dictation) — pass { persist: true } to archive.
  toast.message = wrap('info', 'bell', false) as typeof toast.message
}

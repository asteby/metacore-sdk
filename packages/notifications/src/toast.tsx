import { toast } from 'sonner'
import { formatNotificationBodyHtml } from './rich-text'
import { resolveNotificationVisual } from './visual'
import type { NotificationType } from './types'
import type {
  FocusEvent as ReactFocusEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react'

export type ToastActionButton = {
  label: ReactNode
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void
}

export type ShowNotificationToastOptions = {
  title: string
  body?: string
  /**
   * Short plain-text summary shown instead of `body` in the toast (the full
   * body stays in the bell inbox). Always escaped, never rendered as HTML.
   */
  summary?: string
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
   * Render the body through the HTML sanitizer (default true). `false` paints
   * it as plain text — use it for user-authored content.
   */
  richText?: boolean
  /** Sonner-compatible primary action (e.g. Recargar / Actualizar). */
  action?: ToastActionButton | ReactNode
  /** Sonner-compatible secondary/cancel action. */
  cancel?: ToastActionButton | ReactNode
  /**
   * Extra action buttons rendered after `action` (e.g. «Ver evidencia»,
   * «Asignar»). Each one runs its handler and dismisses the toast.
   */
  actions?: ToastActionButton[]
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

const TOAST_WIDTH = 'w-[360px]'

function isActionButton(value: unknown): value is ToastActionButton {
  return (
    typeof value === 'object' &&
    value !== null &&
    'label' in value &&
    'onClick' in value &&
    typeof (value as ToastActionButton).onClick === 'function'
  )
}

const PRIMARY_BUTTON =
  'inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 pointer-events-auto'
const SECONDARY_BUTTON =
  'inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md bg-muted px-2.5 text-xs font-medium text-foreground hover:bg-muted/80 pointer-events-auto'

function ToastButton(props: {
  toastId: string | number
  button: ToastActionButton
  className: string
}) {
  const { toastId, button, className } = props
  return (
    <button
      type='button'
      className={className}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const fn = button.onClick
        // Run handler first so dismiss/snooze flags stick before any
        // concurrent re-show (SSE) can race the deferred path.
        try {
          fn(e)
        } catch {
          /* never block */
        }
        toast.dismiss(toastId)
      }}
    >
      {button.label}
    </button>
  )
}

function ActionButtons(props: {
  toastId: string | number
  action?: ToastActionButton | ReactNode
  cancel?: ToastActionButton | ReactNode
  actions?: ToastActionButton[]
}) {
  const { toastId, action, cancel } = props
  const extra = (props.actions ?? []).filter(isActionButton)
  if (!action && !cancel && extra.length === 0) return null

  return (
    <span className='relative z-10 mt-2 flex flex-wrap items-center gap-2 pointer-events-auto'>
      {isActionButton(action) ? (
        <ToastButton toastId={toastId} button={action} className={PRIMARY_BUTTON} />
      ) : action ? (
        <span className='inline-flex pointer-events-auto' onClick={(e) => e.stopPropagation()}>
          {action}
        </span>
      ) : null}
      {extra.map((button, i) => (
        <ToastButton
          key={i}
          toastId={toastId}
          button={button}
          className={!action && i === 0 ? PRIMARY_BUTTON : SECONDARY_BUTTON}
        />
      ))}
      {isActionButton(cancel) ? (
        <ToastButton toastId={toastId} button={cancel} className={SECONDARY_BUTTON} />
      ) : cancel ? (
        <span className='inline-flex pointer-events-auto' onClick={(e) => e.stopPropagation()}>
          {cancel}
        </span>
      ) : null}
    </span>
  )
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
  const summary = (opts.summary || '').trim()
  // A summary replaces the body in the toast and is always plain text.
  const body = summary || (opts.body || '').trim()
  const plainBody = Boolean(summary) || opts.richText === false
  const bodyHtml = plainBody ? '' : formatNotificationBodyHtml(body)
  // Multi-line bodies (e.g. a bulk-delete summary: "• motivo (×2)\n• otro\ny 2 más")
  // keep their line breaks and get a taller clamp. We rely on CSS
  // `white-space: pre-line` instead of rewriting "\n" into <br> in the HTML:
  // the sanitizer/escaper output is never touched (no injection surface, no
  // double processing) and the browser does the break. One-line bodies keep
  // the exact classes they always had.
  const multiline = body.includes('\n')
  const bodyClamp = multiline ? 'whitespace-pre-line line-clamp-6' : 'line-clamp-2'
  const hasActions = Boolean(
    opts.action || opts.cancel || (opts.actions ?? []).some(isActionButton),
  )
  // Title-only: vertically center with the icon. Chip/body/actions keep items-start.
  const titleOnly = !apartado && !body && !hasActions
  const duration = opts.duration ?? 5000
  const id =
    opts.id ??
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`)

  const cardClass = [
    `pointer-events-auto flex ${TOAST_WIDTH} max-w-[360px] gap-3 rounded-xl border border-border/60 bg-card p-3 text-left shadow-lg ring-1 ring-black/5`,
    titleOnly ? 'items-center' : 'items-start',
    opts.onClick && !hasActions ? 'cursor-pointer hover:bg-accent/40' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const toastOptions = {
    id,
    duration,
    unstyled: true,
    className: `!bg-transparent !border-0 !shadow-none !p-0 ${TOAST_WIDTH}`,
  }
  // Sonner only pauses the auto-close timer on hover. Keyboard and screen
  // reader users who focus the card (or one of its actions) get the same
  // pause: the toast is re-issued with an infinite duration while focus is
  // inside and gets its duration back when focus leaves.
  let paused = false
  const onFocus = () => {
    if (paused || duration === Infinity) return
    paused = true
    toast.custom(render, { ...toastOptions, duration: Infinity })
  }
  const onBlur = (e: ReactFocusEvent<HTMLElement>) => {
    if (!paused) return
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    paused = false
    toast.custom(render, toastOptions)
  }

  const render = (tId: string | number) => {
      const inner = (
        <>
          {opts.image ? (
            <img
              src={opts.image}
              alt=''
              className={`${titleOnly ? '' : 'mt-0.5 '}h-9 w-9 shrink-0 rounded-full object-cover`}
            />
          ) : (
            <span
              className={`${titleOnly ? '' : 'mt-0.5 '}flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${tone.iconClass}`}
              style={tone.customColor ? { backgroundColor: tone.customColor, color: '#fff' } : undefined}
            >
              <Icon className='h-4 w-4 text-white' aria-hidden />
            </span>
          )}
          <span className='min-w-0 flex-1'>
            {apartado ? (
              <span className='mb-0.5 inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium capitalize text-muted-foreground'>
                {apartado}
              </span>
            ) : null}
            <span
              className='block truncate text-sm font-semibold text-foreground'
              title={opts.title}
            >
              {opts.title}
            </span>
            {plainBody && body ? (
              <span className={`mt-0.5 text-xs text-muted-foreground ${bodyClamp}`}>
                {body}
              </span>
            ) : bodyHtml ? (
              <span
                className={`mt-0.5 text-xs text-muted-foreground ${bodyClamp} [&_strong]:font-semibold [&_strong]:text-foreground/85 [&_b]:font-semibold [&_b]:text-foreground/85 [&_em]:italic [&_i]:italic [&_u]:underline [&_mark]:rounded-sm [&_mark]:bg-amber-500/20 [&_mark]:px-0.5 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[10px]`}
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            ) : null}
            <ActionButtons
              toastId={tId}
              action={opts.action}
              cancel={opts.cancel}
              actions={opts.actions}
            />
          </span>
        </>
      )

      // Nested action buttons can't live inside a <button> — use a div when
      // actions are present; keep the whole card clickable otherwise.
      if (hasActions) {
        return (
          <div className={cardClass} role='status' onFocus={onFocus} onBlur={onBlur}>
            {inner}
          </div>
        )
      }

      return (
        <button
          type='button'
          className={cardClass}
          onFocus={onFocus}
          onBlur={onBlur}
          onClick={() => {
            opts.onClick?.()
            toast.dismiss(tId)
          }}
        >
          {inner}
        </button>
      )
  }

  toast.custom(render, toastOptions)

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
  action?: ToastActionButton | ReactNode
  cancel?: ToastActionButton | ReactNode
  actions?: ToastActionButton[]
  summary?: string
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
    action: data?.action,
    cancel: data?.cancel,
    actions: Array.isArray(data?.actions) ? data.actions : undefined,
    summary: typeof data?.summary === 'string' ? data.summary : undefined,
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
        action: x.action,
        cancel: x.cancel,
        actions: x.actions,
        summary: x.summary,
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

  const infoWrap = wrap('info', 'info')

  toast.success = wrap('success', 'check-circle-2') as typeof toast.success
  toast.info = infoWrap as typeof toast.info
  toast.warning = wrap('warning', 'alert-triangle') as typeof toast.warning
  toast.error = wrap('error', 'x-circle') as typeof toast.error
  // Ephemeral by default (calls, dictation) — pass { persist: true } to archive.
  toast.message = wrap('info', 'bell', false) as typeof toast.message
}

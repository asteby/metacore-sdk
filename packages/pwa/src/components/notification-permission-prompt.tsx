import { Bell, X } from 'lucide-react'
import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { toast } from 'sonner'

export interface NotificationPermissionPromptMessages {
  title?: string
  description?: string
  allowLabel?: string
  dismissLabel?: string
  activatedToast?: string
  blockedTitle?: string
  blockedDescription?: string
}

export interface NotificationPermissionPromptProps {
  ButtonComponent?: ComponentType<{
    onClick?: () => void
    children?: ReactNode
    variant?: 'default' | 'outline'
    size?: 'sm'
    className?: string
  }>
  messages?: NotificationPermissionPromptMessages
  /** Delay before auto-showing the prompt on mount (ms). Default: 2000. */
  autoShowDelayMs?: number
  /** Reload the page after granting to sync state. Default: true. */
  reloadOnGrant?: boolean
  className?: string
}

const DEFAULTS: Required<NotificationPermissionPromptMessages> = {
  title: 'Activar Notificaciones',
  description:
    'Recibe alertas cuando te envíen mensajes nuevos. Puedes desactivarlas cuando quieras.',
  allowLabel: 'Permitir',
  dismissLabel: 'Ahora no',
  activatedToast: '¡Notificaciones activadas!',
  blockedTitle: 'Notificaciones bloqueadas por el navegador',
  blockedDescription:
    'Debes habilitarlas manualmente: Click en el ícono de la barra de direcciones → Permisos → Notificaciones → Permitir',
}

function DefaultButton({
  onClick,
  children,
  variant = 'default',
  size,
  className,
}: {
  onClick?: () => void
  children?: ReactNode
  variant?: 'default' | 'outline'
  size?: 'sm'
  className?: string
}) {
  const base =
    'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50'
  const sizeClass = size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4'
  const variantClass =
    variant === 'outline'
      ? 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
      : 'bg-primary text-primary-foreground hover:bg-primary/90'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${sizeClass} ${variantClass} ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

export function NotificationPermissionPrompt({
  ButtonComponent = DefaultButton,
  messages,
  autoShowDelayMs = 2000,
  reloadOnGrant = true,
  className,
}: NotificationPermissionPromptProps = {}) {
  const [show, setShow] = useState(false)
  const msgs = { ...DEFAULTS, ...messages }

  useEffect(() => {
    if (typeof window === 'undefined') return
    if ('Notification' in window && Notification.permission === 'default') {
      const timer = setTimeout(() => setShow(true), autoShowDelayMs)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [autoShowDelayMs])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleTrigger = () => {
      if (!('Notification' in window)) return
      if (Notification.permission !== 'granted') {
        setShow(true)
        sessionStorage.removeItem('notification-prompt-dismissed')
      }
    }

    window.addEventListener('show-notification-prompt', handleTrigger)
    return () => window.removeEventListener('show-notification-prompt', handleTrigger)
  }, [])

  const handleAllow = async () => {
    setShow(false)

    try {
      const permission = await Notification.requestPermission()

      if (permission === 'granted') {
        toast.success(msgs.activatedToast)
        if (reloadOnGrant) {
          setTimeout(() => window.location.reload(), 1000)
        }
      } else {
        toast.error(msgs.blockedTitle, {
          description: msgs.blockedDescription,
          duration: 8000,
        })
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error)
    }
  }

  const handleDismiss = () => {
    setShow(false)
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('notification-prompt-dismissed', 'true')
    }
  }

  if (!show) return null
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('notification-prompt-dismissed')) {
    return null
  }

  return (
    <div
      className={
        className ??
        'fixed top-4 left-4 z-50 max-w-sm rounded-lg border bg-background p-4 shadow-lg animate-in slide-in-from-top-2 duration-500'
      }
    >
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-2 top-2 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="p-2 bg-primary/10 rounded-full shrink-0">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">{msgs.title}</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-3 leading-relaxed">
            {msgs.description}
          </p>
          <div className="flex gap-2">
            <ButtonComponent onClick={handleAllow} size="sm">
              {msgs.allowLabel}
            </ButtonComponent>
            <ButtonComponent onClick={handleDismiss} variant="outline" size="sm">
              {msgs.dismissLabel}
            </ButtonComponent>
          </div>
        </div>
      </div>
    </div>
  )
}

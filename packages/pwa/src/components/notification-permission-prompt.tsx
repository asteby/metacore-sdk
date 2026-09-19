import { useEffect, useRef } from 'react'
import { showNotificationToast } from '@asteby/metacore-notifications'
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
  messages?: NotificationPermissionPromptMessages
  /** Delay before auto-showing the prompt on mount (ms). Default: 2000. */
  autoShowDelayMs?: number
  /** Reload the page after granting to sync state. Default: true. */
  reloadOnGrant?: boolean
  /**
   * Stable Sonner id — re-triggers replace the same card (no flood).
   * Default: `sys:push-permission`.
   */
  toastId?: string | number
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

export const PUSH_PERMISSION_TOAST_ID = 'sys:push-permission'
const DISMISS_KEY = 'notification-prompt-dismissed'
const DISMISS_UNTIL_KEY = 'notification-prompt-dismissed-until'
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000

let closedThisTab = false

function isSnoozed(): boolean {
  if (closedThisTab) return true
  if (typeof window === 'undefined') return true
  try {
    if (sessionStorage.getItem(DISMISS_KEY) === 'true') return true
    const until = Number(localStorage.getItem(DISMISS_UNTIL_KEY) || '')
    if (Number.isFinite(until) && Date.now() < until) return true
  } catch {
    /* private mode */
  }
  return false
}

function snooze(): void {
  closedThisTab = true
  try {
    localStorage.setItem(DISMISS_UNTIL_KEY, String(Date.now() + SNOOZE_MS))
    sessionStorage.setItem(DISMISS_KEY, 'true')
  } catch {
    /* private mode — tab flag still blocks */
  }
}

/**
 * Ask once per snooze window. "Ahora no" silences SSE/WS re-prompts.
 */
export function NotificationPermissionPrompt({
  messages,
  autoShowDelayMs = 2000,
  reloadOnGrant = true,
  toastId = PUSH_PERMISSION_TOAST_ID,
}: NotificationPermissionPromptProps = {}) {
  const msgs = { ...DEFAULTS, ...messages }
  const offeredRef = useRef(false)

  const handleAllow = async () => {
    snooze()
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

  const show = () => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window) || Notification.permission !== 'default') return
    if (isSnoozed() || offeredRef.current) return
    offeredRef.current = true
    showNotificationToast({
      id: toastId,
      title: msgs.title,
      body: msgs.description,
      type: 'info',
      icon: 'bell',
      duration: Infinity,
      action: {
        label: msgs.allowLabel,
        onClick: () => {
          snooze()
          void handleAllow()
        },
      },
      cancel: { label: msgs.dismissLabel, onClick: () => snooze() },
    })
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window) || Notification.permission !== 'default') return
    if (isSnoozed()) return
    const timer = setTimeout(show, autoShowDelayMs)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoShowDelayMs])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleTrigger = () => {
      if (isSnoozed() || offeredRef.current) return
      show()
    }

    window.addEventListener('show-notification-prompt', handleTrigger)
    return () => window.removeEventListener('show-notification-prompt', handleTrigger)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

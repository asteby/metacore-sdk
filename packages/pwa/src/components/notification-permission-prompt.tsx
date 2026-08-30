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

/**
 * Renders through the shared notification toast instead of its own
 * fixed-position banner, so it stacks with every other app notification
 * rather than competing for a corner of the screen.
 */
export function NotificationPermissionPrompt({
  messages,
  autoShowDelayMs = 2000,
  reloadOnGrant = true,
}: NotificationPermissionPromptProps = {}) {
  const msgs = { ...DEFAULTS, ...messages }
  const shownRef = useRef(false)

  const handleAllow = async () => {
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
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('notification-prompt-dismissed', 'true')
    }
  }

  const show = () => {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('notification-prompt-dismissed')) {
      return
    }
    showNotificationToast({
      title: msgs.title,
      body: msgs.description,
      type: 'info',
      icon: 'bell',
      duration: 15000,
      action: { label: msgs.allowLabel, onClick: () => void handleAllow() },
      cancel: { label: msgs.dismissLabel, onClick: handleDismiss },
    })
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window) || Notification.permission !== 'default') return
    if (shownRef.current) return
    const timer = setTimeout(() => {
      shownRef.current = true
      show()
    }, autoShowDelayMs)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoShowDelayMs])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleTrigger = () => {
      if (!('Notification' in window)) return
      if (Notification.permission !== 'granted') {
        sessionStorage.removeItem('notification-prompt-dismissed')
        show()
      }
    }

    window.addEventListener('show-notification-prompt', handleTrigger)
    return () => window.removeEventListener('show-notification-prompt', handleTrigger)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

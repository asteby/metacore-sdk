import { useEffect, useRef } from 'react'
import { showNotificationToast } from '@asteby/metacore-notifications'
import { usePWAContext } from '../provider'

export interface InstallPromptMessages {
  title?: string
  description?: string
  installLabel?: string
  dismissLabel?: string
}

export interface InstallPromptProps {
  messages?: InstallPromptMessages
  /** How long the toast stays before auto-dismissing (ms). Default: 10000. */
  duration?: number
}

const DEFAULTS: Required<InstallPromptMessages> = {
  title: 'Instalar App',
  description: 'Instala la app para acceso rápido y funcionalidad offline',
  installLabel: 'Instalar',
  dismissLabel: 'Ahora no',
}

/**
 * Renders through the shared notification toast (same card as bell/WS/SSE)
 * instead of its own fixed-position banner, so it stacks with every other
 * app notification rather than competing for a corner of the screen.
 */
export function PWAInstallPrompt({ messages, duration = 10000 }: InstallPromptProps = {}) {
  const { isInstallable, installApp } = usePWAContext()
  const msgs = { ...DEFAULTS, ...messages }
  const shown = useRef(false)

  useEffect(() => {
    if (!isInstallable || shown.current) return
    if (typeof localStorage !== 'undefined' && localStorage.getItem('pwa-install-dismissed')) return
    shown.current = true

    showNotificationToast({
      title: msgs.title,
      body: msgs.description,
      type: 'info',
      icon: 'download',
      duration,
      action: {
        label: msgs.installLabel,
        onClick: () => {
          void installApp()
        },
      },
      cancel: {
        label: msgs.dismissLabel,
        onClick: () => {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('pwa-install-dismissed', 'true')
          }
        },
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInstallable])

  return null
}

import { useEffect, useRef } from 'react'
import { showNotificationToast } from '@asteby/metacore-notifications'
import { usePWAContext } from '../provider'

export interface UpdatePromptMessages {
  title?: string
  description?: string
  updateLabel?: string
  dismissLabel?: string
}

export interface UpdatePromptProps {
  messages?: UpdatePromptMessages
  /** How long the toast stays before auto-dismissing (ms). Default: 0 (sticky). */
  duration?: number
}

const DEFAULTS: Required<UpdatePromptMessages> = {
  title: 'Actualización disponible',
  description: 'Hay una nueva versión disponible',
  updateLabel: 'Actualizar',
  dismissLabel: 'Después',
}

/**
 * Renders through the shared notification toast instead of its own
 * fixed-position banner, so it stacks with every other app notification
 * rather than competing for a corner of the screen.
 */
export function PWAUpdatePrompt({ messages, duration = 0 }: UpdatePromptProps = {}) {
  const { needRefresh, updateApp, closeUpdatePrompt } = usePWAContext()
  const msgs = { ...DEFAULTS, ...messages }
  const shown = useRef(false)

  useEffect(() => {
    if (!needRefresh || shown.current) return
    shown.current = true

    showNotificationToast({
      title: msgs.title,
      body: msgs.description,
      type: 'info',
      icon: 'refresh-cw',
      duration: duration || Infinity,
      action: {
        label: msgs.updateLabel,
        onClick: updateApp,
      },
      cancel: {
        label: msgs.dismissLabel,
        onClick: closeUpdatePrompt,
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needRefresh])

  return null
}

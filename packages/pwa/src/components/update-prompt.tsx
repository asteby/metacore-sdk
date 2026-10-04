import { useEffect, useRef } from 'react'
import { showNotificationToast } from '@asteby/metacore-notifications'
import { toast } from 'sonner'
import { usePWAContext } from '../provider'
import { useModalOpen } from '../use-modal-open'

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
  /**
   * Stable Sonner id so concurrent update prompts (SW backup, recovery, etc.)
   * replace this card instead of stacking. Default: `sys:app-update`.
   */
  toastId?: string | number
}

const DEFAULTS: Required<UpdatePromptMessages> = {
  title: 'Actualización disponible',
  description: 'Hay una nueva versión disponible',
  updateLabel: 'Actualizar',
  dismissLabel: 'Después',
}

/** Canonical id shared with host SW/recovery coalescing. */
export const PWA_UPDATE_TOAST_ID = 'sys:app-update'

/**
 * Renders through the shared notification toast instead of its own
 * fixed-position banner, so it stacks with every other app notification
 * rather than competing for a corner of the screen.
 */
export function PWAUpdatePrompt({
  messages,
  duration = 0,
  toastId = PWA_UPDATE_TOAST_ID,
}: UpdatePromptProps = {}) {
  const { needRefresh, updateApp, closeUpdatePrompt } = usePWAContext()
  const msgs = { ...DEFAULTS, ...messages }
  const shown = useRef(false)
  // The sticky update card used to sit over open dialogs and hide their fields
  // and buttons: retract it while a modal is open, bring it back afterwards.
  const modalOpen = useModalOpen()

  useEffect(() => {
    if (modalOpen) {
      if (shown.current) {
        toast.dismiss(toastId)
        shown.current = false
      }
      return
    }
    if (!needRefresh || shown.current) return
    shown.current = true

    showNotificationToast({
      id: toastId,
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
  }, [needRefresh, modalOpen])

  return null
}

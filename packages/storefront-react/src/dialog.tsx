import { useCallback, useEffect, useRef, type RefObject } from 'react'

export type DialogCloseReason = 'esc' | 'x' | 'backdrop' | 'action'

type UseModalDialogOptions = {
  open: boolean
  /** Called for Esc and backdrop clicks. The owner decides whether to close. */
  onClose: (reason: DialogCloseReason) => void
  /** Element focused when the dialog opens. Default: the element marked `data-sf-autofocus`, else the dialog itself. */
  initialFocus?: RefObject<HTMLElement | null>
}

let scrollLocks = 0
let savedOverflow = ''
let savedGutter = ''

/**
 * Blocks the page scroll behind an open modal (reference-counted so stacked dialogs release it only when the last
 * one closes). `overflow: hidden` on the root keeps the scrollbar gutter so the page does not jump sideways.
 */
export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {}
  const root = document.documentElement
  if (scrollLocks++ === 0) {
    savedOverflow = root.style.overflow
    savedGutter = root.style.scrollbarGutter
    root.style.overflow = 'hidden'
    root.style.scrollbarGutter = 'stable'
  }
  let released = false
  return () => {
    if (released) return
    released = true
    if (--scrollLocks === 0) {
      root.style.overflow = savedOverflow
      root.style.scrollbarGutter = savedGutter
    }
  }
}

/**
 * Native `<dialog>` wiring: `showModal()` (focus trap and inert background come from the browser), page scroll locked while open,
 * Esc and backdrop clicks routed to `onClose`, and focus restored to the opener on close.
 * Falls back to the `open` attribute where `showModal` does not exist (old browsers, some test DOMs)
 * with an Esc key handler.
 */
export function useModalDialog({ open, onClose, initialFocus }: UseModalDialogOptions) {
  const ref = useRef<HTMLDialogElement | null>(null)
  const opener = useRef<Element | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const el = ref.current
    if (!el || !open) return
    opener.current = typeof document !== 'undefined' ? document.activeElement : null
    const hasModal = typeof el.showModal === 'function'
    if (!el.open) {
      if (hasModal) {
        try {
          el.showModal()
        } catch {
          el.setAttribute('open', '')
        }
      } else el.setAttribute('open', '')
    }
    const unlock = lockBodyScroll()
    const target = initialFocus?.current ?? el.querySelector<HTMLElement>('[data-sf-autofocus]') ?? el
    if (!target.hasAttribute('tabindex') && target === el) el.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })

    const onCancel = (e: Event) => {
      e.preventDefault() // we close through state so the owner can navigate/track first
      onCloseRef.current('esc')
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current('esc')
      }
    }
    el.addEventListener('cancel', onCancel)
    if (!hasModal) el.addEventListener('keydown', onKey)
    return () => {
      unlock()
      el.removeEventListener('cancel', onCancel)
      el.removeEventListener('keydown', onKey)
      if (el.open) {
        if (typeof el.close === 'function') {
          try {
            el.close()
          } catch {
            el.removeAttribute('open')
          }
        } else el.removeAttribute('open')
      }
      const back = opener.current
      if (back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true })
    }
  }, [open])

  /** Click on the backdrop (the dialog element itself, outside its content box). */
  const onBackdropClick = useCallback((e: { target: EventTarget; currentTarget: EventTarget }) => {
    if (e.target === e.currentTarget) onCloseRef.current('backdrop')
  }, [])

  return { ref, onBackdropClick }
}

/** `prefers-reduced-motion: reduce`, read after hydration (false on the server). */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

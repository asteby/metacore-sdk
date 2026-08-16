import * as React from 'react'
import {
  clampSidePanelWidth,
  SIDE_PANEL_DEFAULT_WIDTH,
  SIDE_PANEL_MAX_WIDTH,
  SIDE_PANEL_MIN_WIDTH,
} from './constants'

export type UseResizableSidePanelOptions = {
  /** localStorage key — e.g. `pos.cart.width`, `purchases.panel.width`. */
  storageKey: string
  minWidth?: number
  maxWidth?: number
  defaultWidth?: number
}

/**
 * Resizable right-column width for till layouts. Persists to localStorage and
 * resizes on pointer drag. The handle sits LEFT of the panel; dragging left
 * widens the panel (negative X delta → larger width).
 */
export function useResizableSidePanel({
  storageKey,
  minWidth = SIDE_PANEL_MIN_WIDTH,
  maxWidth = SIDE_PANEL_MAX_WIDTH,
  defaultWidth = SIDE_PANEL_DEFAULT_WIDTH,
}: UseResizableSidePanelOptions) {
  const clamp = React.useCallback(
    (px: number) => clampSidePanelWidth(px, minWidth, maxWidth, defaultWidth),
    [minWidth, maxWidth, defaultWidth]
  )

  const [width, setWidth] = React.useState<number>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) return clamp(parseFloat(raw))
    } catch {
      /* SSR / privacy mode */
    }
    return defaultWidth
  })

  const dragStartX = React.useRef(0)
  const dragStartWidth = React.useRef(width)
  const dragging = React.useRef(false)

  const onMove = React.useCallback(
    (clientX: number) => {
      if (!dragging.current) return
      const delta = dragStartX.current - clientX
      setWidth(clamp(dragStartWidth.current + delta))
    },
    [clamp]
  )

  const stop = React.useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    document.body.style.removeProperty('cursor')
    document.body.style.removeProperty('user-select')
    setWidth((w) => {
      try {
        localStorage.setItem(storageKey, String(w))
      } catch {
        /* ignore */
      }
      return w
    })
  }, [storageKey])

  React.useEffect(() => {
    const mouseMove = (e: MouseEvent) => onMove(e.clientX)
    const touchMove = (e: TouchEvent) => {
      if (e.touches[0]) onMove(e.touches[0].clientX)
    }
    window.addEventListener('mousemove', mouseMove)
    window.addEventListener('mouseup', stop)
    window.addEventListener('touchmove', touchMove)
    window.addEventListener('touchend', stop)
    return () => {
      window.removeEventListener('mousemove', mouseMove)
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('touchmove', touchMove)
      window.removeEventListener('touchend', stop)
    }
  }, [onMove, stop])

  const start = React.useCallback((clientX: number) => {
    dragging.current = true
    dragStartX.current = clientX
    setWidth((w) => {
      dragStartWidth.current = w
      return w
    })
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  return { width, start }
}

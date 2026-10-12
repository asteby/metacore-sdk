import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

const FAB_POS_KEY = 'aby-chat-fab-pos'
const DRAG_THRESHOLD_PX = 6
const FAB_SIZE = 48
const PANEL_W = 400
const PANEL_H = 560
const GAP = 12
const MARGIN = 16
/** App header (sticky h-16) — keep chat panel below it. */
const HEADER_RESERVE = 64

export type FabPosition = { bottom: number; right: number }

export type PanelLayout = {
  bottom: number
  right: number
  width: number
  height: number
  /** Panel opens above the FAB when true, below when false. */
  opensAbove: boolean
}

function readFabPosition(): FabPosition | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(FAB_POS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as FabPosition
    if (
      typeof parsed.bottom === 'number' &&
      typeof parsed.right === 'number' &&
      Number.isFinite(parsed.bottom) &&
      Number.isFinite(parsed.right)
    ) {
      return parsed
    }
  } catch {
    /* ignore */
  }
  return null
}

function clampFabPosition(pos: FabPosition, size = FAB_SIZE): FabPosition {
  const margin = MARGIN
  const maxBottom = Math.max(margin, window.innerHeight - size - margin)
  const maxRight = Math.max(margin, window.innerWidth - size - margin)
  return {
    bottom: Math.min(Math.max(margin, pos.bottom), maxBottom),
    right: Math.min(Math.max(margin, pos.right), maxRight),
  }
}

/**
 * Default FAB position for surfaces whose primary action owns the bottom-right
 * corner (the POS "Crear venta" button). FabPosition is right-anchored, so
 * "bottom-left" is expressed as a right offset computed from the viewport
 * width at mount; on a later resize the FAB keeps its right offset (clamped
 * on-screen) rather than hugging the left edge — fine for fixed terminal
 * screens, and the user can always drag it (the dragged spot persists).
 * Only a DEFAULT: a position the user already dragged always wins.
 */
export function bottomLeftFabPosition(
  viewportWidth: number = typeof window !== 'undefined' ? window.innerWidth : 1280,
): FabPosition {
  const edge = 24
  return { bottom: edge, right: Math.max(edge, viewportWidth - FAB_SIZE - edge) }
}

/** Anchor the chat panel to the FAB, flipping above/below and clamping to the viewport. */
export function computePanelLayout(
  fab: FabPosition,
  viewport = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  },
): PanelLayout {
  const vw = viewport.width
  const vh = viewport.height
  const width = Math.min(PANEL_W, vw - MARGIN * 2)
  const topReserve = HEADER_RESERVE + MARGIN
  const maxHeight = vh - MARGIN - topReserve

  const fabTop = vh - fab.bottom - FAB_SIZE
  const spaceAbove = fabTop - MARGIN
  const spaceBelow = fab.bottom - MARGIN

  const preferAbove = spaceAbove >= spaceBelow
  let opensAbove = preferAbove
  let height = Math.min(PANEL_H, maxHeight)

  if (opensAbove) {
    height = Math.min(height, Math.max(280, spaceAbove - GAP))
    if (height < 280 && spaceBelow - GAP >= 280) {
      opensAbove = false
      height = Math.min(PANEL_H, spaceBelow - GAP, maxHeight)
    }
  } else {
    height = Math.min(height, Math.max(280, spaceBelow - GAP))
    if (height < 280 && spaceAbove - GAP >= 280) {
      opensAbove = true
      height = Math.min(PANEL_H, spaceAbove - GAP, maxHeight)
    }
  }

  height = Math.max(280, Math.min(height, maxHeight))

  let bottom: number
  if (opensAbove) {
    bottom = fab.bottom + FAB_SIZE + GAP
  } else {
    bottom = Math.max(MARGIN, fab.bottom - height - GAP)
  }

  let right = fab.right
  const panelLeft = vw - right - width
  if (panelLeft < MARGIN) {
    right = Math.max(MARGIN, vw - width - MARGIN)
  }

  const panelTop = vh - bottom - height
  if (panelTop < topReserve) {
    bottom = Math.max(MARGIN, vh - height - topReserve)
  }

  return { bottom, right, width, height, opensAbove }
}

export function useDraggableFab(defaultPos: FabPosition = { bottom: 24, right: 24 }) {
  const [pos, setPos] = useState<FabPosition>(() => {
    const saved = readFabPosition()
    if (saved && typeof window !== 'undefined') {
      return clampFabPosition(saved)
    }
    return defaultPos
  })
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }))

  const dragRef = useRef<{
    startX: number
    startY: number
    origin: FabPosition
    moved: boolean
  } | null>(null)
  const skipNextClickRef = useRef(false)

  useEffect(() => {
    const sync = () => {
      setPos((p) => clampFabPosition(p))
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origin: pos,
        moved: false,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [pos],
  )

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    drag.moved = true
    const next = clampFabPosition({
      bottom: drag.origin.bottom - dy,
      right: drag.origin.right - dx,
    })
    setPos(next)
  }, [])

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    if (drag?.moved) {
      skipNextClickRef.current = true
      setPos((current) => {
        localStorage.setItem(FAB_POS_KEY, JSON.stringify(current))
        return current
      })
    }
  }, [])

  const shouldSkipFabClick = useCallback(() => {
    if (!skipNextClickRef.current) return false
    skipNextClickRef.current = false
    return true
  }, [])

  const fabStyle = useMemo(
    () => ({
      bottom: pos.bottom,
      right: pos.right,
      touchAction: 'none' as const,
    }),
    [pos],
  )

  const panelLayout = useMemo(
    () => computePanelLayout(pos, viewport),
    [pos, viewport],
  )

  return {
    fabStyle,
    panelLayout,
    onFabPointerDown: onPointerDown,
    onFabPointerMove: onPointerMove,
    onFabPointerUp: onPointerUp,
    shouldSkipFabClick,
  }
}

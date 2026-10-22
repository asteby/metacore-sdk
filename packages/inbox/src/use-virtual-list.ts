import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

export interface VirtualRange {
  /** First rendered index (inclusive). */
  start: number
  /** Last rendered index (exclusive). */
  end: number
  totalSize: number
}

/** Pure window math, exported for tests. Fixed row height keeps scrolling fluid at any count. */
export function computeRange(count: number, itemSize: number, scrollTop: number, viewport: number, overscan: number): VirtualRange {
  const totalSize = count * itemSize
  if (count === 0 || itemSize <= 0) return { start: 0, end: 0, totalSize: 0 }
  const first = Math.floor(Math.max(0, scrollTop) / itemSize)
  const last = Math.ceil((Math.max(0, scrollTop) + viewport) / itemSize)
  return { start: Math.max(0, first - overscan), end: Math.min(count, last + overscan), totalSize }
}

export interface UseVirtualListOptions {
  count: number
  itemSize: number
  overscan?: number
  /** Viewport height assumed until the element is measured (SSR / first paint). */
  fallbackViewport?: number
}

/**
 * Dependency-free windowing for a scroll container. Scroll position is read
 * on rAF and the range only commits to state when it changes, so scrolling
 * inside a window of rows costs zero renders.
 */
export function useVirtualList(ref: RefObject<HTMLElement | null>, opts: UseVirtualListOptions) {
  const { count, itemSize, overscan = 6, fallbackViewport = 640 } = opts
  const [range, setRange] = useState<VirtualRange>(() => computeRange(count, itemSize, 0, fallbackViewport, overscan))
  const state = useRef({ top: 0, height: 0 })

  const recompute = useCallback(() => {
    const el = ref.current
    if (el) {
      state.current.top = el.scrollTop
      state.current.height = el.clientHeight || state.current.height
    }
    const h = state.current.height || fallbackViewport
    const next = computeRange(count, itemSize, state.current.top, h, overscan)
    setRange((prev) => (prev.start === next.start && prev.end === next.end && prev.totalSize === next.totalSize ? prev : next))
  }, [ref, count, itemSize, overscan, fallbackViewport])

  useLayoutEffect(recompute, [recompute])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        recompute()
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onScroll)
      ro.observe(el)
    }
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro?.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [ref, recompute])

  /** Scrolls so the row is fully visible (no-op when it already is). */
  const scrollToIndex = useCallback(
    (index: number) => {
      const el = ref.current
      if (!el) return
      const top = index * itemSize
      const h = el.clientHeight || state.current.height || fallbackViewport
      if (top < el.scrollTop) el.scrollTop = top
      else if (top + itemSize > el.scrollTop + h) el.scrollTop = top + itemSize - h
      recompute()
    },
    [ref, itemSize, fallbackViewport, recompute],
  )

  return { ...range, scrollToIndex }
}

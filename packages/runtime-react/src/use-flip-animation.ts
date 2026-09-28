import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import {
  motionDuration,
  motionEasing,
  prefersReducedMotion,
  type MotionDuration,
  type MotionEasing,
} from './motion'

export interface UseFlipAnimationOptions {
  /** Elements to animate, queried inside the root. */
  selector?: string
  /** Stable identity of an element across renders. Default: data-flip-key, then href, then text. */
  keyOf?: (el: HTMLElement) => string | null
  /**
   * Scroll container used as the coordinate origin, so scrolling between two
   * snapshots does not read as movement. Default: the root.
   */
  scrollContainer?: (root: HTMLElement) => HTMLElement | null
  /** Motion token (default `moderate`) or explicit ms. */
  duration?: MotionDuration | number
  /** Motion token (default `standard`) or a CSS timing function. */
  easing?: MotionEasing | string
  /** Off switch; the hook also stays still under prefers-reduced-motion. */
  disabled?: boolean
}

const DEFAULT_SELECTOR = '[data-flip-key]'
const MOTION_EASING_KEYS = { standard: 1, emphasized: 1, exit: 1 }

const defaultKeyOf = (el: HTMLElement): string | null =>
  el.dataset.flipKey ?? el.getAttribute('href') ?? (el.textContent?.trim() || null)

type Positions = Map<string, { top: number; left: number }>

/**
 * FLIP reorder animation: when `trigger` changes, elements that exist before
 * and after the change glide from their old position to the new one.
 *
 * Positions are snapshotted when the list is at rest (after mount, after each
 * animation, and after pointer interaction inside the root), never in the
 * render path, so a re-render costs nothing. Uses the Web Animations API on
 * `transform` only; with prefers-reduced-motion the change is instant.
 */
export function useFlipAnimation(
  rootRef: RefObject<HTMLElement | null>,
  trigger: unknown,
  options: UseFlipAnimationOptions = {},
): void {
  const {
    selector = DEFAULT_SELECTOR,
    keyOf = defaultKeyOf,
    scrollContainer,
    duration = 'moderate',
    easing = 'standard',
    disabled = false,
  } = options
  const positionsRef = useRef<Positions | null>(null)
  const triggerRef = useRef(trigger)
  const configRef = useRef({ selector, keyOf, scrollContainer })
  useEffect(() => {
    configRef.current = { selector, keyOf, scrollContainer }
  })

  const measure = (): Positions | null => {
    const root = rootRef.current
    if (!root) return null
    const { selector: sel, keyOf: key, scrollContainer: sc } = configRef.current
    const origin = (sc ? sc(root) : null) ?? root
    const box = origin.getBoundingClientRect()
    const out: Positions = new Map()
    root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      const k = key(el)
      if (!k || out.has(k)) return
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return
      out.set(k, {
        top: r.top - box.top + origin.scrollTop,
        left: r.left - box.left + origin.scrollLeft,
      })
    })
    return out
  }
  const measureRef = useRef(measure)
  useEffect(() => {
    measureRef.current = measure
  })

  // Snapshot at rest: after mount and after interactions that move things
  // without a trigger change (expanding a collapsible, for instance).
  // Listens on the document and resolves the root per event, so a ref whose
  // element is swapped (remount, mobile sheet) keeps working.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        positionsRef.current = measureRef.current()
      }, 350)
    }
    const onInteraction = (e: Event) => {
      const root = rootRef.current
      if (root && e.target instanceof Node && root.contains(e.target)) schedule()
    }
    schedule()
    document.addEventListener('pointerup', onInteraction, true)
    document.addEventListener('keyup', onInteraction, true)
    window.addEventListener('resize', schedule)
    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('pointerup', onInteraction, true)
      document.removeEventListener('keyup', onInteraction, true)
      window.removeEventListener('resize', schedule)
    }
  }, [rootRef])

  useLayoutEffect(() => {
    if (Object.is(triggerRef.current, trigger)) return
    triggerRef.current = trigger
    const before = positionsRef.current
    const root = rootRef.current
    if (!root) return
    const after = measureRef.current()
    positionsRef.current = after
    if (!before || !after || disabled || prefersReducedMotion()) return
    const durationMs = typeof duration === 'number' ? duration : motionDuration(duration)
    if (durationMs <= 0) return
    const timing = easing in MOTION_EASING_KEYS ? motionEasing(easing as MotionEasing) : easing

    const { selector: sel, keyOf: key } = configRef.current
    // A stale snapshot can report huge jumps; those would read as a glitch.
    const maxJump = root.clientHeight > 0 ? root.clientHeight * 1.5 : Infinity
    root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      const k = key(el)
      if (!k) return
      const from = before.get(k)
      const to = after.get(k)
      if (!to || typeof el.animate !== 'function') return
      if (!from) {
        // Entered with this change: fade in instead of popping.
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: durationMs, easing: timing })
        return
      }
      const dy = from.top - to.top
      const dx = from.left - to.left
      if (Math.abs(dy) < 1 && Math.abs(dx) < 1) return
      if (Math.abs(dy) > maxJump) return
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: 'translate(0, 0)' },
        ],
        { duration: durationMs, easing: timing },
      )
    })
  }, [trigger, rootRef, disabled, duration, easing])
}

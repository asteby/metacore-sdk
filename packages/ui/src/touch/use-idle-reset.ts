import * as React from 'react'

const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'touchstart',
  'wheel',
] as const

export interface UseIdleResetResult {
  /** True during the last `warnSeconds` before the reset fires. */
  warning: boolean
  /** Whole seconds left until reset while `warning`, else `null`. */
  secondsLeft: number | null
  /** Restart the idle countdown (e.g. from a "keep going" button). */
  reset: () => void
}

/**
 * Calls `onReset` after `seconds` without user activity; `warning` turns on for
 * the last `warnSeconds` so the screen can show "¿Sigues ahí?". Any pointer,
 * key, touch or wheel activity restarts the countdown (and dismisses the
 * warning). `seconds <= 0` disables it.
 */
export function useIdleReset(
  seconds: number,
  warnSeconds: number,
  onReset: () => void,
): UseIdleResetResult {
  const [secondsLeft, setSecondsLeft] = React.useState<number | null>(null)
  const onResetRef = React.useRef(onReset)
  onResetRef.current = onReset
  const deadline = React.useRef(0)

  const restart = React.useCallback(() => {
    deadline.current = Date.now() + seconds * 1000
    setSecondsLeft(null)
  }, [seconds])

  React.useEffect(() => {
    if (!(seconds > 0)) {
      setSecondsLeft(null)
      return
    }
    const warn = Math.min(Math.max(warnSeconds, 0), seconds)
    restart()
    const tick = () => {
      const left = (deadline.current - Date.now()) / 1000
      if (left <= 0) {
        restart()
        onResetRef.current()
      } else if (warn > 0 && left <= warn) {
        setSecondsLeft(Math.ceil(left))
      }
    }
    const id = setInterval(tick, 250)
    // While the warning is up, plain pointer jitter must not hide it silently
    // forever, but any real interaction is an answer: restart on all activity.
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, restart, { passive: true })
    return () => {
      clearInterval(id)
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, restart)
    }
  }, [seconds, warnSeconds, restart])

  return { warning: secondsLeft !== null, secondsLeft, reset: restart }
}

import * as React from 'react'

interface WakeLockSentinelLike {
  release: () => Promise<void>
  addEventListener: (type: 'release', cb: () => void) => void
}
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
}

export interface UseWakeLockResult {
  /** The browser exposes the Screen Wake Lock API. */
  supported: boolean
  /** A lock is currently held. */
  active: boolean
}

/**
 * Keeps the screen awake while `enabled` (default true). The browser drops the
 * lock whenever the tab is hidden, so it is re-acquired on `visibilitychange`.
 * Unsupported browsers and rejected requests (low battery, no gesture) are a
 * silent no-op: a kiosk must keep working without it.
 */
export function useWakeLock(enabled = true): UseWakeLockResult {
  const supported =
    typeof navigator !== 'undefined' && !!(navigator as WakeLockNavigator).wakeLock
  const [active, setActive] = React.useState(false)

  React.useEffect(() => {
    if (!enabled || !supported) {
      setActive(false)
      return
    }
    let cancelled = false
    let sentinel: WakeLockSentinelLike | null = null

    const acquire = async () => {
      if (sentinel || document.visibilityState !== 'visible') return
      try {
        const s = await (navigator as WakeLockNavigator).wakeLock!.request('screen')
        if (cancelled) {
          void s.release().catch(() => {})
          return
        }
        sentinel = s
        setActive(true)
        s.addEventListener('release', () => {
          if (sentinel === s) sentinel = null
          if (!cancelled) setActive(false)
        })
      } catch {
        if (!cancelled) setActive(false)
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      const s = sentinel
      sentinel = null
      if (s) void s.release().catch(() => {})
      setActive(false)
    }
  }, [enabled, supported])

  return { supported, active }
}

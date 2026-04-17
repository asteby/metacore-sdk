import { useCallback, useEffect, useState } from 'react'

/**
 * Subset of the Badging API (https://wicg.github.io/badging/). Declared as
 * a standalone type since native lib.dom typings may or may not include it
 * depending on TypeScript version.
 */
interface BadgingNavigator {
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

/**
 * Drives `navigator.setAppBadge()` (Badging API) when available, gracefully
 * degrading to a no-op on browsers that don't implement it.
 *
 * Returned `setBadge(count)` keeps a local counter in sync with the OS/PWA
 * badge; passing `0` clears it. `clearBadge()` forces removal.
 */
export function useAppBadge() {
  const [counter, setCounter] = useState(0)

  const setBadge = useCallback((count: number) => {
    setCounter(count)
    if (typeof navigator === 'undefined') return
    const nav = navigator as Navigator & BadgingNavigator
    if (typeof nav.setAppBadge === 'function') {
      if (count > 0) {
        nav.setAppBadge(count).catch((e) => {
          // eslint-disable-next-line no-console
          console.error('Error setting app badge:', e)
        })
      } else if (typeof nav.clearAppBadge === 'function') {
        nav.clearAppBadge().catch((e) => {
          // eslint-disable-next-line no-console
          console.error('Error clearing app badge:', e)
        })
      }
    }
  }, [])

  const clearBadge = useCallback(() => {
    setCounter(0)
    if (typeof navigator === 'undefined') return
    const nav = navigator as Navigator & BadgingNavigator
    if (typeof nav.clearAppBadge === 'function') {
      nav.clearAppBadge().catch((e) => {
        // eslint-disable-next-line no-console
        console.error('Error clearing app badge:', e)
      })
    }
  }, [])

  return {
    badgeCount: counter,
    setBadge,
    clearBadge,
  }
}

/**
 * Tracks the current `Notification.permission` state and exposes a helper
 * to request it. Polls every second to detect out-of-band changes (e.g.
 * the user toggling the permission from the browser's site settings).
 */
export function useNotifications() {
  const isSupported =
    typeof window !== 'undefined' && 'Notification' in window

  const [permission, setPermission] = useState<NotificationPermission>(
    isSupported ? Notification.permission : 'default',
  )

  useEffect(() => {
    if (!isSupported) return
    const interval = setInterval(() => {
      setPermission(Notification.permission)
    }, 1000)
    return () => clearInterval(interval)
  }, [isSupported])

  const requestPermission = useCallback(async () => {
    if (!isSupported) return false
    const result = await Notification.requestPermission()
    setPermission(result)
    return result === 'granted'
  }, [isSupported])

  return {
    permission,
    isSupported,
    requestPermission,
    isGranted: permission === 'granted',
    isDenied: permission === 'denied',
    isDefault: permission === 'default',
  }
}

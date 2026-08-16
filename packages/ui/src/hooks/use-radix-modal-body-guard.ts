import * as React from 'react'
import {
  restoreBodyInteraction,
  scheduleRestoreBodyInteraction,
} from '@/lib/restore-body-interaction'

/**
 * Guards Radix modal roots against a stuck `pointer-events: none` on `<body>`
 * when the tree unmounts while still open (common with federated action modals
 * that refresh the parent list before the dialog finishes closing).
 */
export function useRadixModalBodyGuard(
  open: boolean | undefined,
  onOpenChange?: (open: boolean) => void,
): (next: boolean) => void {
  const openRef = React.useRef(!!open)
  openRef.current = !!open

  React.useEffect(() => {
    if (open === false) {
      scheduleRestoreBodyInteraction()
    }
  }, [open])

  React.useEffect(() => {
    return () => {
      // Unmount while open → RemoveScroll never cleans up.
      if (openRef.current) {
        restoreBodyInteraction()
        scheduleRestoreBodyInteraction()
      }
    }
  }, [])

  return React.useCallback(
    (next: boolean) => {
      onOpenChange?.(next)
      if (!next) scheduleRestoreBodyInteraction()
    },
    [onOpenChange],
  )
}

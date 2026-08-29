import * as React from 'react'
import { isNestedInlineCreateOpen } from '@/lib/nested-inline-create'
import {
  restoreBodyInteraction,
  scheduleRestoreBodyInteraction,
} from '@/lib/restore-body-interaction'

export type RadixModalBodyGuardOptions = {
  /** When true, this dialog IS the inline-create modal and may close normally. */
  nestedInlineCreateSelf?: boolean
}

/**
 * Guards Radix modal roots against a stuck `pointer-events: none` on `<body>`
 * when the tree unmounts while still open (common with federated action modals
 * that refresh the parent list before the dialog finishes closing).
 *
 * Also blocks dismiss while a sibling inline-create dialog is open (federated
 * parent + host RecordCreateBridge) — otherwise focus/clicks on the inner form
 * close "Procesar orden" and similar action modals.
 */
export function useRadixModalBodyGuard(
  open: boolean | undefined,
  onOpenChange?: (open: boolean) => void,
  options?: RadixModalBodyGuardOptions,
): (next: boolean) => void {
  const nestedSelf = !!options?.nestedInlineCreateSelf
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
      if (!next && !nestedSelf && isNestedInlineCreateOpen()) return
      onOpenChange?.(next)
      if (!next) scheduleRestoreBodyInteraction()
    },
    [onOpenChange, nestedSelf],
  )
}

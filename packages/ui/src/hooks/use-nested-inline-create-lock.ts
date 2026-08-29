import { useEffect } from 'react'
import { pushNestedInlineCreate } from '@/lib/nested-inline-create'

/** Hold a cross-bundle lock while an inline-create dialog is open. */
export function useNestedInlineCreateLock(open: boolean): void {
  useEffect(() => {
    if (!open) return
    return pushNestedInlineCreate()
  }, [open])
}

/**
 * `<InvoicePreviewDialog />` as the stores use it: the dialog and the CFDI reader load the first time it opens (the order
 * screens' first load does not carry them). Same props as the dialog in `invoice-preview.tsx`.
 */
import { lazy, Suspense } from 'react'
import type { InvoicePreviewDialogProps } from './invoice-preview.js'

const Dialog = lazy(() => import('./invoice-preview.js').then((x) => ({ default: x.InvoicePreviewDialog })))

export function InvoicePreviewDialog(props: InvoicePreviewDialogProps) {
  if (!props.open) return null
  return (
    <Suspense fallback={null}>
      <Dialog {...props} />
    </Suspense>
  )
}

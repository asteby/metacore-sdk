import * as React from 'react'
import {
  ResponsiveDialog,
  type ResponsiveDialogFooter,
  type ResponsiveDialogProps,
  type ResponsiveDialogSize,
} from './responsive-dialog'

export type ModalSize = ResponsiveDialogSize

export type ModalProps = {
  /** Controlled open state. */
  open: boolean
  /** Called when the dialog requests an open-state change. */
  onOpenChange: (open: boolean) => void
  /** Header title. Omit for a chromeless modal. */
  title?: React.ReactNode
  /** Optional supporting text under the title. */
  description?: React.ReactNode
  /** Width preset (desktop). */
  size?: ModalSize
  /** Footer node (typically action buttons). Prefer `footerActions`. */
  footer?: React.ReactNode
  /** Declarative footer with fixed hierarchy (primary / secondary / destructive / extra). */
  footerActions?: ResponsiveDialogFooter
  /**
   * When false, the modal cannot be dismissed by overlay click, Esc or swipe.
   * Use for destructive/in-flight flows. Defaults to true.
   */
  dismissable?: boolean
  /** Show the top-right close button. Defaults to true. */
  showCloseButton?: boolean
  /** Below 768px: bottom `sheet` (default), `fullscreen` or centered `dialog`. */
  mobile?: ResponsiveDialogProps['mobile']
  className?: string
  /** Extra class on the scrollable body wrapper. */
  bodyClassName?: string
  children?: React.ReactNode
}

/**
 * Modal — the reusable dialog composition every addon builds on, now on top
 * of `ResponsiveDialog`: centered from 768px up, bottom sheet with a sticky
 * footer below. Same props as before plus `footerActions` and `mobile`.
 *
 * @example
 * <Modal open={open} onOpenChange={setOpen} title="Edit product"
 *   footerActions={{ primary: { label: 'Save', run: save } }}>
 *   <ProductForm />
 * </Modal>
 */
export function Modal({ footer, footerActions, ...props }: ModalProps) {
  return <ResponsiveDialog {...props} footer={footerActions} footerContent={footer} />
}

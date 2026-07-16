import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/primitives/dialog'

const modalContentVariants = cva('', {
  variants: {
    size: {
      sm: 'sm:max-w-sm',
      md: 'sm:max-w-lg',
      lg: 'sm:max-w-2xl',
      xl: 'sm:max-w-4xl',
      full: 'sm:max-w-[calc(100%-4rem)] sm:h-[calc(100%-4rem)]',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

export type ModalSize = NonNullable<VariantProps<typeof modalContentVariants>['size']>

export type ModalProps = {
  /** Controlled open state. */
  open: boolean
  /** Called when the dialog requests an open-state change. */
  onOpenChange: (open: boolean) => void
  /** Header title. Omit for a chromeless modal. */
  title?: React.ReactNode
  /** Optional supporting text under the title. */
  description?: React.ReactNode
  /** Width preset. */
  size?: ModalSize
  /** Footer node (typically action buttons). */
  footer?: React.ReactNode
  /**
   * When false, the modal cannot be dismissed by overlay click or Esc.
   * Use for destructive/in-flight flows. Defaults to true.
   */
  dismissable?: boolean
  /** Show the top-right close button. Defaults to true. */
  showCloseButton?: boolean
  className?: string
  /** Extra class on the scrollable body wrapper. */
  bodyClassName?: string
  children?: React.ReactNode
}

/**
 * Modal — the reusable dialog composition every addon builds on.
 *
 * Wraps the raw `Dialog` primitive with a standard title/description/body/footer
 * layout, width presets, a scrollable body, and a `dismissable` guard for
 * in-flight or destructive flows. This is the shared base for "modal custom"
 * surfaces so addons don't each re-implement dialog chrome.
 *
 * @example
 * <Modal open={open} onOpenChange={setOpen} title="Edit product"
 *   footer={<Button onClick={save}>Save</Button>}>
 *   <ProductForm />
 * </Modal>
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  size,
  footer,
  dismissable = true,
  showCloseButton = true,
  className,
  bodyClassName,
  children,
}: ModalProps) {
  const guard = React.useCallback(
    (e: Event) => {
      if (!dismissable) e.preventDefault()
    },
    [dismissable]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={showCloseButton && dismissable}
        className={cn(
          'flex max-h-[calc(100dvh-2rem)] flex-col gap-4',
          modalContentVariants({ size }),
          className
        )}
        onEscapeKeyDown={guard}
        onInteractOutside={guard}
      >
        {title ? (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
        ) : null}
        <div className={cn('-mx-1 flex-1 overflow-y-auto px-1', bodyClassName)}>
          {children}
        </div>
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}

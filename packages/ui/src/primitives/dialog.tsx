import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'
import { useRadixModalBodyGuard } from '@/hooks/use-radix-modal-body-guard'
import {
  guardNestedInlineCreateDismiss,
  isNestedInlineCreateOpen,
  subscribeNestedInlineCreate,
} from '@/lib/nested-inline-create'
import { cn } from '@/lib/utils'

type DialogProps = React.ComponentProps<typeof DialogPrimitive.Root> & {
  /** Set on the inline-create dialog opened from a dynamic_select "+". */
  nestedInlineCreateSelf?: boolean
}

/** Cross-bundle depth as reactive state (window-event backed). */
function useNestedInlineCreateOpen(): boolean {
  return React.useSyncExternalStore(
    subscribeNestedInlineCreate,
    isNestedInlineCreateOpen,
    () => false,
  )
}

function Dialog({
  open,
  onOpenChange,
  nestedInlineCreateSelf,
  modal,
  ...props
}: DialogProps) {
  const handleOpenChange = useRadixModalBodyGuard(open, onOpenChange, {
    nestedInlineCreateSelf,
  })
  // While an inline-create sibling dialog is open (host RecordCreateBridge,
  // possibly in ANOTHER MF bundle), drop this dialog's modality: the dismiss
  // guards already keep it open, but Radix's FocusScope (trapped when modal)
  // would keep YANKING focus back from the sibling — its content lives in a
  // different React tree, so the trap treats it as outside — making the
  // create form impossible to type into. Non-modal releases the trap; the
  // depth event restores modality the moment the create closes.
  const inlineOpen = useNestedInlineCreateOpen()
  const effectiveModal = nestedInlineCreateSelf ? modal : inlineOpen ? false : modal
  return (
    <DialogPrimitive.Root
      data-slot='dialog'
      open={open}
      onOpenChange={handleOpenChange}
      modal={effectiveModal}
      {...props}
    />
  )
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot='dialog-trigger' {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot='dialog-portal' {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot='dialog-close' {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot='dialog-overlay'
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50',
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onInteractOutside,
  onPointerDownOutside,
  onFocusOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const guardOutside = React.useCallback(
    (e: Event) => {
      guardNestedInlineCreateDismiss(e)
    },
    [],
  )
  return (
    <DialogPortal data-slot='dialog-portal'>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot='dialog-content'
        className={cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg',
          className
        )}
        onInteractOutside={(e) => {
          guardOutside(e)
          onInteractOutside?.(e)
        }}
        onPointerDownOutside={(e) => {
          guardOutside(e)
          onPointerDownOutside?.(e)
        }}
        onFocusOutside={(e) => {
          guardOutside(e)
          onFocusOutside?.(e)
        }}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot='dialog-close'
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute end-4 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className='sr-only'>Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='dialog-header'
      className={cn('flex flex-col gap-2 text-center sm:text-start', className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='dialog-footer'
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot='dialog-title'
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot='dialog-description'
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}

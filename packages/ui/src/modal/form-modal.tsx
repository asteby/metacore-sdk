import * as React from 'react'
import { Modal, type ModalProps } from './modal'
import type { ResponsiveDialogAction } from './responsive-dialog'

export type FormModalProps = Omit<ModalProps, 'footer' | 'footerActions' | 'dismissable'> & {
  /** Submit handler. Receives the native submit event. */
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  /** Disables inputs/close and shows a busy submit button. */
  isSubmitting?: boolean
  /** Independently disable the submit button (e.g. invalid form). */
  submitDisabled?: boolean
  submitText?: React.ReactNode
  cancelText?: React.ReactNode
  /** Render the primary action as destructive. */
  destructive?: boolean
  /** Hide the cancel button. */
  hideCancel?: boolean
  /** Extra footer content rendered to the start of the action row. */
  footerStart?: React.ReactNode
  /** Extra footer actions from the host (e.g. «Ver historial»). */
  footerExtra?: ResponsiveDialogAction[]
}

/**
 * FormModal — a Modal wired for the dominant CRUD pattern: a form body plus a
 * Cancel/Submit footer, submit-on-enter, and a busy state that locks the modal
 * closed while the request is in flight. On phones it is a bottom sheet with
 * the submit button full width in the sticky footer.
 *
 * The children are the form fields; the `<form>` and footer buttons are supplied.
 *
 * @example
 * <FormModal open={open} onOpenChange={setOpen} title="New customer"
 *   isSubmitting={mutation.isPending} onSubmit={handleSubmit}>
 *   <Input {...register('name')} />
 * </FormModal>
 */
export function FormModal({
  onSubmit,
  isSubmitting = false,
  submitDisabled = false,
  submitText,
  cancelText,
  destructive,
  hideCancel,
  footerStart,
  footerExtra,
  onOpenChange,
  children,
  ...modalProps
}: FormModalProps) {
  const formId = React.useId()

  return (
    <Modal
      {...modalProps}
      onOpenChange={onOpenChange}
      dismissable={!isSubmitting}
      footerActions={{
        start: footerStart,
        primary: {
          key: 'submit',
          label: submitText ?? 'Save',
          type: 'submit',
          form: formId,
          loading: isSubmitting,
          disabled: submitDisabled,
          destructive,
        },
        secondary: hideCancel
          ? []
          : [{ key: 'cancel', label: cancelText ?? 'Cancel', disabled: isSubmitting, run: () => onOpenChange(false) }],
        extra: footerExtra,
      }}
    >
      <form id={formId} onSubmit={onSubmit} className='flex flex-col gap-4' noValidate>
        {children}
      </form>
    </Modal>
  )
}

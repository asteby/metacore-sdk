import * as React from 'react'
import { Button } from '@/primitives/button'
import { Modal, type ModalProps } from './modal'

export type FormModalProps = Omit<ModalProps, 'footer' | 'dismissable'> & {
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
}

/**
 * FormModal — a Modal wired for the dominant CRUD pattern: a form body plus a
 * Cancel/Submit footer, submit-on-enter, and a busy state that locks the modal
 * closed while the request is in flight.
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
      footer={
        <>
          {footerStart ? (
            <div className='mr-auto flex items-center'>{footerStart}</div>
          ) : null}
          {!hideCancel ? (
            <Button
              type='button'
              variant='outline'
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              {cancelText ?? 'Cancel'}
            </Button>
          ) : null}
          <Button
            type='submit'
            form={formId}
            variant={destructive ? 'destructive' : 'default'}
            disabled={isSubmitting || submitDisabled}
          >
            {submitText ?? 'Save'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={onSubmit}
        className='flex flex-col gap-4'
        noValidate
      >
        {children}
      </form>
    </Modal>
  )
}

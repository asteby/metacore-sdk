import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Loader2, MoreHorizontal, XIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/dialogs/confirm-dialog'
import { MOBILE_BREAKPOINT } from '@/hooks/use-mobile'
import { guardNestedInlineCreateDismiss } from '@/lib/nested-inline-create'
import { cn } from '@/lib/utils'
import { Button } from '@/primitives/button'
import { Dialog, DialogOverlay, DialogPortal } from '@/primitives/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/primitives/dropdown-menu'

/**
 * One footer action. Structurally compatible with `ActionItem` (ui `ActionBar`)
 * and with `ModalFooterAction` (`@asteby/metacore-sdk`, `ModalProps.footerExtra`).
 */
export interface ResponsiveDialogAction {
  key?: string
  /** Visible text. A string is preferred (it is reused in the confirmation copy). */
  label: React.ReactNode
  icon?: React.ReactNode
  /** Optional when `type: 'submit'` (the form's onSubmit does the work). */
  run?: () => void | Promise<unknown>
  disabled?: boolean
  /** Implies `disabled`; shown as text in the «⋯» menu and as `title` on buttons. */
  disabledReason?: string
  /** External busy flag; a pending `run` promise also shows the spinner. */
  loading?: boolean
  type?: 'button' | 'submit'
  /** Form id for `type: 'submit'` buttons rendered outside the `<form>`. */
  form?: string
  /**
   * Confirmation before `run`. `destructive` actions confirm by default with a
   * generic copy; `false` skips it when the host already confirms.
   */
  confirm?: { title?: string; description?: string; confirmLabel?: string; cancelLabel?: string } | false
}

export interface ResponsiveDialogFooter {
  /** The single call to action of the step. Full width on phones, rightmost on desktop. */
  primary?: ResponsiveDialogAction & {
    /** Paint the primary as destructive (e.g. «Eliminar» as the dialog's only purpose). */
    destructive?: boolean
  }
  /** Phones: the first one sits next to «⋯», the rest go inside it. */
  secondary?: ResponsiveDialogAction[]
  /** Red, away from the primary (desktop: far left; phones: last in «⋯»), always confirmed. */
  destructive?: ResponsiveDialogAction[]
  /** Host-provided actions (e.g. «Ver historial» from a deep link). Desktop: before secondaries; phones: in «⋯». */
  extra?: ResponsiveDialogAction[]
  /** Free content at the start of the footer (hint, checkbox). */
  start?: React.ReactNode
}

export type ResponsiveDialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

export interface ResponsiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Dialog title (wraps, never truncated). Omit only for chromeless dialogs. */
  title?: React.ReactNode
  description?: React.ReactNode
  /** Icon next to the title. */
  icon?: React.ReactNode
  /** Fixed content under the title (stepper, tabs); does not scroll with the body. */
  header?: React.ReactNode
  /** Declarative footer with a fixed hierarchy. */
  footer?: ResponsiveDialogFooter
  /** Custom footer content, rendered in the same sticky footer (legacy `Modal.footer`). */
  footerContent?: React.ReactNode
  /** Desktop width. Default `md`. */
  size?: ResponsiveDialogSize
  /** Below 768px (`MOBILE_BREAKPOINT`): `sheet` (default), `fullscreen` or a centered `dialog`. */
  mobile?: 'sheet' | 'fullscreen' | 'dialog'
  /** When false, Esc, overlay click and swipe-down do not close. Default true. */
  dismissable?: boolean
  /** Show the close (X) button. Default true (hidden when not dismissable). */
  showCloseButton?: boolean
  /** Called when an action's `run` throws or rejects. Without it the error is rethrown. */
  onActionError?: (error: unknown, action: ResponsiveDialogAction) => void
  className?: string
  bodyClassName?: string
  children?: React.ReactNode
}

const SIZES: Record<ResponsiveDialogSize, string> = {
  sm: 'md:max-w-sm',
  md: 'md:max-w-lg',
  lg: 'md:max-w-2xl',
  xl: 'md:max-w-4xl',
  full: 'md:max-w-[calc(100%-4rem)] md:h-[calc(100dvh-4rem)]',
}

const desktopQuery = `(min-width: ${MOBILE_BREAKPOINT}px)`

function subscribeDesktop(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mql = window.matchMedia(desktopQuery)
  mql.addEventListener?.('change', onChange)
  return () => mql.removeEventListener?.('change', onChange)
}

function isDesktopNow() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(desktopQuery).matches
}

function useIsDesktop() {
  return React.useSyncExternalStore(subscribeDesktop, isDesktopNow, () => false)
}

/**
 * Space the on-screen keyboard takes at the bottom of the layout viewport
 * (`visualViewport`), so a bottom sheet's sticky footer stays above it.
 */
function useKeyboardInset(enabled: boolean) {
  const [inset, setInset] = React.useState(0)
  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.visualViewport) return
    const vv = window.visualViewport
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [enabled])
  return enabled ? inset : 0
}

const isActionDisabled = (a: ResponsiveDialogAction) => Boolean(a.disabled || a.disabledReason)
const actionKey = (a: ResponsiveDialogAction, i: number, group: string) => a.key ?? `${group}-${i}`

/**
 * ResponsiveDialog — a centered dialog from 768px up and a bottom sheet below
 * (drag handle, swipe down to close, `max-h-[92dvh]`, scrolling body, sticky
 * footer with safe-area and on-screen-keyboard insets).
 *
 * The footer has a fixed hierarchy instead of hand-placed buttons:
 * desktop `[destructive] ··· [start] [extra] [secondary] [PRIMARY]`; phones
 * stacked: PRIMARY full width, then the first secondary + «⋯» (other
 * secondaries, extra and — last, red — destructive). There is no «Cerrar»
 * button: the X, Esc, swipe and back close it.
 *
 * @example
 * <ResponsiveDialog open={open} onOpenChange={setOpen} title='Despacho SO-00004'
 *   header={<ProcessStepper … />}
 *   footer={{
 *     primary: { label: 'Confirmar picking', run: confirmPicking },
 *     secondary: [{ label: 'Imprimir surtido', icon: <Printer />, run: print }],
 *     destructive: [{ label: 'Liberar apartado', run: release, confirm: { title: '¿Liberar el apartado?' } }],
 *     extra: footerExtra,
 *   }}>
 *   {body}
 * </ResponsiveDialog>
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  header,
  footer,
  footerContent,
  size = 'md',
  mobile = 'sheet',
  dismissable = true,
  showCloseButton = true,
  onActionError,
  className,
  bodyClassName,
  children,
}: ResponsiveDialogProps) {
  const { t } = useTranslation()
  const isDesktop = useIsDesktop()
  const variant: 'dialog' | 'sheet' | 'fullscreen' = isDesktop ? 'dialog' : mobile
  const keyboardInset = useKeyboardInset(open && variant === 'sheet')
  const [busy, setBusy] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState<{ action: ResponsiveDialogAction; id: string } | null>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<{ startY: number; dy: number; t: number } | null>(null)

  const guard = React.useCallback(
    (e: Event) => {
      guardNestedInlineCreateDismiss(e)
      if (!dismissable) e.preventDefault()
    },
    [dismissable],
  )

  const execute = async (action: ResponsiveDialogAction, id: string) => {
    if (!action.run) return
    setBusy(id)
    try {
      await action.run()
    } catch (error) {
      if (onActionError) onActionError(error, action)
      else throw error
    } finally {
      setBusy(null)
    }
  }

  const trigger = (action: ResponsiveDialogAction, id: string, destructive: boolean) => {
    if (isActionDisabled(action) || busy) return
    const wantsConfirm = action.confirm !== false && (Boolean(action.confirm) || destructive)
    if (wantsConfirm) setConfirming({ action, id })
    else void execute(action, id)
  }

  // ---- swipe down to dismiss (sheet only, from the handle/header zone) ----
  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (variant !== 'sheet' || !dismissable) return
    drag.current = { startY: e.clientY, dy: 0, t: performance.now() }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !contentRef.current) return
    drag.current.dy = Math.max(0, e.clientY - drag.current.startY)
    contentRef.current.style.transform = `translateY(${drag.current.dy}px)`
  }
  const onDragEnd = () => {
    const d = drag.current
    drag.current = null
    if (!d || !contentRef.current) return
    const velocity = d.dy / Math.max(1, performance.now() - d.t)
    contentRef.current.style.transform = ''
    if (d.dy > 120 || (d.dy > 48 && velocity > 0.5)) onOpenChange(false)
  }

  const primary = footer?.primary
  const secondary = footer?.secondary ?? []
  const destructive = footer?.destructive ?? []
  const extra = footer?.extra ?? []
  const hasFooter = Boolean(primary || secondary.length || destructive.length || extra.length || footer?.start || footerContent)
  const comfy = !isDesktop

  const actionButton = (
    action: ResponsiveDialogAction,
    id: string,
    kind: 'primary' | 'secondary' | 'destructive',
    className?: string,
  ) => {
    const loading = Boolean(action.loading) || busy === id
    const isPrimary = kind === 'primary'
    const primaryDestructive = isPrimary && Boolean((action as ResponsiveDialogFooter['primary'])?.destructive)
    const variantName = isPrimary ? (primaryDestructive ? 'destructive' : 'default') : kind === 'destructive' ? 'ghost' : 'outline'
    return (
      <Button
        key={id}
        type={action.type ?? 'button'}
        form={action.form}
        variant={variantName}
        size={comfy ? 'comfortable' : 'default'}
        disabled={isActionDisabled(action) || (Boolean(busy) && !loading) || (isPrimary && loading)}
        aria-busy={loading || undefined}
        title={action.disabledReason}
        data-action={id}
        data-variant={variantName}
        onClick={action.type === 'submit' && !action.run ? undefined : () => trigger(action, id, kind === 'destructive')}
        className={cn(
          'h-auto min-w-0 whitespace-normal break-words text-center',
          comfy ? 'min-h-11' : 'min-h-9',
          kind === 'destructive' && 'text-destructive hover:bg-destructive/10 hover:text-destructive',
          className,
        )}
      >
        {loading ? (
          <Loader2 aria-hidden='true' className='size-4 animate-spin motion-reduce:animate-none' />
        ) : action.icon ? (
          <span aria-hidden='true' className='inline-flex shrink-0 items-center [&_svg]:size-4'>
            {action.icon}
          </span>
        ) : null}
        <span className='min-w-0'>{action.label}</span>
      </Button>
    )
  }

  const menuItem = (action: ResponsiveDialogAction, id: string, isDestructive: boolean) => (
    <DropdownMenuItem
      key={id}
      data-action={id}
      variant={isDestructive ? 'destructive' : 'default'}
      disabled={isActionDisabled(action) || Boolean(busy)}
      onSelect={() => trigger(action, id, isDestructive)}
      className='min-h-11 items-start py-2.5'
    >
      {action.icon ? (
        <span aria-hidden='true' className='mt-0.5 inline-flex shrink-0 items-center [&_svg]:size-4'>
          {action.icon}
        </span>
      ) : null}
      <span className='flex min-w-0 flex-col break-words'>
        {action.label}
        {action.disabledReason ? (
          <span className='text-muted-foreground text-xs font-normal'>{action.disabledReason}</span>
        ) : null}
      </span>
    </DropdownMenuItem>
  )

  const ids = {
    primary: primary ? actionKey(primary, 0, 'primary') : '',
    secondary: secondary.map((a, i) => actionKey(a, i, 'secondary')),
    destructive: destructive.map((a, i) => actionKey(a, i, 'destructive')),
    extra: extra.map((a, i) => actionKey(a, i, 'extra')),
  }

  const renderDesktopFooter = () => (
    <div className='flex flex-wrap items-center justify-end gap-2'>
      {destructive.length > 0 && (
        <div className='me-auto flex flex-wrap items-center gap-2'>
          {destructive.map((a, i) => actionButton(a, ids.destructive[i], 'destructive'))}
        </div>
      )}
      {footer?.start ? <div className={cn('flex items-center', destructive.length === 0 && 'me-auto')}>{footer.start}</div> : null}
      {extra.map((a, i) => actionButton(a, ids.extra[i], 'secondary'))}
      {secondary.map((a, i) => actionButton(a, ids.secondary[i], 'secondary'))}
      {primary ? actionButton(primary, ids.primary, 'primary') : null}
    </div>
  )

  const renderMobileFooter = () => {
    const [firstSecondary, ...restSecondary] = secondary
    const menuRegular = [
      ...restSecondary.map((a, i) => ({ a, id: ids.secondary[i + 1] })),
      ...extra.map((a, i) => ({ a, id: ids.extra[i] })),
    ]
    const menuDestructive = destructive.map((a, i) => ({ a, id: ids.destructive[i] }))
    const rowHasSomething = Boolean(firstSecondary) || Boolean(primary)
    // Nothing to anchor «⋯» to: show the leftovers as full-width buttons instead.
    const inlineLeftovers = !rowHasSomething
    const hasMenu = !inlineLeftovers && menuRegular.length + menuDestructive.length > 0
    return (
      <div className='flex flex-col gap-2'>
        {footer?.start ? <div className='flex items-center'>{footer.start}</div> : null}
        {primary ? actionButton(primary, ids.primary, 'primary', 'w-full') : null}
        {(firstSecondary || hasMenu) && (
          <div className='flex items-center gap-2'>
            {firstSecondary ? actionButton(firstSecondary, ids.secondary[0], 'secondary', 'flex-1') : <span className='flex-1' />}
            {hasMenu && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type='button'
                    variant='outline'
                    size='icon-comfortable'
                    data-slot='responsive-dialog-more'
                    aria-label={t('responsive_dialog.more', { defaultValue: 'Más opciones' })}
                  >
                    <MoreHorizontal aria-hidden='true' className='size-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side='top' align='end' className='max-w-[calc(100vw-2rem)] min-w-56'>
                  {menuRegular.map(({ a, id }) => menuItem(a, id, false))}
                  {menuRegular.length > 0 && menuDestructive.length > 0 && <DropdownMenuSeparator />}
                  {menuDestructive.map(({ a, id }) => menuItem(a, id, true))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
        {inlineLeftovers && (
          <>
            {extra.map((a, i) => actionButton(a, ids.extra[i], 'secondary', 'w-full'))}
            {destructive.map((a, i) => actionButton(a, ids.destructive[i], 'destructive', 'w-full'))}
          </>
        )}
      </div>
    )
  }

  const confirm = confirming && confirming.action.confirm ? confirming.action.confirm : undefined
  const closeVisible = showCloseButton && dismissable
  const pad = variant === 'dialog' && isDesktop ? 'px-6' : 'px-4'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={contentRef}
          data-slot='responsive-dialog'
          data-variant={variant}
          // No description: tell Radix not to expect one (avoids its console warning).
          {...(description ? {} : { 'aria-describedby': undefined })}
          onOpenAutoFocus={(e) => {
            // Focus the dialog itself (announces the title) instead of the X,
            // so the close button does not open with a focus ring.
            e.preventDefault()
            contentRef.current?.focus()
          }}
          onEscapeKeyDown={(e) => {
            if (!dismissable) e.preventDefault()
          }}
          onInteractOutside={guard}
          onPointerDownOutside={guard}
          onFocusOutside={(e) => guardNestedInlineCreateDismiss(e)}
          style={variant === 'sheet' && keyboardInset ? { bottom: keyboardInset, maxHeight: `calc(92dvh - ${keyboardInset}px)` } : undefined}
          className={cn(
            'bg-background fixed z-50 flex w-full flex-col overflow-hidden shadow-lg outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            variant === 'sheet' &&
              'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t transition-transform duration-200 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
            variant === 'fullscreen' && 'inset-0 h-dvh max-h-dvh',
            variant === 'dialog' &&
              cn(
                'top-1/2 left-1/2 max-h-[90dvh] max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border duration-200 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
                SIZES[size],
              ),
            className,
          )}
        >
          {variant === 'sheet' && (
            <div
              data-slot='responsive-dialog-handle'
              aria-hidden='true'
              className='flex h-6 shrink-0 cursor-grab touch-none items-center justify-center'
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onPointerCancel={onDragEnd}
            >
              <span className='bg-muted-foreground/30 h-1.5 w-10 rounded-full' />
            </div>
          )}

          {(title || closeVisible || header) && (
            <div
              data-slot='responsive-dialog-header'
              className={cn('flex shrink-0 flex-col gap-3', pad, variant === 'sheet' ? 'pt-1 pb-3' : 'pt-5 pb-3', variant === 'dialog' && isDesktop && 'pt-6')}
            >
              <div className='flex min-w-0 items-start gap-3'>
                {icon ? (
                  <span aria-hidden='true' className='bg-primary/10 text-primary mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5'>
                    {icon}
                  </span>
                ) : null}
                <div className='min-w-0 flex-1'>
                  {title ? (
                    <DialogPrimitive.Title
                      data-slot='dialog-title'
                      className='text-lg leading-snug font-semibold break-words [overflow-wrap:anywhere]'
                    >
                      {title}
                    </DialogPrimitive.Title>
                  ) : null}
                  {description ? (
                    <DialogPrimitive.Description data-slot='dialog-description' className='text-muted-foreground mt-1 text-sm break-words'>
                      {description}
                    </DialogPrimitive.Description>
                  ) : null}
                </div>
                {closeVisible ? (
                  <DialogPrimitive.Close asChild>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-comfortable'
                      data-slot='dialog-close'
                      className='-me-2 -mt-2 shrink-0 opacity-80 hover:opacity-100'
                      aria-label={t('responsive_dialog.close', { defaultValue: 'Cerrar' })}
                    >
                      <XIcon aria-hidden='true' className='size-5' />
                    </Button>
                  </DialogPrimitive.Close>
                ) : null}
              </div>
              {header ? <div className='min-w-0'>{header}</div> : null}
            </div>
          )}

          <div
            data-slot='responsive-dialog-body'
            className={cn('min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-4', pad, !title && !header && !closeVisible && 'pt-4', bodyClassName)}
          >
            {children}
          </div>

          {hasFooter && (
            <div
              data-slot='dialog-footer'
              data-responsive-footer=''
              className={cn(
                'bg-background shrink-0 border-t pt-3',
                pad,
                variant === 'dialog' && isDesktop ? 'pb-6' : 'pb-[max(1rem,env(safe-area-inset-bottom))]',
              )}
            >
              {footerContent ? (
                <div className='flex flex-col-reverse gap-2 md:flex-row md:flex-wrap md:justify-end'>{footerContent}</div>
              ) : null}
              {(primary || secondary.length || destructive.length || extra.length || footer?.start) &&
                (isDesktop ? renderDesktopFooter() : renderMobileFooter())}
            </div>
          )}

          {confirming ? (
            <ConfirmDialog
              open
              onOpenChange={(next) => {
                if (!next) setConfirming(null)
              }}
              destructive={ids.destructive.includes(confirming.id)}
              title={
                confirm?.title ??
                (typeof confirming.action.label === 'string'
                  ? t('responsive_dialog.confirm_title', { defaultValue: '¿{{label}}?', label: confirming.action.label }).replace(
                      '{{label}}',
                      confirming.action.label,
                    )
                  : t('responsive_dialog.confirm_generic', { defaultValue: '¿Continuar?' }))
              }
              desc={confirm?.description ?? t('responsive_dialog.confirm_description', { defaultValue: 'Esta acción no se puede deshacer.' })}
              confirmText={confirm?.confirmLabel ?? confirming.action.label}
              cancelBtnText={confirm?.cancelLabel ?? t('responsive_dialog.cancel', { defaultValue: 'Cancelar' })}
              handleConfirm={() => {
                const { action, id } = confirming
                setConfirming(null)
                void execute(action, id)
              }}
            />
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

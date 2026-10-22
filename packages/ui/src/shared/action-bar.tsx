import * as React from 'react'
import { Loader2, MoreHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '../dialogs/confirm-dialog'
import { MOBILE_BREAKPOINT } from '../hooks/use-mobile'
import { cn } from '../lib/utils'
import { Button } from '../primitives/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../primitives/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '../primitives/tooltip'
import {
  ACTION_BAR_BREAKPOINTS,
  isDisabled,
  needsConfirm,
  planActionBar,
  resolveMaxVisible,
  type ActionItem,
  type MaxVisible,
} from './action-bar-plan'

export interface ActionBarProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  items: ActionItem[]
  /**
   * Upper bound of inline buttons (primary included), by viewport breakpoint.
   * The bar also collapses by real measured width. Default `{ base: 2, md: 3, lg: 4 }`.
   */
  maxVisible?: MaxVisible
  /** Label of the overflow trigger (visible on desktop, `aria-label` on mobile). Default «Más». */
  overflowLabel?: string
  /** `auto`: dropdown from `md` up, bottom sheet below. Default `auto`. */
  overflowAs?: 'auto' | 'menu' | 'sheet'
  /** Horizontal alignment of the buttons. Default `end`. */
  align?: 'start' | 'end'
  /** Called when an action's `run` throws or rejects. Without it the error is rethrown. */
  onActionError?: (error: unknown, item: ActionItem) => void
}

type Bucket = 'base' | 'sm' | 'md' | 'lg'
const BUCKET_PX: Record<Bucket, number> = { base: 0, ...ACTION_BAR_BREAKPOINTS }

function currentBucket(): Bucket {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'base'
  for (const bp of ['lg', 'md', 'sm'] as const) {
    if (window.matchMedia(`(min-width: ${ACTION_BAR_BREAKPOINTS[bp]}px)`).matches) return bp
  }
  return 'base'
}

function subscribeBucket(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const queries = Object.values(ACTION_BAR_BREAKPOINTS).map((px) => window.matchMedia(`(min-width: ${px}px)`))
  queries.forEach((q) => q.addEventListener?.('change', onChange))
  return () => queries.forEach((q) => q.removeEventListener?.('change', onChange))
}

function useViewportBucket(): Bucket {
  return React.useSyncExternalStore(subscribeBucket, currentBucket, () => 'base')
}

const useIsoLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect

const GAP_PX = 8

/**
 * ActionBar — one primary, a few secondaries and a «⋯» overflow that collapses
 * by measured width (ResizeObserver), not only by breakpoint. Destructive
 * actions always sit last in the overflow, separated and in red, behind a
 * confirmation. Below `md` the overflow opens as a bottom sheet and
 * secondaries with an icon render icon-only (labelled).
 *
 * @example
 * <ActionBar items={[
 *   { key: 'dispatch', label: 'Despachar', priority: 'primary', run: dispatch },
 *   { key: 'print', label: 'Imprimir', icon: <Printer />, run: print },
 *   { key: 'delete', label: 'Eliminar', destructive: true, run: remove },
 * ]} />
 */
export function ActionBar({
  items,
  maxVisible,
  overflowLabel,
  overflowAs = 'auto',
  align = 'end',
  onActionError,
  className,
  style,
  ...props
}: ActionBarProps) {
  const { t } = useTranslation()
  const bucket = useViewportBucket()
  const isMobile = BUCKET_PX[bucket] < MOBILE_BREAKPOINT
  const cap = resolveMaxVisible(maxVisible, BUCKET_PX[bucket])
  const moreLabel = overflowLabel ?? t('action_bar.more', { defaultValue: 'Más' })
  const useSheet = overflowAs === 'sheet' || (overflowAs === 'auto' && isMobile)

  const rootRef = React.useRef<HTMLDivElement>(null)
  const measureRef = React.useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = React.useState<number | undefined>(undefined)
  const [widths, setWidths] = React.useState<Record<string, number> | undefined>(undefined)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [confirming, setConfirming] = React.useState<ActionItem | null>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)

  // Everything that may render inline, measured off-screen in the current mode.
  const measurable = React.useMemo(
    () => planActionBar(items, { maxVisible: Number.MAX_SAFE_INTEGER }),
    [items],
  )
  const measureSignature = [
    bucket,
    measurable.primary?.key,
    measurable.primary?.label,
    ...measurable.inline.map((i) => `${i.key}:${i.label}:${i.icon ? 1 : 0}`),
  ].join('|')

  useIsoLayoutEffect(() => {
    const box = measureRef.current
    if (!box) return
    const next: Record<string, number> = {}
    box.querySelectorAll<HTMLElement>('[data-measure-key]').forEach((el) => {
      next[el.dataset.measureKey as string] = el.getBoundingClientRect().width
    })
    setWidths((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [measureSignature])

  useIsoLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const read = () => setContainerWidth(el.getBoundingClientRect().width)
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // jsdom/happy-dom report 0 for every box: plan by `maxVisible` only there.
  const measured = containerWidth !== undefined && containerWidth > 0 && widths !== undefined
  const plan = planActionBar(items, {
    maxVisible: cap,
    containerWidth: measured ? containerWidth : undefined,
    widths: measured ? widths : undefined,
    overflowTriggerWidth: widths?.['__overflow__'] ?? 0,
    gap: GAP_PX,
  })
  const menuItems = plan.overflow
  const hasMenu = menuItems.length + plan.destructive.length > 0
  const minWidth = measured
    ? (plan.primary ? (widths?.[plan.primary.key] ?? 0) : 0) +
      (hasMenu ? (widths?.['__overflow__'] ?? 0) + (plan.primary ? GAP_PX : 0) : 0)
    : undefined

  const execute = async (item: ActionItem) => {
    if (isDisabled(item) || busy) return
    setBusy(item.key)
    try {
      await item.run()
    } catch (error) {
      if (onActionError) onActionError(error, item)
      else throw error
    } finally {
      setBusy(null)
    }
  }

  const trigger = (item: ActionItem) => {
    if (isDisabled(item) || busy) return
    setSheetOpen(false)
    if (needsConfirm(item)) setConfirming(item)
    else void execute(item)
  }

  const iconOnly = (item: ActionItem, primary: boolean) => isMobile && !primary && Boolean(item.icon)
  const size = (item: ActionItem, primary: boolean) =>
    isMobile ? (iconOnly(item, primary) ? 'icon-comfortable' : 'comfortable') : 'sm'

  const buttonBody = (item: ActionItem, primary: boolean, loading: boolean) => (
    <>
      {loading ? (
        <Loader2 aria-hidden='true' className='size-4 animate-spin motion-reduce:animate-none' />
      ) : item.icon ? (
        <span aria-hidden='true' className='inline-flex shrink-0 items-center [&_svg]:size-4'>
          {item.icon}
        </span>
      ) : null}
      {iconOnly(item, primary) ? (
        <span className='sr-only'>{item.label}</span>
      ) : (
        <span className={cn(primary && 'min-w-0 break-words')}>{item.label}</span>
      )}
    </>
  )

  const renderButton = (item: ActionItem, primary: boolean) => {
    const loading = Boolean(item.loading) || busy === item.key
    const disabled = isDisabled(item) || (Boolean(busy) && !loading)
    const btn = (
      <Button
        key={item.key}
        type='button'
        variant={primary ? 'default' : 'outline'}
        size={size(item, primary)}
        disabled={disabled}
        aria-busy={loading || undefined}
        title={iconOnly(item, primary) ? item.label : undefined}
        data-action={item.key}
        data-priority={primary ? 'primary' : 'secondary'}
        data-variant={primary ? 'default' : 'outline'}
        onClick={() => trigger(item)}
        className={cn(primary ? 'h-auto min-w-0 shrink whitespace-normal text-center' : 'shrink-0', primary && (isMobile ? 'min-h-11' : 'min-h-8'))}
      >
        {buttonBody(item, primary, loading)}
      </Button>
    )
    if (!item.disabledReason || isMobile) return btn
    return (
      <Tooltip key={item.key}>
        <TooltipTrigger asChild>
          {/* span: a disabled button does not fire pointer events for the tooltip */}
          <span tabIndex={0} className={cn('inline-flex rounded-md', primary ? 'min-w-0 shrink' : 'shrink-0')}>
            {btn}
          </span>
        </TooltipTrigger>
        <TooltipContent className='max-w-xs'>{item.disabledReason}</TooltipContent>
      </Tooltip>
    )
  }

  const overflowTrigger = (measure = false) => (
    <Button
      type='button'
      variant='outline'
      size={isMobile ? 'icon-comfortable' : 'sm'}
      aria-label={moreLabel}
      aria-haspopup={useSheet ? 'dialog' : 'menu'}
      data-slot='action-bar-overflow'
      className='shrink-0'
      {...(measure ? { 'data-measure-key': '__overflow__', tabIndex: -1 } : { ref: triggerRef })}
      onClick={!measure && useSheet ? () => setSheetOpen(true) : undefined}
    >
      <MoreHorizontal aria-hidden='true' className='size-4' />
      {!isMobile && <span>{moreLabel}</span>}
    </Button>
  )

  const menuEntry = (item: ActionItem) => (
    <DropdownMenuItem
      key={item.key}
      disabled={isDisabled(item) || Boolean(busy)}
      variant={item.destructive ? 'destructive' : 'default'}
      data-action={item.key}
      onSelect={() => trigger(item)}
      className='min-h-9 items-start'
    >
      {item.icon ? (
        <span aria-hidden='true' className='mt-0.5 inline-flex shrink-0 items-center [&_svg]:size-4'>
          {item.icon}
        </span>
      ) : null}
      <span className='flex min-w-0 flex-col break-words'>
        {item.label}
        {item.disabledReason ? (
          <span className='text-muted-foreground text-xs font-normal'>{item.disabledReason}</span>
        ) : null}
      </span>
    </DropdownMenuItem>
  )

  const sheetEntry = (item: ActionItem) => {
    const loading = Boolean(item.loading) || busy === item.key
    return (
      <li key={item.key}>
        <button
          type='button'
          data-action={item.key}
          disabled={isDisabled(item) || Boolean(busy)}
          aria-busy={loading || undefined}
          onClick={() => trigger(item)}
          className={cn(
            'hover:bg-accent focus-visible:ring-ring/50 flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-2 text-start text-base outline-none focus-visible:ring-[3px] disabled:opacity-50',
            item.destructive && 'text-destructive',
          )}
        >
          {loading ? (
            <Loader2 aria-hidden='true' className='size-5 shrink-0 animate-spin motion-reduce:animate-none' />
          ) : item.icon ? (
            <span aria-hidden='true' className='inline-flex shrink-0 items-center [&_svg]:size-5'>
              {item.icon}
            </span>
          ) : null}
          <span className='flex min-w-0 flex-col break-words'>
            {item.label}
            {item.disabledReason ? (
              <span className='text-muted-foreground text-sm'>{item.disabledReason}</span>
            ) : null}
          </span>
        </button>
      </li>
    )
  }

  const confirm = confirming && confirming.confirm !== false ? confirming.confirm : undefined

  return (
    <div
      ref={rootRef}
      role='group'
      aria-label={props['aria-label'] ?? t('action_bar.label', { defaultValue: 'Acciones' })}
      data-slot='action-bar'
      className={cn(
        // @container = inline-size containment: the bar's min-content is its
        // `minWidth` (primary + «⋯»), not every inline button, so a parent
        // flex row shrinks the bar (and it collapses) instead of the title.
        '@container relative flex w-full min-w-0 flex-nowrap items-center gap-2',
        align === 'end' ? 'justify-end' : 'justify-start',
        className,
      )}
      style={minWidth ? { minWidth: `min(${Math.ceil(minWidth)}px, 100%)`, ...style } : style}
      {...props}
    >
      {plan.primary ? renderButton(plan.primary, true) : null}
      {plan.inline.map((item) => renderButton(item, false))}

      {hasMenu &&
        (useSheet ? (
          <>
            {overflowTrigger()}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetContent
                side='bottom'
                data-slot='action-bar-sheet'
                onCloseAutoFocus={(e) => {
                  // Opened without a SheetTrigger: hand focus back to «⋯» ourselves.
                  e.preventDefault()
                  triggerRef.current?.focus()
                }}
                className='max-h-[85dvh] gap-0 rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]'
              >
                <SheetHeader className='pe-12'>
                  <SheetTitle>{moreLabel}</SheetTitle>
                  <SheetDescription className='sr-only'>
                    {t('action_bar.sheet_description', { defaultValue: 'Más acciones disponibles' })}
                  </SheetDescription>
                </SheetHeader>
                <div className='min-h-0 overflow-y-auto px-2'>
                  <ul className='flex flex-col gap-1'>{menuItems.map(sheetEntry)}</ul>
                  {plan.destructive.length > 0 && (
                    <>
                      {menuItems.length > 0 && <hr className='border-border my-2' />}
                      <ul className='flex flex-col gap-1'>{plan.destructive.map(sheetEntry)}</ul>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>{overflowTrigger()}</DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='max-w-[min(20rem,calc(100vw-2rem))] min-w-56'>
              {menuItems.map(menuEntry)}
              {menuItems.length > 0 && plan.destructive.length > 0 && <DropdownMenuSeparator />}
              {plan.destructive.map(menuEntry)}
            </DropdownMenuContent>
          </DropdownMenu>
        ))}

      {/* Off-screen copies at natural width, used to decide what fits. */}
      {/* The clipping wrapper keeps the w-max row out of any ancestor's scroll width. */}
      <div
        aria-hidden='true'
        inert
        data-slot='action-bar-measure'
        className='pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden'
      >
        <div ref={measureRef} className='flex w-max flex-nowrap gap-2 whitespace-nowrap'>
          {measurable.primary ? (
            <Button
              type='button'
              tabIndex={-1}
              size={size(measurable.primary, true)}
              data-measure-key={measurable.primary.key}
            >
              {buttonBody(measurable.primary, true, false)}
            </Button>
          ) : null}
          {measurable.inline.map((item) => (
            <Button
              key={item.key}
              type='button'
              tabIndex={-1}
              variant='outline'
              size={size(item, false)}
              data-measure-key={item.key}
            >
              {buttonBody(item, false, false)}
            </Button>
          ))}
          {overflowTrigger(true)}
        </div>
      </div>

      {confirming ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirming(null)
          }}
          destructive={Boolean(confirming.destructive)}
          title={
            confirm?.title ??
            // Interpolated by hand too: without an initialised i18next `t` returns the raw default.
            t('action_bar.confirm_title', { defaultValue: '¿{{label}}?', label: confirming.label }).replace(
              '{{label}}',
              confirming.label,
            )
          }
          desc={
            confirm?.description ??
            t('action_bar.confirm_description', { defaultValue: 'Esta acción no se puede deshacer.' })
          }
          confirmText={confirm?.confirmLabel ?? confirming.label}
          cancelBtnText={confirm?.cancelLabel ?? t('action_bar.cancel', { defaultValue: 'Cancelar' })}
          handleConfirm={() => {
            const item = confirming
            setConfirming(null)
            void execute(item)
          }}
        />
      ) : null}
    </div>
  )
}

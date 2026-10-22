import * as React from 'react'
import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/utils'
import { Button } from '../primitives/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu'

export interface PageHeaderOverflowAction {
  key: string
  label: string
  icon?: LucideIcon
  onSelect: () => void
  disabled?: boolean
  /** Paints the item with the destructive token and separates it. */
  destructive?: boolean
}

export interface PageHeaderProps extends Omit<React.ComponentProps<'header'>, 'title'> {
  /** Row above the title, typically `<BackLink />`. */
  leading?: React.ReactNode
  icon?: LucideIcon
  title: React.ReactNode
  /**
   * `text` (default) wraps long titles; `identifier` (folio, SKU, email) stays
   * on one line, truncates with an ellipsis and exposes the full value in
   * `title` (when `title` is a string). Never breaks on hyphens.
   */
  titleKind?: 'text' | 'identifier'
  /** Short line under the title (customer link, model name…). */
  subtitle?: React.ReactNode
  description?: React.ReactNode
  /** Chips next to the title (status, «Datos demostrativos», counters). */
  badges?: React.ReactNode
  /**
   * Actions. Prefer `<ActionBar items={…} />`: it keeps one primary and
   * collapses the rest into «⋯» by measured width. Below a 448px-wide
   * container (`@md`) the actions get their own full-width row under the title.
   */
  actions?: React.ReactNode
  /** Legacy «⋯» menu for secondary actions; hidden when empty. Prefer `ActionBar`. */
  overflowActions?: PageHeaderOverflowAction[]
  /** Accessible name of the «⋯» button. Default `page_header.more` («Más acciones»). */
  overflowLabel?: string
  /** Heading level of the title. Default 1. */
  level?: 1 | 2
}

/**
 * Page title block. Lays out by its own width (container query), not the
 * viewport: under 448px it stacks leading → title + badges → actions; wider,
 * title on the left (shrinks, `min-w-0`) and actions on the right. Fluid
 * title size `clamp(1.25rem, 1rem + 2vw, 1.5rem)`. Theme tokens only.
 */
export function PageHeader({
  leading,
  icon: Icon,
  title,
  titleKind = 'text',
  subtitle,
  description,
  badges,
  actions,
  overflowActions,
  overflowLabel,
  level = 1,
  className,
  ...props
}: PageHeaderProps) {
  const { t } = useTranslation()
  const Heading = level === 1 ? 'h1' : 'h2'
  const regular = overflowActions?.filter((a) => !a.destructive) ?? []
  const destructive = overflowActions?.filter((a) => a.destructive) ?? []
  const hasOverflow = regular.length + destructive.length > 0
  const identifier = titleKind === 'identifier'

  const item = (a: PageHeaderOverflowAction) => (
    <DropdownMenuItem
      key={a.key}
      disabled={a.disabled}
      onSelect={a.onSelect}
      className={cn(a.destructive && 'text-destructive focus:text-destructive')}
    >
      {a.icon && <a.icon aria-hidden='true' className='size-4' />}
      {a.label}
    </DropdownMenuItem>
  )

  return (
    <header data-slot='page-header' className={cn('@container/page-header w-full min-w-0', className)} {...props}>
      {leading ? <div className='mb-1 flex min-w-0 items-center'>{leading}</div> : null}
      <div className='flex min-w-0 flex-col gap-3 @md/page-header:flex-row @md/page-header:items-start'>
        <div
          className={cn(
            'flex min-w-0 items-start gap-3 @md/page-header:flex-[0_1_auto]',
            (actions || hasOverflow) && '@md/page-header:max-w-[60%]',
          )}
        >
          {Icon && (
            <span className='bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg'>
              <Icon aria-hidden='true' className='size-5' />
            </span>
          )}
          <div className='min-w-0'>
            <div className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'>
              <Heading
                data-title-kind={titleKind}
                title={identifier && typeof title === 'string' ? title : undefined}
                className={cn(
                  'text-foreground min-w-0 max-w-full text-[clamp(1.25rem,1rem+2vw,1.5rem)] leading-tight font-semibold tracking-tight',
                  identifier ? 'truncate whitespace-nowrap' : 'break-words [overflow-wrap:anywhere]',
                )}
              >
                {title}
              </Heading>
              {badges}
            </div>
            {subtitle && <div className='text-muted-foreground mt-0.5 min-w-0 text-sm break-words'>{subtitle}</div>}
            {description && <p className='text-muted-foreground mt-0.5 text-sm break-words'>{description}</p>}
          </div>
        </div>
        {(actions || hasOverflow) && (
          <div
            data-slot='page-header-actions'
            className='flex w-full flex-wrap items-center justify-end gap-2 @md/page-header:w-auto @md/page-header:flex-1 @md/page-header:flex-nowrap'
          >
            {actions}
            {hasOverflow && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type='button'
                    variant='outline'
                    size='icon'
                    className='shrink-0'
                    aria-label={overflowLabel ?? t('page_header.more', { defaultValue: 'Más acciones' })}
                  >
                    <MoreHorizontal aria-hidden='true' className='size-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  {regular.map(item)}
                  {regular.length > 0 && destructive.length > 0 && <DropdownMenuSeparator />}
                  {destructive.map(item)}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>
    </header>
  )
}

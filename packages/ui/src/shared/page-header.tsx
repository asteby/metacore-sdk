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
  icon?: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  /** Chips next to the title (status, «Datos demostrativos», counters). */
  badges?: React.ReactNode
  /** Primary actions, always visible (keep to one or two). */
  actions?: React.ReactNode
  /** Secondary actions in a «⋯» menu; hidden when empty. */
  overflowActions?: PageHeaderOverflowAction[]
  /** Accessible name of the «⋯» button. Default `page_header.more` («Más acciones»). */
  overflowLabel?: string
  /** Heading level of the title. Default 1. */
  level?: 1 | 2
}

/**
 * Page title row: icon, title (+ badges), description and actions, with a «⋯»
 * overflow menu for secondary actions. On phones the actions wrap under the
 * title; the overflow menu stays reachable. Theme tokens only.
 */
export function PageHeader({
  icon: Icon,
  title,
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
  const regular = overflowActions?.filter(a => !a.destructive) ?? []
  const destructive = overflowActions?.filter(a => a.destructive) ?? []
  const hasOverflow = regular.length + destructive.length > 0

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
    <header
      data-slot='page-header'
      className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}
      {...props}
    >
      <div className='flex min-w-0 items-start gap-3'>
        {Icon && (
          <span className='bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg'>
            <Icon aria-hidden='true' className='size-5' />
          </span>
        )}
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <Heading className='text-foreground truncate text-xl font-semibold tracking-tight'>{title}</Heading>
            {badges}
          </div>
          {description && <p className='text-muted-foreground mt-0.5 text-sm'>{description}</p>}
        </div>
      </div>
      {(actions || hasOverflow) && (
        <div className='flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end'>
          {actions}
          {hasOverflow && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type='button'
                  variant='outline'
                  size='icon'
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
    </header>
  )
}

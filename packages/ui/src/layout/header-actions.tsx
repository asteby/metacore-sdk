import * as React from 'react'
import { MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/primitives/button'
import { Badge } from '@/primitives/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/primitives/popover'
import { headerActionsHasBadge } from './header-actions-badge'

export { headerActionsHasBadge }

export interface HeaderActionsProps {
  /**
   * The secondary header toggles (search, dark-mode, print, settings, updates,
   * notifications, …). On `sm:`+ they render inline; below `sm` they collapse
   * into a single overflow popover so they never spill out of the cramped phone
   * header.
   */
  children: React.ReactNode
  /**
   * Aggregate badge bubbled onto the collapsed overflow trigger so a pending
   * notification (e.g. the "1" of a core update) is still visible when the
   * toggles are hidden in the popover. A numeric `0`, `false`, `null`,
   * `undefined` or `''` renders no badge. Hosts compute this from the same
   * counts that drive the individual toggles' badges.
   */
  overflowBadge?: number | string | boolean | null
  /** Accessible label for the overflow trigger. Defaults to "More". */
  overflowLabel?: string
  /** Extra classes on the inline (desktop) container. */
  className?: string
  /** Extra classes on the overflow popover content. */
  contentClassName?: string
}

export interface HeaderActionsItemProps {
  /** Label shown next to the toggle in the mobile overflow menu. */
  label: string
  /**
   * The interactive toggle (usually a `Button` / `PopoverTrigger` /
   * `SheetTrigger` / `DropdownMenuTrigger`). On phones the whole row is the
   * hit target so tapping the label activates the child; on `sm:`+ only the
   * child renders (label is `sm:hidden`).
   */
  children: React.ReactNode
  className?: string
}

/**
 * One row inside {@link HeaderActions}. On phones the entire row (icon + label)
 * is clickable — hosts used to wrap icon-only toggles with a dead text label,
 * so "Tema" / "Imprimir" looked like menu items but only the 24px icon worked.
 *
 * Forwards a label-area click to the first button / `[role=button]` / `a`
 * inside `children` so nested Popover/Sheet/Dropdown triggers still fire.
 */
export function HeaderActionsItem({
  label,
  children,
  className,
}: HeaderActionsItemProps) {
  const rowRef = React.useRef<HTMLDivElement>(null)

  const activateChild = React.useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    // Clicks that already landed on the interactive child must not be re-fired
    // (would toggle open→close on nested Popover/Dropdown triggers).
    const interactive = rowRef.current?.querySelector<HTMLElement>(
      'button, a, [role="button"], [data-slot="popover-trigger"], [data-slot="sheet-trigger"], [data-slot="dropdown-menu-trigger"]',
    )
    if (!interactive) return
    if (target && interactive.contains(target)) return
    e.preventDefault()
    interactive.click()
  }, [])

  return (
    <div
      ref={rowRef}
      role='menuitem'
      tabIndex={0}
      onClick={activateChild}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          activateChild(e)
        }
      }}
      className={cn(
        // Mobile: full-width menu row. Desktop: shrink-wrap so the icon-only
        // toggle looks unchanged next to its siblings.
        'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none hover:bg-muted/60 sm:w-auto sm:cursor-default sm:rounded-none sm:p-0 sm:hover:bg-transparent',
        className,
      )}
    >
      {children}
      <span className='min-w-0 flex-1 truncate sm:hidden'>{label}</span>
    </div>
  )
}

/**
 * Responsive wrapper for the secondary header action toggles.
 *
 * - **`sm:`+ (desktop/tablet):** renders `children` inline, exactly as before.
 * - **below `sm` (phone):** collapses every toggle into ONE overflow button (a
 *   kebab) that opens a popover containing the same toggles stacked vertically,
 *   so the header never overflows. Any pending count is bubbled onto the kebab
 *   via `overflowBadge`.
 *
 * The overflow Popover is `modal={false}` so nested Popover / DropdownMenu /
 * Sheet triggers inside (print width, updates list, theme settings) can open
 * without the kebab stealing the first tap or trapping focus.
 *
 * Purely Tailwind-driven (`hidden sm:flex` / `flex sm:hidden`) — no resize
 * listeners. The toggles live in the DOM twice (inline + popover) but only the
 * breakpoint-visible copy is interactive. Prefer wrapping each child with
 * {@link HeaderActionsItem} so the mobile label is part of the hit target.
 *
 * The user avatar / profile dropdown is intentionally NOT part of this — keep it
 * a sibling that stays always-visible outside `<HeaderActions>`.
 */
export function HeaderActions({
  children,
  overflowBadge,
  overflowLabel = 'More',
  className,
  contentClassName,
}: HeaderActionsProps) {
  const showBadge = headerActionsHasBadge(overflowBadge)

  return (
    <>
      {/* Desktop / tablet: inline, unchanged. */}
      <div
        className={cn(
          'hidden items-center gap-2 sm:flex sm:gap-4',
          className
        )}
      >
        {children}
      </div>

      {/* Phone: single overflow trigger + popover. */}
      <div className='flex sm:hidden'>
        {/* modal={false}: nested Popover/Sheet/Dropdown inside must receive the
            tap; a modal overflow closed itself (or ate focus) on the first press. */}
        <Popover modal={false}>
          <PopoverTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              className='relative'
              aria-label={overflowLabel}
            >
              <MoreVertical className='h-5 w-5' />
              {showBadge && (
                <Badge
                  className='absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center rounded-full px-1 py-0 text-[10px] leading-none'
                  aria-hidden
                >
                  {typeof overflowBadge === 'boolean' ? '' : overflowBadge}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align='end'
            sideOffset={8}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className={cn(
              'flex w-auto min-w-48 flex-col items-stretch gap-0.5 p-1.5',
              contentClassName
            )}
          >
            {children}
          </PopoverContent>
        </Popover>
      </div>
    </>
  )
}

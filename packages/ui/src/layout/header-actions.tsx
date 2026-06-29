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

/**
 * Responsive wrapper for the secondary header action toggles.
 *
 * - **`sm:`+ (desktop/tablet):** renders `children` inline, exactly as before.
 * - **below `sm` (phone):** collapses every toggle into ONE overflow button (a
 *   kebab) that opens a popover containing the same toggles stacked vertically,
 *   so the header never overflows. Any pending count is bubbled onto the kebab
 *   via `overflowBadge`.
 *
 * Purely Tailwind-driven (`hidden sm:flex` / `flex sm:hidden`) — no resize
 * listeners. The toggles live in the DOM twice (inline + popover) but only the
 * breakpoint-visible copy is rendered/interactive at a time. A Popover (not a
 * DropdownMenu) hosts the overflow so arbitrary interactive children — including
 * toggles that open their own menus — behave correctly.
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
        <Popover>
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
            className={cn(
              'flex w-auto min-w-44 flex-col items-stretch gap-1 p-2',
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

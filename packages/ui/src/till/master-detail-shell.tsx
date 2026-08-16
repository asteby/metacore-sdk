import * as React from 'react'
import { Button } from '@/primitives/button'
import { cn } from '@/lib/utils'
import { SIDE_PANEL_DEFAULT_WIDTH } from './constants'

export type MasterDetailShellProps = {
  /** Left / main list (cards, search, etc.). */
  master: React.ReactNode
  /** Right preview / detail. */
  detail: React.ReactNode
  /** Desktop detail column width (px). */
  detailWidth?: number
  isMobile?: boolean
  /** When true on mobile, detail covers the master (session bar stays outside). */
  mobileDetailOpen?: boolean
  onMobileDetailClose?: () => void
  mobileBackLabel?: string
  /** Optional chrome above the split (session bar, filters). */
  toolbar?: React.ReactNode
  className?: string
  detailClassName?: string
}

/**
 * Master–detail till shell: card list + fixed-width preview on desktop;
 * full-screen detail overlay on mobile.
 */
export function MasterDetailShell({
  master,
  detail,
  detailWidth = SIDE_PANEL_DEFAULT_WIDTH,
  isMobile = false,
  mobileDetailOpen = false,
  onMobileDetailClose,
  mobileBackLabel = 'Volver',
  toolbar,
  className,
  detailClassName,
}: MasterDetailShellProps) {
  return (
    <div
      className={cn(
        'bg-background text-foreground relative flex h-full min-h-0 flex-col overflow-hidden',
        className
      )}
    >
      {toolbar}
      <div className='relative flex min-h-0 flex-1 overflow-hidden'>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'>
          {master}
        </div>
        {!isMobile ? (
          <aside
            className={cn(
              'bg-muted/10 flex shrink-0 flex-col',
              detailClassName
            )}
            style={{ width: detailWidth }}
          >
            {detail}
          </aside>
        ) : null}
        {isMobile && mobileDetailOpen ? (
          <div className='bg-background absolute inset-0 z-30 flex flex-col'>
            <div className='border-border flex h-11 shrink-0 items-center border-b px-2'>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={onMobileDetailClose}
              >
                ← {mobileBackLabel}
              </Button>
            </div>
            <div className='min-h-0 flex-1'>{detail}</div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

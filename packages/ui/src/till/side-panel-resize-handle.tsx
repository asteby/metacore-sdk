import { cn } from '@/lib/utils'

export type SidePanelResizeHandleProps = {
  onStart: (clientX: number) => void
  /** Accessible name for the separator. */
  label?: string
  className?: string
}

/** Thin grabbable divider that resizes the right till panel (mouse + touch). */
export function SidePanelResizeHandle({
  onStart,
  label = 'Redimensionar panel',
  className,
}: SidePanelResizeHandleProps) {
  return (
    <div
      role='separator'
      aria-orientation='vertical'
      aria-label={label}
      className={cn(
        'bg-border hover:bg-primary relative w-1 shrink-0 cursor-col-resize transition-colors',
        className
      )}
      onMouseDown={(e) => {
        e.preventDefault()
        onStart(e.clientX)
      }}
      onTouchStart={(e) => {
        if (e.touches[0]) onStart(e.touches[0].clientX)
      }}
    >
      <span className='absolute inset-y-0 -left-1.5 -right-1.5' />
    </div>
  )
}

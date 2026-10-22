import type { ReactNode } from 'react'
import { AlertCircle, Inbox } from 'lucide-react'
import { useInboxLabels, type InboxLabels } from './i18n'
import { cx, FOCUS } from './utils'

export interface EmptyStateProps {
  title?: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  const { labels } = useInboxLabels()
  return (
    <div className={cx('flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground" aria-hidden>
        {icon ?? <Inbox className="size-6" />}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title ?? labels.emptyListTitle}</p>
        <p className="max-w-xs text-balance text-sm text-muted-foreground">{description ?? labels.emptyListBody}</p>
      </div>
      {action}
    </div>
  )
}

export interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
  labels?: Partial<InboxLabels>
}

export function ErrorState({ title, description, onRetry, className, labels: o }: ErrorStateProps) {
  const { labels } = useInboxLabels(o)
  return (
    <div role="alert" className={cx('flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      <div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive" aria-hidden>
        <AlertCircle className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title ?? labels.errorTitle}</p>
        <p className="max-w-xs text-balance text-sm text-muted-foreground">{description ?? labels.errorBody}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cx('min-h-9 rounded-full border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted', FOCUS)}
        >
          {labels.retry}
        </button>
      )}
    </div>
  )
}

/** Shimmer rows that match the real row height so the layout does not jump. */
export function ListSkeleton({ rows = 8, rowHeight = 76 }: { rows?: number; rowHeight?: number }) {
  const { labels } = useInboxLabels()
  return (
    <div role="status" aria-live="polite" aria-label={labels.loading} className="overflow-hidden">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4" style={{ height: rowHeight }} aria-hidden>
          <div className="size-10 shrink-0 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
          </div>
        </div>
      ))}
      <span className="sr-only">{labels.loading}</span>
    </div>
  )
}

export function ThreadSkeleton() {
  const { labels } = useInboxLabels()
  return (
    <div role="status" aria-live="polite" aria-label={labels.loading} className="space-y-6 p-6" >
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2" aria-hidden>
          <div className="h-3 w-1/4 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-3 w-full animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
        </div>
      ))}
      <span className="sr-only">{labels.loading}</span>
    </div>
  )
}

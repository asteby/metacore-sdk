import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/primitives/button'
import { useLoadingGuard } from '@/hooks/use-loading-guard'

export interface LoadStateLabels {
  /** Screen-reader text announced while loading. */
  loading?: string
  title?: string
  hint?: string
  retry?: string
}

export interface LoadStateProps {
  /** A request is in flight. */
  loading: boolean
  /** The request failed (truthy = show the error state). */
  error?: unknown
  /** Loading longer than this is treated as a failure. Default 15s; `0` disables. */
  timeoutMs?: number
  /** Retry handler. Without it the error state renders no button. */
  onRetry?: () => void
  /** Placeholder shown while loading (usually a skeleton). */
  skeleton: React.ReactNode
  /** Overrides for the i18n defaults (`loadState.*`). */
  labels?: LoadStateLabels
  /** `inline` = compact, for sidebars / small panels. */
  size?: 'default' | 'inline'
  className?: string
  children?: React.ReactNode
}

/**
 * Loading → error → content switch with a timeout guard. While `loading` it
 * renders `skeleton` inside a polite live region (`aria-busy`); if the request
 * errors or never resolves it renders an alert with a retry button instead of
 * an eternal skeleton. Strings come from i18n (`loadState.*`, es/en) and can be
 * overridden per call through `labels`.
 */
export function LoadState({
  loading,
  error,
  timeoutMs,
  onRetry,
  skeleton,
  labels,
  size = 'default',
  className,
  children,
}: LoadStateProps) {
  const { t } = useTranslation()
  const guard = useLoadingGuard(loading, { timeoutMs })
  const failed = Boolean(error) || (loading && guard.timedOut)

  if (failed) {
    const timedOut = !error
    const handleRetry = () => {
      guard.retry()
      onRetry?.()
    }
    return (
      <div
        role='alert'
        data-slot='load-state-error'
        className={cn(
          'flex flex-col items-center gap-1 text-center',
          size === 'inline' ? 'p-3 text-xs' : 'p-6 text-sm',
          className,
        )}
      >
        <p className='text-foreground font-medium'>
          {labels?.title ??
            t(timedOut ? 'loadState.timeoutTitle' : 'loadState.errorTitle', {
              defaultValue: timedOut ? 'This is taking too long' : 'Could not load',
            })}
        </p>
        <p className='text-muted-foreground'>
          {labels?.hint ??
            t(timedOut ? 'loadState.timeoutHint' : 'loadState.errorHint', {
              defaultValue: timedOut
                ? 'The server did not respond. Check your connection and try again.'
                : 'Something went wrong while fetching this content.',
            })}
        </p>
        {onRetry && (
          <Button variant='outline' size='sm' className='mt-2' onClick={handleRetry}>
            {labels?.retry ?? t('loadState.retry', { defaultValue: 'Retry' })}
          </Button>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div
        role='status'
        aria-busy='true'
        aria-live='polite'
        data-slot='load-state-loading'
        className={className}
      >
        <span className='sr-only'>
          {labels?.loading ?? t('loadState.loading', { defaultValue: 'Loading…' })}
        </span>
        {skeleton}
      </div>
    )
  }

  return <>{children}</>
}

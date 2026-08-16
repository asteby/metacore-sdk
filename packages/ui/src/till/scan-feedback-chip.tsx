import { cn } from '@/lib/utils'

export type ScanFeedbackTone = 'success' | 'error'

export type ScanFeedbackChipProps = {
  message: string
  tone?: ScanFeedbackTone
  className?: string
}

/**
 * Chip above the camera scanner overlay (z-[110]). Host Sonner sits under the
 * opaque scanner (z-[100]), so tills need this visible confirmation.
 */
export function ScanFeedbackChip({
  message,
  tone = 'success',
  className,
}: ScanFeedbackChipProps) {
  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 top-16 z-[110] flex justify-center px-4',
        className
      )}
      role='status'
      aria-live='polite'
    >
      <div
        className={
          tone === 'error'
            ? 'max-w-[90%] rounded-full bg-red-500 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg'
            : 'max-w-[90%] rounded-full bg-emerald-500 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg'
        }
      >
        {message}
      </div>
    </div>
  )
}

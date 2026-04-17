import { WifiOff } from 'lucide-react'
import { usePWAContext } from '../provider'

export interface OfflineIndicatorProps {
  message?: string
  className?: string
}

export function OfflineIndicator({
  message = 'Sin conexión - Modo offline',
  className,
}: OfflineIndicatorProps = {}) {
  const { isOnline } = usePWAContext()

  if (isOnline) return null

  return (
    <div
      className={
        className ??
        'fixed top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground px-4 py-2'
      }
    >
      <div className="flex items-center justify-center gap-2 text-sm">
        <WifiOff className="h-4 w-4" />
        <span>{message}</span>
      </div>
    </div>
  )
}

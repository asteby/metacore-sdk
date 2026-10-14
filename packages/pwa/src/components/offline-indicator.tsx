import { CheckCircle2, Loader2, WifiOff } from 'lucide-react'
import { useConnectionState } from '../connection'

export interface OfflineIndicatorProps {
  /** Texto cuando el dispositivo no tiene red. */
  message?: string
  /** Texto cuando el servidor no responde. */
  serverMessage?: string
  /** Texto al recuperarse la conexión. */
  restoredMessage?: string
  /** Reemplaza las clases de la pastilla. */
  className?: string
}

/**
 * Aviso discreto de conexión: una pastilla abajo al centro mientras no hay red
 * o el servidor no responde (tras la gracia de `connection.ts`), y «Conexión
 * restablecida» un momento al volver. Anuncia los cambios con aria-live y
 * respeta prefers-reduced-motion. Para detectar caídas del servidor, conecta
 * el cliente HTTP con `attachConnectionReporter(api)`; sin él, solo detecta la
 * red del dispositivo.
 */
export function OfflineIndicator({
  message = 'Sin internet',
  serverMessage = 'Sin conexión con el servidor · reintentando…',
  restoredMessage = 'Conexión restablecida',
  className,
}: OfflineIndicatorProps = {}) {
  const state = useConnectionState()
  const text =
    state === 'no-internet' ? message : state === 'offline' ? serverMessage : state === 'restored' ? restoredMessage : null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
      style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
    >
      {text ? (
        <div
          data-connection-state={state}
          className={
            className ??
            'pointer-events-auto flex max-w-[calc(100vw-7rem)] items-center gap-2 rounded-full border border-border/40 bg-foreground/95 px-3.5 py-2 text-sm font-medium text-background shadow-lg backdrop-blur motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2'
          }
        >
          {state === 'restored' ? (
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          ) : state === 'no-internet' ? (
            <WifiOff className="size-4 shrink-0" aria-hidden />
          ) : (
            <Loader2 className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden />
          )}
          <span className="truncate">{text}</span>
        </div>
      ) : null}
    </div>
  )
}

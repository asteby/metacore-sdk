import { useEffect, useRef } from 'react'
import { Phone, PhoneOff, ScreenShare, Video } from 'lucide-react'
import type { CallKind } from '../../lib/chrome-media'
import { startCallRingtone } from '../../lib/sound'
import { cn } from '@asteby/metacore-ui'

export function IncomingCallBanner({
  name,
  kind,
  connecting,
  /** Fresh ring vs rejoin after reload (active room — no ringtone). */
  ring = true,
  onAccept,
  onDecline,
}: {
  name: string
  kind: CallKind
  connecting?: boolean
  ring?: boolean
  onAccept: () => void
  onDecline: () => void
}) {
  const stopRingRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    // Contestar / Unirse: stop immediately. Active-room rejoin: never start.
    if (connecting || !ring) {
      stopRingRef.current?.()
      stopRingRef.current = null
      try {
        navigator.vibrate?.(0)
      } catch {
        /* ignore */
      }
      return
    }
    stopRingRef.current = startCallRingtone()
    try {
      navigator.vibrate?.([200, 100, 200, 100, 200])
    } catch {
      /* ignore */
    }
    let notif: Notification | null = null
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        notif = new Notification(`${name}`, {
          body:
            kind === 'screen'
              ? 'Quiere compartir pantalla'
              : kind === 'video'
                ? 'Videollamada entrante'
                : 'Llamada entrante',
          tag: 'asteby-incoming-call',
          requireInteraction: true,
        })
        notif.onclick = () => {
          window.focus()
          notif?.close()
        }
      } else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        void Notification.requestPermission()
      }
    } catch {
      /* ignore */
    }
    return () => {
      stopRingRef.current?.()
      stopRingRef.current = null
      try {
        navigator.vibrate?.(0)
      } catch {
        /* ignore */
      }
      notif?.close()
    }
  }, [name, kind, connecting, ring])

  const KindIcon = kind === 'screen' ? ScreenShare : kind === 'video' ? Video : Phone
  const label = !ring
    ? 'Llamada en curso — Unirse'
    : kind === 'screen'
      ? 'Quiere compartir pantalla'
      : kind === 'video'
        ? 'Videollamada entrante'
        : 'Llamada entrante'
  const acceptTitle = ring ? 'Contestar' : 'Unirse'

  return (
    <div className='pointer-events-none fixed inset-x-0 top-3 z-[145] flex justify-center px-4'>
      <div
        className={cn(
          'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl',
          'border border-border bg-card px-3 py-2.5 text-card-foreground shadow-2xl',
        )}
      >
        <div className='relative flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary ring-2 ring-primary'>
          <KindIcon className='size-5' />
        </div>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-sm font-semibold'>{name}</p>
          <p className='text-[11px] text-muted-foreground'>
            {connecting ? 'Conectando…' : label}
          </p>
        </div>
        <button
          type='button'
          className='inline-flex size-10 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50'
          onClick={onDecline}
          disabled={connecting}
          title={ring ? 'Rechazar' : 'Ignorar'}
        >
          <PhoneOff className='size-4' />
        </button>
        <button
          type='button'
          className='inline-flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
          onClick={onAccept}
          disabled={connecting}
          title={acceptTitle}
        >
          <Phone className='size-4' />
        </button>
      </div>
    </div>
  )
}

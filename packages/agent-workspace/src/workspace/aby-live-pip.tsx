import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Mic, MicOff, Check, X } from 'lucide-react'
import { Mascot } from './mascot'
import { cn } from '@asteby/metacore-ui'
import { useAbyLiveStore, type AbyLivePhase } from '../lib/aby-live-store'
import { canUseMicWaveform, subscribeVoiceLevels, VOICE_BAR_COUNT } from '../lib/voice-levels'
import { Button } from '@asteby/metacore-ui'
import { useWorkspacePlatformConfig } from '../host'

/**
 * Floating Aby orb for live mode when the chat panel is minimized —
 * tap to reopen. Bars follow mic on desktop; soft pulse on mobile.
 * Mute button stops listening without leaving live.
 * Pending proposals show Aceptar/Rechazar without restoring the panel.
 */
export function AbyLivePip({
  visible,
  onOpen,
}: {
  visible: boolean
  onOpen: () => void
}) {
  const active = useAbyLiveStore((s) => s.active)
  const phase = useAbyLiveStore((s) => s.phase)
  const hint = useAbyLiveStore((s) => s.hint)
  const micMuted = useAbyLiveStore((s) => s.micMuted)
  const toggleMicMuted = useAbyLiveStore((s) => s.toggleMicMuted)
  const pendingProposal = useAbyLiveStore((s) => s.pendingProposal)
  const decidePending = useAbyLiveStore((s) => s.decidePending)
  const [levels, setLevels] = useState(() =>
    Array.from({ length: VOICE_BAR_COUNT }, () => 0.2),
  )

  const show = visible && active
  const effectivePhase: AbyLivePhase = micMuted && phase === 'listening' ? 'idle' : phase

  useEffect(() => {
    if (!show) return
    if (!micMuted && effectivePhase === 'listening' && canUseMicWaveform()) {
      return subscribeVoiceLevels(setLevels)
    }
    let raf = 0
    let t = 0
    const amp = micMuted
      ? 0.12
      : effectivePhase === 'speaking'
        ? 0.7
        : effectivePhase === 'listening'
          ? 0.85
          : effectivePhase === 'thinking'
            ? 0.4
            : 0.2
    const tick = () => {
      t += effectivePhase === 'listening' ? 0.14 : 0.1
      setLevels(
        Array.from({ length: 12 }, (_, i) => {
          const wave =
            0.3 + Math.sin(t + i * 0.55) * 0.32 + Math.sin(t * 1.7 + i) * 0.12
          return Math.min(1, Math.max(0.1, wave * amp))
        }),
      )
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [show, effectivePhase, micMuted])

  const ring = useMemo(() => phaseRing(effectivePhase, micMuted), [effectivePhase, micMuted])
  const label = micMuted ? 'Mic off' : phaseLabel(effectivePhase)
  const { mascot_name: mascotName, mascot_skin: mascotSkin } = useWorkspacePlatformConfig()

  if (!show) return null

  return (
    <div className='fixed bottom-6 right-6 z-40 flex max-w-[min(22rem,calc(100vw-2rem))] flex-col items-end gap-2'>
      {pendingProposal ? (
        <div className='w-full rounded-xl border border-border/80 bg-card/95 p-2.5 shadow-xl backdrop-blur-md'>
          <p className='mb-2 truncate text-xs font-semibold'>{pendingProposal.title}</p>
          <div className='flex gap-2'>
            <Button
              size='sm'
              className='h-8 flex-1 gap-1 text-xs'
              disabled={pendingProposal.deciding}
              onClick={() => decidePending(true)}
            >
              <Check className='size-3.5' />
              {(pendingProposal.ids?.length || 1) > 1
                ? `Aceptar (${pendingProposal.ids.length})`
                : 'Aceptar'}
            </Button>
            <Button
              size='sm'
              variant='outline'
              className='h-8 flex-1 gap-1 text-xs'
              disabled={pendingProposal.deciding}
              onClick={() => decidePending(false)}
            >
              <X className='size-3.5' /> Rechazar
            </Button>
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          'flex items-center gap-1 rounded-full border px-1.5 py-1.5 shadow-xl backdrop-blur-md',
          ring.shell,
        )}
      >
        <button
          type='button'
          onClick={onOpen}
          title={`${label}${hint ? ` — ${hint}` : ''}`}
          className='flex items-center gap-2.5 rounded-full px-1 py-0.5 transition-transform hover:scale-[1.03] active:scale-95'
        >
          <span
            className={cn(
              'relative flex h-11 w-11 items-center justify-center rounded-full',
              ring.avatar,
            )}
          >
            <span
              className={cn(
                'absolute inset-0 rounded-full opacity-70 blur-[6px]',
                ring.glow,
                !micMuted && effectivePhase !== 'idle' && 'animate-pulse',
              )}
            />
            {micMuted ? (
              <MicOff className='relative h-5 w-5 text-white' />
            ) : (
              <Mascot skin={mascotSkin} state={effectivePhase} size={38} className='relative' />
            )}
            {effectivePhase === 'thinking' && !micMuted && (
              <Sparkles className='absolute -end-0.5 -top-0.5 h-3 w-3 animate-pulse text-amber-300' />
            )}
          </span>
          <span className='hidden min-w-0 pe-1 sm:flex sm:flex-col sm:items-start'>
            <span className='text-xs font-semibold text-foreground'>{mascotName}</span>
            <span className='max-w-[9rem] truncate text-[10px] text-muted-foreground'>
              {label}
            </span>
          </span>
          <span className='flex h-7 items-end gap-0.5 pe-1' aria-hidden>
            {levels.slice(0, 12).map((h, i) => (
              <span
                key={i}
                className={cn(
                  'w-0.5 rounded-full transition-[height] duration-75',
                  ring.bar,
                )}
                style={{ height: `${Math.round(h * 100)}%` }}
              />
            ))}
          </span>
        </button>
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation()
            toggleMicMuted()
          }}
          title={micMuted ? 'Encender micrófono' : 'Apagar micrófono'}
          className={cn(
            'mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors',
            micMuted
              ? 'border-destructive/40 bg-destructive/15 text-destructive'
              : 'border-border/60 bg-background/40 text-foreground hover:bg-muted',
          )}
        >
          {micMuted ? <MicOff className='h-4 w-4' /> : <Mic className='h-4 w-4' />}
        </button>
      </div>
    </div>
  )
}

function phaseLabel(phase: AbyLivePhase): string {
  if (phase === 'speaking') return 'Hablando'
  if (phase === 'thinking') return 'Pensando'
  if (phase === 'listening') return 'Te escucho'
  return 'Live'
}

function phaseRing(phase: AbyLivePhase, muted: boolean) {
  if (muted) {
    return {
      shell: 'border-destructive/40 bg-card/95',
      avatar: 'bg-gradient-to-br from-rose-500 to-red-700',
      glow: 'bg-rose-400',
      bar: 'bg-gradient-to-t from-rose-700 to-rose-300',
    }
  }
  if (phase === 'listening') {
    return {
      shell: 'border-emerald-500/40 bg-card/95',
      avatar: 'bg-gradient-to-br from-emerald-500 to-teal-600',
      glow: 'bg-emerald-400',
      bar: 'bg-gradient-to-t from-emerald-600 to-teal-300',
    }
  }
  if (phase === 'thinking') {
    return {
      shell: 'border-purple-500/40 bg-card/95',
      avatar: 'bg-gradient-to-br from-purple-500 to-violet-700',
      glow: 'bg-purple-400',
      bar: 'bg-gradient-to-t from-purple-600 to-violet-300',
    }
  }
  if (phase === 'speaking') {
    return {
      shell: 'border-sky-500/40 bg-card/95',
      avatar: 'bg-gradient-to-br from-sky-500 to-indigo-600',
      glow: 'bg-sky-400',
      bar: 'bg-gradient-to-t from-sky-600 to-cyan-300',
    }
  }
  return {
    shell: 'border-border bg-card/95',
    avatar: 'bg-gradient-to-br from-primary to-primary/70',
    glow: 'bg-primary/50',
    bar: 'bg-gradient-to-t from-primary to-primary/40',
  }
}

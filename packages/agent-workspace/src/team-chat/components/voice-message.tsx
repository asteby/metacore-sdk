import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Pause, Play } from 'lucide-react'
import { cn } from '@asteby/metacore-ui'
import {
  formatVoiceDuration,
  peaksFromAudioUrl,
  placeholderPeaks,
} from '../../lib/audio-waveform'

function finiteDuration(n: number | null | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * WhatsApp-style voice note: play + vertical bars + drag-scrub + live clock.
 * MediaRecorder webm often reports `audio.duration === Infinity` — we prefer
 * the stored/decoded duration and drive the bar with rAF while playing.
 */
export function VoiceMessage({
  src,
  waveform,
  durationSec,
  mine,
  className,
  /**
   * When true this component IS the chat bubble (WhatsApp). Parent must not
   * paint another card around it. Default false = nested inside a text bubble.
   */
  standalone = false,
}: {
  src: string
  waveform?: number[] | null
  durationSec?: number | null
  mine?: boolean
  className?: string
  standalone?: boolean
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const railRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)
  const rafRef = useRef(0)
  const durationRef = useRef(finiteDuration(durationSec))

  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(() => finiteDuration(durationSec))
  const [peaks, setPeaks] = useState<number[]>(() =>
    waveform?.length ? waveform : placeholderPeaks(src),
  )

  useEffect(() => {
    durationRef.current = duration
  }, [duration])

  const bumpDuration = useCallback((d: number) => {
    const next = finiteDuration(d)
    if (next <= 0) return
    setDuration((prev) => {
      if (prev > 0) return prev
      durationRef.current = next
      return next
    })
  }, [])

  useEffect(() => {
    if (waveform?.length) {
      setPeaks(waveform)
      return
    }
    let cancelled = false
    void peaksFromAudioUrl(src)
      .then(({ peaks: p, duration: d }) => {
        if (cancelled) return
        setPeaks(p)
        bumpDuration(d)
      })
      .catch(() => {
        /* keep placeholder */
      })
    return () => {
      cancelled = true
    }
  }, [src, waveform, bumpDuration])

  const syncFromElement = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    bumpDuration(el.duration)
    const total = durationRef.current || finiteDuration(el.duration)
    const t = el.currentTime
    if (!Number.isFinite(t) || t < 0) return
    // If media duration is unknown, still show elapsed clock from currentTime.
    setCurrent(total > 0 ? Math.min(t, total) : t)
  }, [bumpDuration])

  const stopRaf = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [])

  const startRaf = useCallback(() => {
    stopRaf()
    const tick = () => {
      syncFromElement()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [stopRaf, syncFromElement])

  useEffect(() => {
    const el = new Audio(src)
    el.preload = 'auto'
    audioRef.current = el

    const onMeta = () => bumpDuration(el.duration)
    const onEnd = () => {
      setPlaying(false)
      stopRaf()
      setCurrent(0)
      try {
        el.currentTime = 0
      } catch {
        /* ignore */
      }
    }
    const onPlay = () => {
      setPlaying(true)
      startRaf()
    }
    const onPause = () => {
      setPlaying(false)
      stopRaf()
      syncFromElement()
    }

    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('durationchange', onMeta)
    el.addEventListener('ended', onEnd)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)

    return () => {
      stopRaf()
      el.pause()
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('durationchange', onMeta)
      el.removeEventListener('ended', onEnd)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      audioRef.current = null
    }
  }, [src, bumpDuration, startRaf, stopRaf, syncFromElement])

  const resolveTotal = useCallback(() => {
    const el = audioRef.current
    return (
      durationRef.current ||
      finiteDuration(el?.duration) ||
      0
    )
  }, [])

  const seekRatio = useCallback(
    (ratio: number) => {
      const el = audioRef.current
      if (!el) return
      const total = resolveTotal()
      if (total <= 0) return
      const r = Math.max(0, Math.min(1, ratio))
      const t = r * total
      try {
        el.currentTime = t
      } catch {
        /* some webm reject seek until buffered */
      }
      setCurrent(t)
    },
    [resolveTotal],
  )

  const ratioFromClientX = useCallback((clientX: number) => {
    const rail = railRef.current
    if (!rail) return 0
    const rect = rail.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return (clientX - rect.left) / rect.width
  }, [])

  const onRailPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      draggingRef.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      seekRatio(ratioFromClientX(e.clientX))
    },
    [ratioFromClientX, seekRatio],
  )

  const onRailPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      seekRatio(ratioFromClientX(e.clientX))
    },
    [ratioFromClientX, seekRatio],
  )

  const onRailPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [])

  const toggle = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      void el.play().catch(() => setPlaying(false))
    } else {
      el.pause()
    }
  }, [])

  const bars = useMemo(() => peaks.slice(0, 28), [peaks])
  // Prefer stored duration; while playing without metadata, grow with currentTime
  // so the bar never freezes at 0:00 on MediaRecorder webm (duration=Infinity).
  const total =
    duration > 0
      ? duration
      : playing || current > 0
        ? Math.max(current + 0.35, 0.5)
        : 0
  const progress = total > 0 ? Math.min(1, current / total) : 0
  // WhatsApp: show elapsed while playing/scrubbing, else full duration.
  const clock = playing || current > 0.05 ? current : duration > 0 ? duration : 0

  // `standalone` = this IS the bubble (no parent chat-box). Nested = inside text bubble.
  const shell = standalone
    ? mine
      ? 'rounded-[16px_16px_4px_16px] bg-primary px-2 py-1.5 text-primary-foreground shadow-sm'
      : 'rounded-[16px_16px_16px_4px] bg-muted px-2 py-1.5 text-foreground shadow-sm'
    : ''

  return (
    <div
      className={cn(
        // WhatsApp: grid auto-cols + w-max so parents with items-stretch
        // cannot push the clock to the far edge of a wide row.
        'grid w-max max-w-full grid-cols-[auto_auto_auto] items-center gap-x-1.5 select-none',
        shell,
        className,
      )}
      style={{ width: 'max-content' }}
    >
      <button
        type='button'
        onClick={toggle}
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full transition-colors',
          mine
            ? 'bg-primary-foreground/90 text-primary hover:bg-primary-foreground'
            : 'bg-primary text-primary-foreground hover:bg-primary/90',
        )}
        aria-label={playing ? 'Pausar' : 'Reproducir'}
      >
        {playing ? <Pause className='size-3.5 fill-current' /> : <Play className='size-3.5 fill-current' />}
      </button>

      <div
        ref={railRef}
        role='slider'
        tabIndex={0}
        aria-label='Posición del audio'
        aria-valuemin={0}
        aria-valuemax={Math.round(total || 0)}
        aria-valuenow={Math.round(current)}
        className='flex h-8 w-max cursor-pointer touch-none items-center gap-px'
        onPointerDown={onRailPointerDown}
        onPointerMove={onRailPointerMove}
        onPointerUp={onRailPointerUp}
        onPointerCancel={onRailPointerUp}
        onKeyDown={(e) => {
          const totalSec = resolveTotal() || total
          if (totalSec <= 0) return
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            seekRatio((current + 1) / totalSec)
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault()
            seekRatio((current - 1) / totalSec)
          }
        }}
      >
        {bars.map((h, i) => {
          const filled = bars.length <= 1 ? progress > 0 : i / (bars.length - 1) <= progress
          return (
            <span
              key={i}
              className={cn(
                'pointer-events-none block w-[2.5px] shrink-0 rounded-full',
                filled
                  ? mine
                    ? 'bg-primary-foreground'
                    : 'bg-primary'
                  : mine
                    ? 'bg-primary-foreground/35'
                    : 'bg-muted-foreground/40',
              )}
              style={{ height: `${Math.round(6 + h * 16)}px` }}
            />
          )
        })}
      </div>

      <span
        className={cn(
          'tabular-nums text-[10px] font-medium leading-none',
          mine ? 'text-primary-foreground/85' : 'text-muted-foreground',
        )}
      >
        {formatVoiceDuration(clock)}
      </span>
    </div>
  )
}

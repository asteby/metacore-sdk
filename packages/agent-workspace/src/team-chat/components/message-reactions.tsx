import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Reply } from 'lucide-react'
import { cn } from '@asteby/metacore-ui'
import { EmojiPickerButton } from './emoji-picker'
import type { MessageReaction } from '../data/types'

const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉']
const SWIPE_TRIGGER = 64
const SWIPE_MAX = 88

/**
 * WhatsApp-style: swipe right to reply, right-click for Reply + reactions.
 * Reaction chips stay under the bubble when present.
 */
export function MessageReactions({
  reactions,
  onToggle,
  onReply,
  align = 'start',
  children,
}: {
  reactions?: MessageReaction[] | null
  onToggle: (emoji: string) => void
  onReply?: () => void
  align?: 'start' | 'end'
  children: ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [swipeX, setSwipeX] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const swipeXRef = useRef(0)
  const swipeRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    active: boolean
    locked: boolean | null
  } | null>(null)
  const list = reactions ?? []

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const pick = (emoji: string) => {
    onToggle(emoji)
    setMenuOpen(false)
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!onReply || e.button !== 0) return
    // Don't steal scrub/seek from voice rails or interactive controls.
    const t = e.target as HTMLElement | null
    if (t?.closest?.('button, a, input, textarea, [role="slider"], audio, video')) return
    swipeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      active: true,
      locked: null,
    }
    swipeXRef.current = 0
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipeRef.current
    if (!s?.active || s.pointerId !== e.pointerId) return
    const dx = e.clientX - s.startX
    const dy = e.clientY - s.startY
    if (s.locked === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      // Horizontal right-swipe only; vertical scroll wins otherwise.
      s.locked = Math.abs(dx) > Math.abs(dy) && dx > 0
      if (!s.locked) {
        s.active = false
        swipeXRef.current = 0
        setSwipeX(0)
        return
      }
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    if (!s.locked) return
    e.preventDefault()
    const next = Math.max(0, Math.min(SWIPE_MAX, dx))
    swipeXRef.current = next
    setSwipeX(next)
  }

  const endSwipe = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipeRef.current
    if (!s || s.pointerId !== e.pointerId) return
    const triggered = !!s.locked && swipeXRef.current >= SWIPE_TRIGGER
    swipeRef.current = null
    swipeXRef.current = 0
    setSwipeX(0)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    if (triggered && onReply) {
      try {
        navigator.vibrate?.(12)
      } catch {
        /* ignore */
      }
      onReply()
    }
  }

  const replyProgress = Math.min(1, swipeX / SWIPE_TRIGGER)

  return (
    <div
      ref={rootRef}
      className={cn(
        'relative flex w-max max-w-full flex-col touch-pan-y',
        align === 'end' ? 'items-end' : 'items-start',
      )}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenuOpen(true)
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endSwipe}
      onPointerCancel={endSwipe}
    >
      <div className='relative w-max max-w-full'>
        {onReply && (
          <div
            className='pointer-events-none absolute top-1/2 left-0 z-0 flex -translate-x-full -translate-y-1/2 items-center pr-2'
            aria-hidden
          >
            <span
              className={cn(
                'inline-flex size-8 items-center justify-center rounded-full bg-primary/15 text-primary transition-transform',
                replyProgress >= 1 && 'bg-primary text-primary-foreground',
              )}
              style={{
                opacity: replyProgress,
                transform: `scale(${0.55 + replyProgress * 0.45})`,
              }}
            >
              <Reply className='size-4' />
            </span>
          </div>
        )}
        <div
          className='relative z-[1] will-change-transform'
          style={{
            transform: swipeX ? `translateX(${swipeX}px)` : undefined,
            transition: swipeX ? undefined : 'transform 160ms ease-out',
          }}
        >
          {children}
        </div>
      </div>

      {list.length > 0 && (
        <div
          className={cn(
            'mt-1 flex flex-wrap items-center gap-1',
            align === 'end' ? 'justify-end' : 'justify-start',
          )}
        >
          {list.map((r) => (
            <button
              key={r.emoji}
              type='button'
              title={r.me ? 'Quitar reacción' : 'Reaccionar'}
              onClick={() => onToggle(r.emoji)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors',
                r.me
                  ? 'border-primary/40 bg-primary/15 text-foreground'
                  : 'border-border bg-muted/60 hover:bg-muted',
              )}
            >
              <span className='leading-none'>{r.emoji}</span>
              <span className='tabular-nums text-[10px] text-muted-foreground'>{r.count}</span>
            </button>
          ))}
        </div>
      )}

      {menuOpen && (
        <div
          className={cn(
            'absolute z-[130] flex flex-col gap-1 rounded-2xl border bg-card p-1.5 shadow-xl',
            align === 'end' ? 'right-0' : 'left-0',
            list.length > 0 ? 'bottom-full mb-1' : '-top-2 -translate-y-full',
          )}
          role='menu'
          aria-label='Acciones del mensaje'
        >
          {onReply && (
            <button
              type='button'
              role='menuitem'
              className='flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm font-medium hover:bg-muted'
              onClick={() => {
                onReply()
                setMenuOpen(false)
              }}
            >
              <Reply className='size-4 text-muted-foreground' />
              Responder
            </button>
          )}
          <div className='flex items-center gap-0.5 rounded-full px-0.5'>
            {QUICK.map((e) => (
              <button
                key={e}
                type='button'
                className='rounded-full px-1.5 py-1 text-base leading-none hover:bg-muted'
                onClick={() => pick(e)}
                title={`Reaccionar ${e}`}
              >
                {e}
              </button>
            ))}
            <EmojiPickerButton compact title='Más emojis' onPick={pick} />
          </div>
        </div>
      )}
    </div>
  )
}

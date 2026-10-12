import { X } from 'lucide-react'
import { cn } from '@asteby/metacore-ui'
import type { MessageReplyPreview } from '../data/types'

/** Quoted reply strip inside a bubble or above the composer. */
export function ReplyQuote({
  reply,
  mine,
  onClear,
  onJump,
  compact,
}: {
  reply: MessageReplyPreview
  mine?: boolean
  onClear?: () => void
  onJump?: () => void
  compact?: boolean
}) {
  const Tag = onJump ? 'button' : 'div'
  return (
    <div
      className={cn(
        'flex min-w-0 items-stretch gap-1.5 overflow-hidden rounded-lg border-s-[3px]',
        mine
          ? 'border-s-primary-foreground/70 bg-primary-foreground/10'
          : 'border-s-primary bg-background/50',
        compact ? 'mb-0' : 'mb-1.5',
      )}
    >
      <Tag
        type={onJump ? 'button' : undefined}
        onClick={onJump}
        className={cn(
          'min-w-0 flex-1 px-2 py-1 text-left',
          onJump && 'cursor-pointer hover:opacity-90',
        )}
      >
        <p
          className={cn(
            'truncate text-[11px] font-semibold',
            mine ? 'text-primary-foreground/90' : 'text-primary',
          )}
        >
          {reply.sender_name || 'Mensaje'}
        </p>
        <p
          className={cn(
            'line-clamp-2 text-[11px] leading-snug',
            mine ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          {reply.body || '…'}
        </p>
      </Tag>
      {onClear && (
        <button
          type='button'
          className='shrink-0 self-center p-1.5 text-muted-foreground hover:text-foreground'
          title='Cancelar respuesta'
          onClick={onClear}
        >
          <X className='size-3.5' />
        </button>
      )}
    </div>
  )
}

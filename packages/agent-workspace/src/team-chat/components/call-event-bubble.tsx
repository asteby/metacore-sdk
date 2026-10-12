import { Phone, PhoneMissed, ScreenShare, Video } from 'lucide-react'
import { Button } from '@asteby/metacore-ui'
import { cn } from '@asteby/metacore-ui'
import type { ChatAttachment } from '../data/types'

/** Compact WhatsApp-style missed/ended call row with optional callback. */
export function CallEventBubble({
  call,
  label,
  mine,
  onCallback,
}: {
  call: ChatAttachment
  label: string
  mine?: boolean
  onCallback?: (kind: 'audio' | 'video' | 'screen') => void
}) {
  const missed = call.status === 'missed'
  const KindIcon =
    call.kind === 'video' ? Video : call.kind === 'screen' ? ScreenShare : Phone
  const Icon = missed ? PhoneMissed : KindIcon
  const callbackKind =
    call.kind === 'video' || call.kind === 'screen' ? call.kind : 'audio'

  return (
    <div
      className={cn(
        'inline-flex max-w-full flex-col gap-1 rounded-2xl border px-2.5 py-1.5 text-sm',
        mine ? 'border-primary/20 bg-primary/10' : 'border-border bg-muted/60',
      )}
    >
      <div className='flex items-center gap-2'>
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-full',
            missed ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary',
          )}
        >
          <Icon className='size-3.5' />
        </span>
        <div className='min-w-0'>
          <p className='truncate text-[13px] font-medium leading-tight'>{label}</p>
          <p className='text-[10px] leading-tight text-muted-foreground'>
            {call.kind === 'video'
              ? 'Videollamada'
              : call.kind === 'screen'
                ? 'Pantalla'
                : 'Audio'}
          </p>
        </div>
        {missed && onCallback && (
          <Button
            type='button'
            size='sm'
            variant='secondary'
            className='ml-1 h-7 shrink-0 text-[11px]'
            onClick={() => onCallback(callbackKind as 'audio' | 'video' | 'screen')}
          >
            <KindIcon className='mr-1 size-3' />
            Devolver
          </Button>
        )}
      </div>
    </div>
  )
}

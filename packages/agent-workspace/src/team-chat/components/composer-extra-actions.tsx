import { Mic, MicOff, Paperclip, Plus } from 'lucide-react'
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@asteby/metacore-ui'
import { cn } from '@asteby/metacore-ui'
import { EmojiPickerButton } from './emoji-picker'
import { VoiceNoteButton } from './voice-note-button'
import type { ChatAttachment } from '../data/types'

/**
 * Composer extras: on mobile collapse into one "+" menu so the input keeps width;
 * on sm+ show attach / emoji / voice-note / dictate inline.
 */
export function ComposerExtraActions({
  onAttach,
  onEmoji,
  onVoiceReady,
  voiceDisabled,
  listening,
  onToggleDictation,
  dictateTitle = 'Dictar (voz a texto)',
  attachTitle = 'Adjuntar',
}: {
  onAttach: () => void
  onEmoji: (emoji: string) => void
  onVoiceReady: (file: ChatAttachment) => void
  voiceDisabled?: boolean
  listening?: boolean
  onToggleDictation?: () => void
  dictateTitle?: string
  attachTitle?: string
}) {
  const desktop = (
    <div className='hidden items-center gap-0.5 sm:flex'>
      <Button
        size='icon'
        type='button'
        variant='ghost'
        className='h-8 w-8 shrink-0 rounded-md'
        title={attachTitle}
        onClick={onAttach}
      >
        <Plus size={20} className='stroke-muted-foreground' />
      </Button>
      <EmojiPickerButton onPick={onEmoji} />
      <VoiceNoteButton disabled={voiceDisabled} onReady={onVoiceReady} />
      {onToggleDictation && (
        <Button
          size='icon'
          type='button'
          variant='ghost'
          className={cn('h-8 w-8 shrink-0 rounded-md', listening && 'text-destructive')}
          title={dictateTitle}
          onClick={onToggleDictation}
        >
          {listening ? <MicOff size={18} /> : <Mic size={18} className='stroke-muted-foreground' />}
        </Button>
      )}
    </div>
  )

  const mobile = (
    <div className='sm:hidden'>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            size='icon'
            type='button'
            variant='ghost'
            className='h-8 w-8 shrink-0 rounded-md'
            title='Más acciones'
          >
            <Plus size={20} className='stroke-muted-foreground' />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align='start'
          side='top'
          className='w-auto p-1.5'
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className='flex items-center gap-0.5'>
            <Button
              size='icon'
              type='button'
              variant='ghost'
              className='h-9 w-9 rounded-md'
              title={attachTitle}
              onClick={onAttach}
            >
              <Paperclip className='size-4' />
            </Button>
            <EmojiPickerButton onPick={onEmoji} />
            <VoiceNoteButton disabled={voiceDisabled} onReady={onVoiceReady} />
            {onToggleDictation && (
              <Button
                size='icon'
                type='button'
                variant='ghost'
                className={cn('h-9 w-9 rounded-md', listening && 'text-destructive')}
                title={dictateTitle}
                onClick={onToggleDictation}
              >
                {listening ? <MicOff size={18} /> : <Mic size={18} />}
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )

  return (
    <>
      {mobile}
      {desktop}
    </>
  )
}

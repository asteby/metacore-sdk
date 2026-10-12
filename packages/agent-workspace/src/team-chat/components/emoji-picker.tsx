import { useState, useEffect } from 'react'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import { Smile } from 'lucide-react'
import { Button, Popover, PopoverContent, PopoverTrigger } from '@asteby/metacore-ui'
import { cn } from '@asteby/metacore-ui'

type EmojiSelect = { native?: string; id?: string; shortcodes?: string }

/**
 * Pro emoji picker (emoji-mart) for composers and reaction adders.
 */
export function EmojiPickerButton({
  onPick,
  className,
  title = 'Emoji',
  compact,
}: {
  onPick: (emoji: string) => void
  className?: string
  title?: string
  /** Smaller trigger for hover reaction bars. */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const root = document.documentElement
    const sync = () =>
      setTheme(root.classList.contains('dark') ? 'dark' : 'light')
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size='icon'
          type='button'
          variant='ghost'
          className={cn(
            compact ? 'h-7 w-7 rounded-md' : 'h-8 shrink-0 rounded-md',
            className,
          )}
          title={title}
        >
          <Smile size={compact ? 14 : 18} className='stroke-muted-foreground' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className='w-auto border-0 bg-transparent p-0 shadow-none'
        align='start'
        side='top'
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Picker
          data={data}
          theme={theme}
          locale='es'
          previewPosition='none'
          skinTonePosition='search'
          maxFrequentRows={2}
          onEmojiSelect={(emoji: EmojiSelect) => {
            if (emoji.native) {
              onPick(emoji.native)
              setOpen(false)
            }
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

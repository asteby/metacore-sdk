import { SearchIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/utils'
import { Button } from '../primitives/button'

export type SearchProps = {
  className?: string
  type?: React.HTMLInputTypeAttribute
  placeholder?: string
  /**
   * Called when the user clicks the trigger. Apps typically wire this to
   * `useSearch().setOpen(true)` from `@asteby/metacore-app-providers`, but it
   * is left injectable so the component stays transport-agnostic.
   */
  onOpen?: () => void
}

/**
 * Search trigger button rendered in app headers. Opens the consumer-provided
 * command menu when clicked. Brand-neutral: the placeholder defaults to the
 * `common.search` translation key.
 */
export function Search({
  className = '',
  placeholder,
  onOpen,
}: SearchProps) {
  const { t } = useTranslation()
  const displayPlaceholder = placeholder || t('common.search')

  return (
    <Button
      variant='outline'
      className={cn(
        'bg-muted/25 group text-muted-foreground hover:bg-accent relative h-8 w-full flex-1 justify-start rounded-md text-sm font-normal shadow-none sm:w-40 sm:pe-12 md:flex-none lg:w-52 xl:w-64',
        className
      )}
      onClick={onOpen}
    >
      <SearchIcon
        aria-hidden='true'
        className='absolute start-1.5 top-1/2 -translate-y-1/2'
        size={16}
      />
      <span className='ms-4'>{displayPlaceholder}</span>
      <kbd className='bg-muted group-hover:bg-accent pointer-events-none absolute end-[0.3rem] top-[0.3rem] hidden h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100 select-none sm:flex'>
        <span className='text-xs'>⌘</span>K
      </kbd>
    </Button>
  )
}

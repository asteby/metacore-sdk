import { format } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import { Button } from '../primitives/button'
import { Calendar } from '../primitives/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../primitives/popover'

type DatePickerProps = {
  selected: Date | undefined
  onSelect: (date: Date | undefined) => void
  placeholder?: string
  /**
   * Which days are non-selectable. Default: only dates before 1900 (a sane
   * lower bound for the dropdown caption). Future dates are ALLOWED by default —
   * a generic date picker must serve "expected delivery date", "due date", etc.
   * Callers that want a past-only field (e.g. birthday) pass their own matcher,
   * e.g. `disabled={(d) => d > new Date()}`.
   */
  disabled?: (date: Date) => boolean
  /** Extra classes for the trigger button (e.g. full-width `w-full`). */
  className?: string
}

const MIN_DATE = new Date('1900-01-01')
const defaultDisabled = (date: Date) => date < MIN_DATE

export function DatePicker({
  selected,
  onSelect,
  placeholder = 'Pick a date',
  disabled = defaultDisabled,
  className,
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          data-empty={!selected}
          className={`data-[empty=true]:text-muted-foreground w-[240px] justify-start text-start font-normal ${className ?? ''}`}
        >
          {selected ? (
            format(selected, 'MMM d, yyyy')
          ) : (
            <span>{placeholder}</span>
          )}
          <CalendarIcon className='ms-auto h-4 w-4 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-auto p-0'>
        <Calendar
          mode='single'
          captionLayout='dropdown'
          selected={selected}
          onSelect={onSelect}
          disabled={disabled}
        />
      </PopoverContent>
    </Popover>
  )
}

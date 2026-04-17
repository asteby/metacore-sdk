import * as React from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './command'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Badge } from './badge'

export type Option = {
  label: string
  value: string
  icon?: React.ComponentType<{ className?: string }>
}

interface MultiSelectProps {
  options: Option[]
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  className?: string
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Select options...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No item found.',
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)

  const handleUnselect = (item: string) => {
    onChange(selected.filter((i) => i !== item))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role='combobox'
          aria-expanded={open}
          className={cn(
            'flex w-full justify-between items-center rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer hover:bg-accent hover:text-accent-foreground',
            'h-auto min-h-10',
            className
          )}
          onClick={() => setOpen(!open)}
        >
          <div className='flex flex-wrap gap-1'>
            {selected.length > 0 ? (
              selected.map((itemValue) => {
                const item = options.find((i) => i.value === itemValue)
                if (!item) return null
                return (
                  <Badge
                    variant='secondary'
                    key={item.value}
                    className='mr-1 mb-1'
                    onClick={(e) => {
                      e.stopPropagation()
                      handleUnselect(itemValue)
                    }}
                  >
                    {item.icon && <item.icon className='mr-1 h-3 w-3' />}
                    {item.label}
                    <button
                      className='ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleUnselect(itemValue)
                        }
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleUnselect(itemValue)
                      }}
                    >
                      <X className='h-3 w-3 text-muted-foreground hover:text-foreground' />
                    </button>
                  </Badge>
                )
              })
            ) : (
              <span className='text-muted-foreground font-normal'>
                {placeholder}
              </span>
            )}
          </div>
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </div>
      </PopoverTrigger>
      <PopoverContent className='w-full p-0'>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandEmpty>{emptyMessage}</CommandEmpty>
          <CommandList>
            <CommandGroup className='max-h-64 overflow-auto'>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  onSelect={() => {
                    if (selected.includes(option.value)) {
                      onChange(
                        selected.filter((item) => item !== option.value)
                      )
                    } else {
                      onChange([...selected, option.value])
                    }
                    setOpen(true)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selected.includes(option.value)
                        ? 'opacity-100'
                        : 'opacity-0'
                    )}
                  />
                  {option.icon && <option.icon className='mr-2 h-4 w-4' />}
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

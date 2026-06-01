// DynamicDateField — modern date picker for declarative forms: a shadcn
// Calendar inside a Popover, instead of the native `<input type="date">` whose
// browser calendar looks dated and gets clipped inside a modal.
//
// Contract: the field VALUE stays an ISO date string ("YYYY-MM-DD") so the form
// payload is unchanged (the kernel/handlers already expect that). We parse the
// string to a Date for the Calendar and format back to ISO on select. The
// Popover portals to the document body, so the calendar is never clipped by the
// modal's overflow — fixing the "se corta" cut-off.
//
// Deliberately NOT reusing metacore-ui's `DatePicker` shared helper: that one
// hard-disables future dates and pins a fixed 240px width, neither of which is
// right for a generic declarative field (a journal entry can be post-dated).
import { useState } from 'react'
import {
    Button,
    Calendar,
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@asteby/metacore-ui/primitives'
import { CalendarIcon } from 'lucide-react'
import type { ActionFieldDef } from './types'

export interface DynamicDateFieldProps {
    field: ActionFieldDef
    value: any
    onChange: (v: any) => void
}

// Parse "YYYY-MM-DD" (or any Date-parseable string) into a local Date, or
// undefined when empty/invalid. Uses noon to dodge timezone day-shift.
function toDate(v: any): Date | undefined {
    if (!v) return undefined
    const s = String(v)
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
    const d = new Date(s)
    return isNaN(d.getTime()) ? undefined : d
}

// Format a Date back to "YYYY-MM-DD" (local, no timezone shift).
function toISO(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

// Human label for the trigger. Locale-aware, falls back to the raw ISO.
function label(d: Date | undefined): string {
    if (!d) return ''
    try {
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
        return toISO(d)
    }
}

export function DynamicDateField({ field, value, onChange }: DynamicDateFieldProps) {
    const [open, setOpen] = useState(false)
    const selected = toDate(value)

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    id={field.key}
                    data-empty={!selected}
                    className="w-full justify-start text-start font-normal data-[empty=true]:text-muted-foreground"
                >
                    <CalendarIcon className="mr-2 size-4 shrink-0 opacity-50" />
                    <span className="truncate">
                        {selected ? label(selected) : (field.placeholder || 'Elegí una fecha')}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    captionLayout="dropdown"
                    selected={selected}
                    defaultMonth={selected}
                    onSelect={(d: Date | undefined) => {
                        onChange(d ? toISO(d) : '')
                        setOpen(false)
                    }}
                />
            </PopoverContent>
        </Popover>
    )
}

export default DynamicDateField

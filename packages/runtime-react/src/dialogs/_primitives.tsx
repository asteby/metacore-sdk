// Minimal local primitives used by the dialogs copied into runtime-react.
// These are intentionally dependency-free shims — hosts that want richer
// visuals (date picker calendar, radix progress, radix radio-group) should
// override by wrapping these components. The UI package does not currently
// export these three primitives so we keep them inside the runtime.
import * as React from 'react'

// ── Progress ────────────────────────────────────────────────────────────────
export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
    value?: number
}

export function Progress({ value = 0, className = '', ...props }: ProgressProps) {
    const pct = Math.max(0, Math.min(100, value))
    return (
        <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            className={`relative h-2 w-full overflow-hidden rounded-full bg-secondary ${className}`}
            {...props}
        >
            <div
                className="h-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
            />
        </div>
    )
}

// ── RadioGroup ──────────────────────────────────────────────────────────────
interface RadioGroupContextValue {
    value: string
    onChange: (value: string) => void
    name: string
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null)

export interface RadioGroupProps {
    value: string
    onValueChange: (value: string) => void
    className?: string
    children: React.ReactNode
    name?: string
}

export function RadioGroup({ value, onValueChange, className = '', children, name = 'radio-group' }: RadioGroupProps) {
    return (
        <RadioGroupContext.Provider value={{ value, onChange: onValueChange, name }}>
            <div role="radiogroup" className={className}>{children}</div>
        </RadioGroupContext.Provider>
    )
}

export interface RadioGroupItemProps {
    value: string
    id?: string
    className?: string
    disabled?: boolean
}

export function RadioGroupItem({ value, id, className = '', disabled }: RadioGroupItemProps) {
    const ctx = React.useContext(RadioGroupContext)
    if (!ctx) throw new Error('RadioGroupItem must be used inside <RadioGroup>')
    const checked = ctx.value === value
    return (
        <input
            type="radio"
            id={id}
            name={ctx.name}
            value={value}
            checked={checked}
            disabled={disabled}
            onChange={() => ctx.onChange(value)}
            className={`h-4 w-4 border-primary text-primary ${className}`}
        />
    )
}

// ── Calendar (minimal) ──────────────────────────────────────────────────────
// We expose a tiny date-input based Calendar so the record-dialog still
// renders when no host-provided calendar is available. Hosts wanting a full
// calendar grid can pass their own via the `calendar` prop on DynamicTable
// (not wired here) or wrap the dialog. For the build to succeed, this shim
// is sufficient.
export interface CalendarProps {
    mode?: 'single'
    selected?: Date
    onSelect?: (date: Date | undefined) => void
    locale?: any
    className?: string
}

export function Calendar({ selected, onSelect, className = '' }: CalendarProps) {
    const value = selected && !isNaN(selected.getTime())
        ? selected.toISOString().slice(0, 10)
        : ''
    return (
        <div className={`p-3 ${className}`}>
            <input
                type="date"
                value={value}
                onChange={(e) => {
                    const v = e.target.value
                    if (!v) { onSelect?.(undefined); return }
                    onSelect?.(new Date(v + 'T00:00:00'))
                }}
                className="w-full rounded-md border px-3 py-2 text-sm"
            />
        </div>
    )
}

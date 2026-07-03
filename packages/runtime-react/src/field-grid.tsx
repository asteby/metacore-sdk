// FieldGrid — the shared, responsive form layout for the SDK's declarative
// modals (the automatic CRUD create/edit dialog and the placement:create /
// generic action modal). One source of truth so both read identically: short
// scalar fields (inputs, selects, dates) flow in two columns when the width
// allows, textareas / line-items / long-form widgets span the full row, and
// everything collapses to a single column on phones.
//
// The load-bearing detail is `min-w-0` on every cell: CSS grid tracks default
// to `minmax(auto, 1fr)`, so a child with a wide intrinsic minimum (a Select
// with a long option, an Input with a long value) pushes its column past the
// container and the whole dialog grows a horizontal scrollbar. `min-w-0` lets
// the cell shrink below its content and keeps the modal within its width.
import type { ReactNode } from 'react'
import { Label } from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'

export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn('grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2', className)}>
            {children}
        </div>
    )
}

export function FieldCell({
    children,
    fullWidth,
    className,
}: {
    children: ReactNode
    /** Span both columns — textareas, line-items grids, embedded relations. */
    fullWidth?: boolean
    className?: string
}) {
    return (
        <div className={cn('flex min-w-0 flex-col gap-1.5', fullWidth && 'sm:col-span-2', className)}>
            {children}
        </div>
    )
}

export function FieldLabel({
    htmlFor,
    required,
    children,
}: {
    htmlFor?: string
    required?: boolean
    children: ReactNode
}) {
    return (
        <Label htmlFor={htmlFor} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {children}
            {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
    )
}

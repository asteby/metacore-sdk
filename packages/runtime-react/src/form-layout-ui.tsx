// Presentational chrome for declarative form layouts (see `form-layout.ts`).
// Kept apart from the grouping logic so the pure helper stays React-free and the
// two renderers (`dynamic-form.tsx`, `dialogs/dynamic-record.tsx`) share one
// look for sections and the wizard progress bar.
import { useState } from 'react'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
    Button,
} from '@asteby/metacore-ui/primitives'
import { ChevronDown } from 'lucide-react'
import type { FieldGroup } from './form-layout'

/**
 * Section chrome for `mode: "sections"`. Wraps a group's (already gridded)
 * fields in a titled block.
 *  - The default/orphan group renders with NO chrome, so a layout-less form (one
 *    default group) is visually identical to the legacy flat list.
 *  - A section whose `collapsed` is defined (true/false) is rendered COLLAPSIBLE,
 *    starting collapsed when `collapsed === true`. A section with no `collapsed`
 *    flag renders as a plain, always-open titled block.
 */
export function FieldSection({
    group,
    children,
}: {
    group: FieldGroup<unknown>
    children: React.ReactNode
}) {
    const collapsible = group.collapsed !== undefined
    const [open, setOpen] = useState(!group.collapsed)

    if (group.isDefault) return <>{children}</>

    const header = (
        <div className="min-w-0 text-left">
            {group.title && (
                <h3 className="text-sm font-semibold leading-none">{group.title}</h3>
            )}
            {group.description && (
                <p className="pt-1 text-sm text-muted-foreground">{group.description}</p>
            )}
        </div>
    )

    if (!collapsible) {
        return (
            <section className="grid gap-3">
                {(group.title || group.description) && header}
                {children}
            </section>
        )
    }

    return (
        <Collapsible open={open} onOpenChange={setOpen} className="grid gap-3">
            <CollapsibleTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-between px-0 py-1 hover:bg-transparent"
                >
                    {header}
                    <ChevronDown
                        className={
                            'h-4 w-4 shrink-0 transition-transform ' + (open ? 'rotate-180' : '')
                        }
                    />
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-3">{children}</CollapsibleContent>
        </Collapsible>
    )
}

/**
 * Progress bar for `mode: "steps"`: one filled segment per completed/current
 * step plus a "Paso i/n · <title>" caption. Mirrors the WizardActionModal look
 * so a model wizard and an action wizard read the same.
 */
export function WizardProgress({
    groups,
    stepIndex,
    stepLabel = 'Paso',
}: {
    groups: FieldGroup<unknown>[]
    stepIndex: number
    stepLabel?: string
}) {
    const current = groups[stepIndex]
    return (
        <div className="pt-2">
            <div className="flex items-center gap-1.5" role="list" aria-label="progress">
                {groups.map((g, i) => (
                    <div
                        key={g.key}
                        role="listitem"
                        aria-current={i === stepIndex ? 'step' : undefined}
                        className="h-1.5 flex-1 rounded-full"
                        style={{
                            backgroundColor:
                                i <= stepIndex ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                        }}
                    />
                ))}
            </div>
            <p className="pt-2 text-sm text-muted-foreground">
                {stepLabel} {stepIndex + 1}/{groups.length}
                {current?.title ? ` · ${current.title}` : ''}
            </p>
            {current?.description && (
                <p className="pt-1 text-sm text-muted-foreground">{current.description}</p>
            )}
        </div>
    )
}

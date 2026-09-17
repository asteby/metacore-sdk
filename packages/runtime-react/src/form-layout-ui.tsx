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
import { ProcessStepper } from '@asteby/metacore-ui/wizard'
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
 * Step indicator for `mode: "steps"`: the platform's ProcessStepper (numbered
 * circles with a check when done, label underneath, connectors) plus a
 * "Paso i/n · <title>" caption and the step's description. Same component the
 * process modals (workshop, warehouse) use, so a model wizard, an action wizard
 * and a process modal read the same.
 */
export function WizardProgress({
    groups,
    stepIndex,
    stepLabel = 'Paso',
    onStepClick,
}: {
    groups: FieldGroup<unknown>[]
    stepIndex: number
    stepLabel?: string
    /** Jump back to an already completed step (forward jumps are never offered). */
    onStepClick?: (index: number) => void
}) {
    const current = groups[stepIndex]
    const steps = groups.map((g, i) => ({ key: g.key, label: g.title ?? `${stepLabel} ${i + 1}` }))
    return (
        <div className="pt-1">
            <ProcessStepper steps={steps} activeIndex={stepIndex} onStepClick={onStepClick} />
            <p className="pt-3 text-sm text-muted-foreground">
                {stepLabel} {stepIndex + 1}/{groups.length}
                {current?.title ? ` · ${current.title}` : ''}
            </p>
            {current?.description && (
                <p className="pt-1 text-sm text-muted-foreground">{current.description}</p>
            )}
        </div>
    )
}

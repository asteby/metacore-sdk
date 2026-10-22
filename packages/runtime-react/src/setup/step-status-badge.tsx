import { AlertTriangle, Circle, CheckCircle2, Loader2, Lock, XCircle } from 'lucide-react'
import { cn } from '@asteby/metacore-ui/lib'
import { useSetupT } from './messages'
import { STEP_TONE, TONE_BADGE } from './tone'
import type { StepStatus } from './types'

const ICONS = {
    pending: Circle,
    running: Loader2,
    ok: CheckCircle2,
    warn: AlertTriangle,
    error: XCircle,
    blocked: Lock,
} as const

export interface StepStatusBadgeProps {
    status: StepStatus
    /** Overrides the localized label. */
    label?: string
    /** Icon only (the label stays available to screen readers). */
    compact?: boolean
    className?: string
}

/** Pill with icon + text for a step status; the text is always present for a11y. */
export function StepStatusBadge({ status, label, compact, className }: StepStatusBadgeProps) {
    const t = useSetupT()
    const known = status in ICONS ? status : 'pending'
    const Icon = ICONS[known]
    const text = label ?? t(`status.${known}`)
    return (
        <span
            data-status={known}
            className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                TONE_BADGE[STEP_TONE[known]],
                className,
            )}
        >
            <Icon
                aria-hidden='true'
                className={cn('h-3.5 w-3.5 shrink-0', known === 'running' && 'animate-spin motion-reduce:animate-none')}
            />
            <span className={cn(compact && 'sr-only')}>{text}</span>
        </span>
    )
}

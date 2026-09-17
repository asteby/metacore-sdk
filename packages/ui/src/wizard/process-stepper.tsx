import { Fragment } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ProcessStepDef = {
  /** Stable key for React lists. */
  key: string
  label: React.ReactNode
  /** Icon for upcoming / active steps; without one the step number is shown. */
  icon?: LucideIcon
}

export type ProcessStepperProps = {
  steps: readonly ProcessStepDef[]
  /** 0-based index of the current step. */
  activeIndex: number
  /** Called when a completed step's circle is clicked (backwards navigation). */
  onStepClick?: (index: number) => void
  className?: string
  /** aria-label for the <nav>. */
  label?: string
}

/**
 * ProcessStepper — the floating, centered multi-step indicator used by process
 * modals (warehouse dispatch, workshop process, declarative `form_layout`
 * wizards…): a ring-highlighted circle per step (icon or number, check when
 * done) with its label underneath and `flex-1` connectors, so fewer steps get
 * longer lines and many steps still fit.
 *
 * One implementation for the whole platform — import from
 * `@asteby/metacore-ui/wizard`; never fork copies into apps or addons.
 */
export function ProcessStepper({
  steps,
  activeIndex,
  onStepClick,
  className,
  label = 'Progreso',
}: ProcessStepperProps) {
  const n = steps.length
  const idx = Math.max(0, Math.min(activeIndex, Math.max(n - 1, 0)))
  // Narrower step columns when there are many steps so connectors still show.
  const circleCol =
    n <= 3 ? 'w-[4.25rem] sm:w-[4.75rem]' : n === 4 ? 'w-14 sm:w-16' : 'w-12 sm:w-14'

  return (
    <nav aria-label={label} className={cn('w-full px-1 pt-1', className)}>
      <ol className='flex w-full items-start justify-center'>
        {steps.map((s, i) => {
          const done = i < idx
          const active = i === idx
          const Icon = s.icon
          const isLast = i === n - 1
          const clickable = done && !!onStepClick
          const circle = (
            <span
              className={cn(
                'relative z-[1] flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-all duration-300',
                done && 'bg-primary text-primary-foreground shadow-sm shadow-primary/25',
                active &&
                  'scale-105 bg-primary text-primary-foreground shadow-md shadow-primary/30 ring-4 ring-primary/20',
                !done && !active && 'bg-background text-muted-foreground ring-1 ring-border/80'
              )}
              aria-current={active ? 'step' : undefined}
            >
              {done ? (
                <CheckIcon className='h-4 w-4' strokeWidth={2.5} />
              ) : Icon ? (
                <Icon
                  className={cn('h-4 w-4', active && 'animate-[pulse_2.4s_ease-in-out_infinite]')}
                  strokeWidth={active ? 2.25 : 1.75}
                />
              ) : (
                i + 1
              )}
            </span>
          )

          return (
            <Fragment key={s.key}>
              <li className={cn('flex shrink-0 flex-col items-center gap-1.5', circleCol)}>
                {clickable ? (
                  <button
                    type='button'
                    onClick={() => onStepClick?.(i)}
                    className='cursor-pointer rounded-full'
                    aria-label={typeof s.label === 'string' ? s.label : undefined}
                  >
                    {circle}
                  </button>
                ) : (
                  circle
                )}
                <span
                  className={cn(
                    'line-clamp-2 max-w-full break-words text-center text-[11px] leading-tight sm:text-xs',
                    active
                      ? 'font-semibold text-foreground'
                      : done
                        ? 'font-medium text-foreground/80'
                        : 'font-normal text-muted-foreground'
                  )}
                >
                  {s.label}
                </span>
              </li>
              {!isLast ? (
                <li
                  className='mx-1 flex h-9 min-w-[1.25rem] flex-1 list-none items-center self-start sm:mx-2'
                  aria-hidden
                >
                  <div
                    className={cn(
                      'h-0.5 w-full rounded-full transition-colors duration-500',
                      i < idx ? 'bg-primary' : 'bg-border'
                    )}
                  />
                </li>
              ) : null}
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}

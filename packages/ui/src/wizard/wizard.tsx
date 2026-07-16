import * as React from 'react'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/primitives/button'
import {
  WizardProvider,
  useWizard,
  type WizardProviderProps,
} from './wizard-context'

/**
 * Wizard — headless multi-step ("por step") orchestrator plus a default
 * stepper/footer UI. Steps are declared once; navigation, per-step guards and
 * completion state live in context via {@link useWizard}.
 *
 * Compose the pieces yourself, or use `<Wizard>` as a provider and drop in
 * `<WizardStepper>`, your step bodies, and `<WizardFooter>`.
 *
 * @example
 * <Wizard steps={steps} guard={validateCurrentStep} onComplete={submit}>
 *   <WizardStepper />
 *   <WizardBody />
 *   <WizardFooter />
 * </Wizard>
 */
export function Wizard(props: WizardProviderProps) {
  return <WizardProvider {...props} />
}

/** Horizontal step indicator with complete / current / upcoming states. */
export function WizardStepper({ className }: { className?: string }) {
  const { steps, index, completed, goTo } = useWizard()

  return (
    <ol className={cn('flex w-full items-center gap-2', className)}>
      {steps.map((step, i) => {
        const isComplete = completed.has(i) && i !== index
        const isCurrent = i === index
        const reachable = isComplete || i < index
        return (
          <li key={step.id} className='flex flex-1 items-center gap-2'>
            <button
              type='button'
              disabled={!reachable}
              onClick={() => reachable && goTo(i, true)}
              aria-current={isCurrent ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 text-start',
                reachable ? 'cursor-pointer' : 'cursor-default'
              )}
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors',
                  isCurrent && 'border-primary bg-primary text-primary-foreground',
                  isComplete && 'border-primary bg-primary/10 text-primary',
                  !isCurrent && !isComplete && 'border-input text-muted-foreground'
                )}
              >
                {isComplete ? <CheckIcon className='size-4' /> : i + 1}
              </span>
              <span className='hidden flex-col sm:flex'>
                <span
                  className={cn(
                    'text-sm leading-none font-medium',
                    !isCurrent && !isComplete && 'text-muted-foreground'
                  )}
                >
                  {step.title}
                </span>
                {step.description ? (
                  <span className='text-muted-foreground text-xs'>
                    {step.description}
                  </span>
                ) : null}
              </span>
            </button>
            {i < steps.length - 1 ? (
              <span
                className={cn(
                  'h-px flex-1',
                  i < index ? 'bg-primary' : 'bg-border'
                )}
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Renders the child at the active step index. Pass one child per step, in the
 * same order as `steps`.
 */
export function WizardBody({ children }: { children: React.ReactNode }) {
  const { index } = useWizard()
  const items = React.Children.toArray(children)
  return <>{items[index] ?? null}</>
}

export type WizardFooterProps = {
  /** Label for the advance button on non-final steps. */
  nextText?: React.ReactNode
  backText?: React.ReactNode
  /** Label for the advance button on the final step. */
  finishText?: React.ReactNode
  /** Disable advancing (e.g. invalid step) without blocking Back. */
  nextDisabled?: boolean
  /** Busy state for async guards/submission. */
  isBusy?: boolean
  className?: string
}

/** Back / Next(Finish) controls bound to the enclosing wizard. */
export function WizardFooter({
  nextText,
  backText,
  finishText,
  nextDisabled,
  isBusy,
  className,
}: WizardFooterProps) {
  const { isFirst, isLast, next, back } = useWizard()
  const [pending, setPending] = React.useState(false)
  const busy = isBusy || pending

  const advance = async () => {
    setPending(true)
    try {
      await next()
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <Button
        type='button'
        variant='outline'
        onClick={back}
        disabled={isFirst || busy}
      >
        {backText ?? 'Back'}
      </Button>
      <Button
        type='button'
        onClick={advance}
        disabled={nextDisabled || busy}
      >
        {isLast ? (finishText ?? 'Finish') : (nextText ?? 'Next')}
      </Button>
    </div>
  )
}

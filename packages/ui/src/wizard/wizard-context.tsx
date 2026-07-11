import * as React from 'react'

export type WizardStepDef = {
  /** Stable id for the step. */
  id: string
  /** Short label shown in the stepper. */
  title: React.ReactNode
  /** Optional supporting text. */
  description?: React.ReactNode
  /** Optional step may be skipped by navigation helpers. */
  optional?: boolean
}

export type WizardContextValue = {
  steps: WizardStepDef[]
  /** Zero-based index of the active step. */
  index: number
  current: WizardStepDef
  isFirst: boolean
  isLast: boolean
  /** Steps the user has advanced past (marked complete). */
  completed: Set<number>
  /** Advance one step; runs the step guard first if provided. */
  next: () => Promise<boolean>
  /** Go back one step. No-op on the first step. */
  back: () => void
  /**
   * Jump to a step by index or id. Forward jumps run intermediate guards
   * unless `force` is set.
   */
  goTo: (target: number | string, force?: boolean) => Promise<boolean>
  /** Reset to the first step and clear completion. */
  reset: () => void
}

const WizardContext = React.createContext<WizardContextValue | null>(null)

/** Access the enclosing wizard. Throws if used outside a `<Wizard>`. */
export function useWizard(): WizardContextValue {
  const ctx = React.useContext(WizardContext)
  if (!ctx) throw new Error('useWizard must be used within a <Wizard>')
  return ctx
}

/**
 * A per-step guard. Return false (or a rejected/false promise) to block
 * advancing past the step — e.g. run form validation here.
 */
export type WizardGuard = (fromIndex: number, toIndex: number) => boolean | Promise<boolean>

export type WizardProviderProps = {
  steps: WizardStepDef[]
  /** Uncontrolled starting index. Defaults to 0. */
  defaultIndex?: number
  /** Controlled active index. */
  index?: number
  onIndexChange?: (index: number) => void
  /** Guard invoked before every forward transition. */
  guard?: WizardGuard
  /** Fired when the last step is completed via `next()`. */
  onComplete?: () => void
  children: React.ReactNode
}

function resolveTarget(
  target: number | string,
  steps: WizardStepDef[]
): number {
  if (typeof target === 'number') return target
  return steps.findIndex((s) => s.id === target)
}

export function WizardProvider({
  steps,
  defaultIndex = 0,
  index: controlledIndex,
  onIndexChange,
  guard,
  onComplete,
  children,
}: WizardProviderProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultIndex)
  const isControlled = controlledIndex != null
  const index = isControlled ? controlledIndex : uncontrolled
  const [completed, setCompleted] = React.useState<Set<number>>(() => new Set())

  const setIndex = React.useCallback(
    (next: number) => {
      if (!isControlled) setUncontrolled(next)
      onIndexChange?.(next)
    },
    [isControlled, onIndexChange]
  )

  const runGuard = React.useCallback(
    async (from: number, to: number) => {
      if (to <= from || !guard) return true
      try {
        return await guard(from, to)
      } catch {
        return false
      }
    },
    [guard]
  )

  const goTo = React.useCallback(
    async (target: number | string, force = false) => {
      const to = resolveTarget(target, steps)
      if (to < 0 || to >= steps.length || to === index) return false
      if (!force && !(await runGuard(index, to))) return false
      if (to > index) {
        setCompleted((prev) => {
          const nextSet = new Set(prev)
          for (let i = index; i < to; i++) nextSet.add(i)
          return nextSet
        })
      }
      setIndex(to)
      return true
    },
    [index, steps, runGuard, setIndex]
  )

  const next = React.useCallback(async () => {
    const to = index + 1
    if (!(await runGuard(index, to))) return false
    setCompleted((prev) => new Set(prev).add(index))
    if (to >= steps.length) {
      onComplete?.()
      return true
    }
    setIndex(to)
    return true
  }, [index, steps.length, runGuard, setIndex, onComplete])

  const back = React.useCallback(() => {
    if (index > 0) setIndex(index - 1)
  }, [index, setIndex])

  const reset = React.useCallback(() => {
    setCompleted(new Set())
    setIndex(defaultIndex)
  }, [defaultIndex, setIndex])

  const value = React.useMemo<WizardContextValue>(
    () => ({
      steps,
      index,
      current: steps[index]!,
      isFirst: index === 0,
      isLast: index === steps.length - 1,
      completed,
      next,
      back,
      goTo,
      reset,
    }),
    [steps, index, completed, next, back, goTo, reset]
  )

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>
}

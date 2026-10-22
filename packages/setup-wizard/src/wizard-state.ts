export type StepStatus = 'pending' | 'running' | 'ok' | 'error'

export interface StepState {
  status: StepStatus
  diagnostic?: string
  attempts: number
}

export interface WizardState {
  current: number
  steps: Record<string, StepState>
}

export type WizardAction =
  | { type: 'start'; id: string }
  | { type: 'progress'; id: string; diagnostic?: string; attempts?: number }
  | { type: 'finish'; id: string; status: 'ok' | 'error'; diagnostic?: string }
  | { type: 'goto'; index: number }
  | { type: 'hydrate'; state: WizardState }
  | { type: 'reset'; ids: string[] }

export const initialWizardState = (ids: string[]): WizardState => ({
  current: 0,
  steps: Object.fromEntries(ids.map((id) => [id, { status: 'pending', attempts: 0 } satisfies StepState])),
})

export function wizardReducer(state: WizardState, a: WizardAction): WizardState {
  switch (a.type) {
    case 'start':
      return { ...state, steps: { ...state.steps, [a.id]: { status: 'running', attempts: 0 } } }
    case 'progress': {
      const prev = state.steps[a.id]
      if (!prev) return state
      return { ...state, steps: { ...state.steps, [a.id]: { ...prev, diagnostic: a.diagnostic, attempts: a.attempts ?? prev.attempts } } }
    }
    case 'finish': {
      const prev = state.steps[a.id]
      return { ...state, steps: { ...state.steps, [a.id]: { status: a.status, diagnostic: a.diagnostic, attempts: prev?.attempts ?? 0 } } }
    }
    case 'goto':
      return { ...state, current: Math.max(0, Math.min(Object.keys(state.steps).length - 1, a.index)) }
    case 'hydrate':
      return a.state
    case 'reset':
      return initialWizardState(a.ids)
  }
}

/**
 * Makes a persisted state safe to resume: unknown ids are dropped, new steps
 * start pending, and anything that was mid-flight ("running") goes back to
 * pending because the work that backed it died with the previous page.
 */
export function sanitizeResume(saved: unknown, ids: string[]): WizardState {
  const base = initialWizardState(ids)
  if (!saved || typeof saved !== 'object') return base
  const s = saved as Partial<WizardState>
  const steps = { ...base.steps }
  for (const id of ids) {
    const st = s.steps?.[id]
    if (!st || typeof st !== 'object') continue
    const status = st.status === 'ok' || st.status === 'error' ? st.status : 'pending'
    steps[id] = { status, diagnostic: typeof st.diagnostic === 'string' ? st.diagnostic : undefined, attempts: 0 }
  }
  const cur = typeof s.current === 'number' ? s.current : 0
  return { current: Math.max(0, Math.min(ids.length - 1, cur)), steps }
}

/** Persistence adapter for resumable wizards. */
export interface WizardPersistence {
  load(key: string): unknown | Promise<unknown>
  save(key: string, state: WizardState): void | Promise<void>
  remove?(key: string): void | Promise<void>
}

export function createLocalWizardPersistence(prefix = 'metacore.wizard:'): WizardPersistence {
  const ls = () => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage
    } catch {
      return null
    }
  }
  return {
    load: (k) => {
      try {
        const raw = ls()?.getItem(prefix + k)
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    },
    save: (k, s) => {
      try {
        ls()?.setItem(prefix + k, JSON.stringify(s))
      } catch {
        /* best effort */
      }
    },
    remove: (k) => {
      try {
        ls()?.removeItem(prefix + k)
      } catch {
        /* ignore */
      }
    },
  }
}

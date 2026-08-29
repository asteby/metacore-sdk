/**
 * Cross-bundle lock for sibling Dialogs opened from a dynamic_select "+" inline
 * create (host RecordCreateBridge + federated action modal parent). Module-level
 * state is not shared between MF remotes; window depth is.
 */
const DEPTH_KEY = '__metacore_nested_inline_create_depth__'

export function nestedInlineCreateDepth(): number {
  if (typeof globalThis.window === 'undefined') return 0
  const n = Number((globalThis as Record<string, unknown>)[DEPTH_KEY] ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function setNestedInlineCreateDepth(n: number): void {
  if (typeof globalThis.window === 'undefined') return
  ;(globalThis as Record<string, unknown>)[DEPTH_KEY] = Math.max(0, n)
}

/** True while an inline-create dialog (Employee, Category, …) is open. */
export function isNestedInlineCreateOpen(): boolean {
  return nestedInlineCreateDepth() > 0
}

/** Increment depth; returned function decrements (use in useEffect cleanup). */
export function pushNestedInlineCreate(): () => void {
  setNestedInlineCreateDepth(nestedInlineCreateDepth() + 1)
  return () => setNestedInlineCreateDepth(nestedInlineCreateDepth() - 1)
}

/** Block Radix outside/focus dismiss on parent dialogs while inline create is open. */
export function guardNestedInlineCreateDismiss(e: Event): void {
  if (isNestedInlineCreateOpen()) e.preventDefault()
}

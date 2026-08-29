/**
 * Cross-bundle lock for sibling Dialogs opened from a dynamic_select "+" inline
 * create (host RecordCreateBridge + federated action modal parent). Module-level
 * state is not shared between MF remotes; window depth is.
 */
const DEPTH_KEY = '__metacore_nested_inline_create_depth__'

/** Fired on window whenever the depth changes, so every bundle's Dialogs can
 * react (useSyncExternalStore) — module-level emitters don't cross remotes. */
export const NESTED_INLINE_CREATE_EVENT = 'metacore:nested-inline-create-depth'

function emitDepthChange(): void {
  if (typeof globalThis.window === 'undefined') return
  globalThis.window.dispatchEvent(new Event(NESTED_INLINE_CREATE_EVENT))
}

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

// ── Surgical focus-trap release ──────────────────────────────────────────────
//
// Radix FocusScope (the parent modal's trap) registers bubble-phase focusin/
// focusout handlers on `document` and yanks focus back whenever it moves to
// an element outside its container — which is exactly what the sibling
// inline-create dialog is when it lives in ANOTHER MF bundle's React tree.
// Instead of demodalizing the parent (2.17.1 — lost the overlay, dropped the
// pointer/scroll locks, and REMOUNTED the content swapping Radix's modal/
// non-modal content components), we install CAPTURE-phase listeners on
// `document` while an inline create is open: any focus event whose target
// (focusin) / relatedTarget (focusout) sits inside the create dialog
// ([data-nested-inline-create], stamped by DialogContent) is stopped with
// stopImmediatePropagation() BEFORE the parent's bubble-phase trap sees it.
// The parent keeps overlay, locks and modality; the child keeps focus.
//
// Installed once per page (flag on globalThis — module state doesn't cross
// MF bundles) and removed when depth returns to 0.
const GUARD_KEY = '__metacore_nested_inline_create_focus_guard__'

// The create dialog's own floating layers — Select dropdowns, date-picker
// popovers, comboboxes — PORTAL to <body> inside Radix's popper wrapper, so
// they are NOT descendants of [data-nested-inline-create]. Without covering
// them, opening a select/calendar inside "Crear" moved focus "outside" the
// marked container, the parent modal's trap yanked it back, and the popover
// closed on the spot (dates unpickable, selects flashing shut). While the
// depth lock is held, any popper-portaled layer belongs to the create flow —
// the parent is inert behind its overlay and opens no popovers of its own.
const NESTED_SAFE_SELECTOR =
  '[data-nested-inline-create], [data-radix-popper-content-wrapper], [data-radix-select-viewport], [role="listbox"]'

function insideNestedCreate(node: unknown): boolean {
  return Boolean(
    node &&
      typeof (node as Element).closest === 'function' &&
      (node as Element).closest(NESTED_SAFE_SELECTOR),
  )
}

function onFocusInCapture(e: FocusEvent): void {
  if (insideNestedCreate(e.target)) e.stopImmediatePropagation()
}

function onFocusOutCapture(e: FocusEvent): void {
  if (insideNestedCreate(e.relatedTarget)) e.stopImmediatePropagation()
}

function installFocusGuard(): void {
  const g = globalThis as Record<string, unknown>
  if (typeof g.document === 'undefined' || g[GUARD_KEY]) return
  g[GUARD_KEY] = true
  document.addEventListener('focusin', onFocusInCapture, true)
  document.addEventListener('focusout', onFocusOutCapture, true)
}

function removeFocusGuard(): void {
  const g = globalThis as Record<string, unknown>
  if (typeof g.document === 'undefined' || !g[GUARD_KEY]) return
  delete g[GUARD_KEY]
  document.removeEventListener('focusin', onFocusInCapture, true)
  document.removeEventListener('focusout', onFocusOutCapture, true)
}

/** Increment depth; returned function decrements (use in useEffect cleanup). */
export function pushNestedInlineCreate(): () => void {
  const next = nestedInlineCreateDepth() + 1
  setNestedInlineCreateDepth(next)
  if (next === 1) installFocusGuard()
  emitDepthChange()
  return () => {
    setNestedInlineCreateDepth(nestedInlineCreateDepth() - 1)
    if (nestedInlineCreateDepth() === 0) removeFocusGuard()
    emitDepthChange()
  }
}

/** Subscribe to depth changes (for useSyncExternalStore). */
export function subscribeNestedInlineCreate(cb: () => void): () => void {
  if (typeof globalThis.window === 'undefined') return () => {}
  globalThis.window.addEventListener(NESTED_INLINE_CREATE_EVENT, cb)
  return () => globalThis.window.removeEventListener(NESTED_INLINE_CREATE_EVENT, cb)
}

/** Block Radix outside/focus dismiss on parent dialogs while inline create is open. */
export function guardNestedInlineCreateDismiss(e: Event): void {
  if (isNestedInlineCreateOpen()) e.preventDefault()
}

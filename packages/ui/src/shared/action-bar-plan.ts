import type * as React from 'react'

/**
 * One action for `ActionBar` (and, in S-4, the output of `useActionItems`).
 *
 * Rules the bar enforces:
 * - Only one `primary` is rendered as primary; any later `primary` is demoted
 *   to `secondary` (same rule as `splitActionsByPriority`).
 * - `destructive` items never render inline: they go last in the overflow
 *   menu/sheet, after a divider, in the destructive colour, and ask for
 *   confirmation unless `confirm: false`.
 * - `overflow` items always live in the overflow menu.
 */
export interface ActionItem {
  key: string
  label: string
  /** Icon node (e.g. `<Printer />`). String icon names are resolved by adapters (runtime-react), not here. */
  icon?: React.ReactNode
  /** Default `secondary`. */
  priority?: 'primary' | 'secondary' | 'overflow'
  destructive?: boolean
  disabled?: boolean
  /** Why it is disabled. Implies `disabled`; shown as tooltip (desktop) or text (menu/sheet). */
  disabledReason?: string
  /** External busy flag. The bar also shows a spinner while `run`'s promise is pending. */
  loading?: boolean
  hidden?: boolean
  /**
   * Confirmation before `run`. Destructive items confirm by default with a
   * generic copy; pass an object to customise it or `false` when the host
   * already confirms on its own (e.g. a CRUD delete dialog).
   */
  confirm?: ActionConfirm | false
  run: () => void | Promise<unknown>
}

export interface ActionConfirm {
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
}

export interface ActionBarPlan {
  primary?: ActionItem
  /** Secondary actions rendered inline, in order. */
  inline: ActionItem[]
  /** Non-destructive actions in the overflow menu, in order. */
  overflow: ActionItem[]
  /** Destructive actions, always last in the overflow menu. */
  destructive: ActionItem[]
}

export interface PlanOptions {
  /** Upper bound of inline buttons, primary included. */
  maxVisible: number
  /** Width of the bar's box (px). Omit to plan by `maxVisible` only. */
  containerWidth?: number
  /** Natural width (px) of each rendered button, by `key`. */
  widths?: Record<string, number>
  /** Width (px) of the «⋯» trigger. */
  overflowTriggerWidth?: number
  /** Gap between buttons (px). */
  gap?: number
}

export function isDisabled(item: ActionItem): boolean {
  return Boolean(item.disabled || item.disabledReason)
}

export function needsConfirm(item: ActionItem): boolean {
  if (item.confirm === false) return false
  return Boolean(item.confirm) || Boolean(item.destructive)
}

/**
 * Splits `items` into primary / inline / overflow / destructive.
 *
 * Collapse order: inline secondaries leave from the end (the last declared
 * is the least important) until primary + inline + «⋯» fit in
 * `containerWidth`. The primary never collapses.
 */
export function planActionBar(items: ActionItem[], options: PlanOptions): ActionBarPlan {
  const { maxVisible, containerWidth, widths, overflowTriggerWidth = 0, gap = 8 } = options
  let primary: ActionItem | undefined
  const candidates: ActionItem[] = []
  const overflowOnly: ActionItem[] = []
  const destructive: ActionItem[] = []

  for (const item of items) {
    if (item.hidden) continue
    if (item.destructive) {
      destructive.push(item)
    } else if (item.priority === 'primary' && !primary) {
      primary = item
    } else if (item.priority === 'overflow') {
      overflowOnly.push(item)
    } else {
      candidates.push(item)
    }
  }

  const cap = Math.max(0, Math.floor(maxVisible) - (primary ? 1 : 0))
  const inline = candidates.slice(0, cap)
  const collapsed = candidates.slice(cap)

  if (containerWidth !== undefined && widths) {
    const width = (item: ActionItem) => widths[item.key] ?? 0
    const total = () => {
      const buttons = (primary ? [primary] : []).concat(inline)
      const hasMenu = collapsed.length + overflowOnly.length + destructive.length > 0
      const count = buttons.length + (hasMenu ? 1 : 0)
      const sum = buttons.reduce((acc, item) => acc + width(item), 0) + (hasMenu ? overflowTriggerWidth : 0)
      return sum + Math.max(0, count - 1) * gap
    }
    // +0.5 absorbs sub-pixel rounding between measurement and layout.
    while (inline.length > 0 && total() > containerWidth + 0.5) {
      collapsed.unshift(inline.pop() as ActionItem)
    }
  }

  return { primary, inline, overflow: collapsed.concat(overflowOnly), destructive }
}

export type MaxVisible = number | Partial<Record<'base' | 'sm' | 'md' | 'lg', number>>

/** Tailwind breakpoints (px), evaluated against the viewport. */
export const ACTION_BAR_BREAKPOINTS = { sm: 640, md: 768, lg: 1024 } as const

export const DEFAULT_MAX_VISIBLE: Readonly<Partial<Record<'base' | 'sm' | 'md' | 'lg', number>>> = { base: 2, md: 3, lg: 4 }

/** Resolves a responsive `maxVisible` for a viewport width (mobile-first, like Tailwind). */
export function resolveMaxVisible(value: MaxVisible | undefined, viewportWidth: number): number {
  const v = value ?? DEFAULT_MAX_VISIBLE
  if (typeof v === 'number') return v
  let result = v.base ?? DEFAULT_MAX_VISIBLE.base ?? 2
  for (const bp of ['sm', 'md', 'lg'] as const) {
    const n = v[bp]
    if (n !== undefined && viewportWidth >= ACTION_BAR_BREAKPOINTS[bp]) result = n
  }
  return result
}

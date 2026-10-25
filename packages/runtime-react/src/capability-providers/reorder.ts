// Pure reordering helpers for ProviderSortableList: no DOM, no React.

/** Move the item at `from` to index `to`; out-of-range or no-op returns the same array. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list.slice()
  const target = Math.max(0, Math.min(list.length - 1, to))
  if (target === from) return list.slice()
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(target, 0, item)
  return next
}

/** Move `id` by `delta` positions within `order` (ids not in `order` are ignored). */
export function moveId(order: readonly string[], id: string, delta: number): string[] {
  const from = order.indexOf(id)
  if (from < 0) return order.slice()
  return moveItem(order, from, from + delta)
}

/**
 * Index where a dragged item should land given the pointer position and the
 * vertical midpoints of the OTHER rows (document order): 0..midpoints.length.
 */
export function dropIndexFromPointer(pointerY: number, midpoints: readonly number[]): number {
  let idx = 0
  for (const mid of midpoints) if (pointerY > mid) idx++
  return idx
}

/**
 * Row virtualization defaults for DynamicTable.
 *
 * When the visible row model grows past the threshold (common in
 * `pagination="infinite"` as pages accumulate, or when the user picks a large
 * page size), we only mount the rows in the viewport via
 * `@tanstack/react-virtual`. Below the threshold we keep the simple map so
 * short tables stay trivial to debug.
 */
export const DYNAMIC_TABLE_VIRTUALIZE_THRESHOLD = 40

/** Estimated desktop table row height (py-2 + content). */
export const DYNAMIC_TABLE_ROW_ESTIMATE_PX = 44

/** Estimated mobile card height (padding + a few label/value rows). */
export const DYNAMIC_TABLE_CARD_ESTIMATE_PX = 120

export function resolveVirtualizeThreshold(
  virtualizeRows?: boolean | number,
): number | false {
  if (virtualizeRows === false) return false
  if (typeof virtualizeRows === 'number') {
    return virtualizeRows > 0 ? virtualizeRows : false
  }
  // true or undefined → default threshold
  return DYNAMIC_TABLE_VIRTUALIZE_THRESHOLD
}

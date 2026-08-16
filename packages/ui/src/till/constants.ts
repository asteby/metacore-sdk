/**
 * Shared widths for immersive till side panels (POS cart, purchases order,
 * cashier detail, refund preview). Keep defaults aligned across addons.
 */
export const SIDE_PANEL_MIN_WIDTH = 320
export const SIDE_PANEL_MAX_WIDTH = 640
export const SIDE_PANEL_DEFAULT_WIDTH = 380

export function clampSidePanelWidth(
  px: number,
  min = SIDE_PANEL_MIN_WIDTH,
  max = SIDE_PANEL_MAX_WIDTH,
  fallback = SIDE_PANEL_DEFAULT_WIDTH
): number {
  if (!Number.isFinite(px)) return fallback
  return Math.min(max, Math.max(min, px))
}

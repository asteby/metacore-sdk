/** Fallbacks when no theme paints `--touch-*` (mirror @asteby/metacore-theme/touch). */
export const TOUCH_DEFAULT_MIN_TARGET = 60
export const TOUCH_DEFAULT_FONT_SCALE = 1.25

export const TOUCH_MIN_TARGET_VAR = '--touch-min-target'
export const TOUCH_FONT_SCALE_VAR = '--touch-font-scale'

/** CSS length for the minimum target: explicit px override, else the theme var. */
export function touchMinTargetCss(minTarget?: number): string {
  return minTarget != null
    ? `${minTarget}px`
    : `var(${TOUCH_MIN_TARGET_VAR}, ${TOUCH_DEFAULT_MIN_TARGET}px)`
}

/** Font size scaled by the theme's `fontScale`. */
export function touchFontSizeCss(rem = 1): string {
  return `calc(${rem}rem * var(${TOUCH_FONT_SCALE_VAR}, ${TOUCH_DEFAULT_FONT_SCALE}))`
}

/**
 * Touch tokens — sizing contract for kiosks, customer displays and any
 * finger-driven surface. Brand-free: it carries no colors or fonts, only the
 * geometry that makes a control hittable.
 *
 * Shape of the extension on a theme pack (`ThemePack.tokens.touch`, see the
 * theme-pack contract in the editable-storefront plan):
 *
 *   { touch?: { minTarget?: number; fontScale?: number } }
 *
 * `resolveTouchTokens` fills and clamps it; `touchCssVars` / `touchCss` turn it
 * into the `--touch-*` custom properties that `@asteby/metacore-ui/touch`
 * reads (with the defaults below as fallback when nothing paints them).
 */

export interface TouchTokens {
  /** Minimum hit-target edge in CSS px. Keys and buttons never go below it. */
  minTarget: number
  /** Multiplier over the base font size (1 = unchanged). */
  fontScale: number
}

/** 60 px comfortably clears WCAG 2.5.5 (44) and gloved/fat-finger kiosk use. */
export const DEFAULT_TOUCH_TOKENS: Readonly<TouchTokens> = Object.freeze({
  minTarget: 60,
  fontScale: 1.25,
})

/** Hard bounds so a bad org setting cannot make a screen unusable. */
export const TOUCH_MIN_TARGET_RANGE = Object.freeze({ min: 44, max: 160 })
export const TOUCH_FONT_SCALE_RANGE = Object.freeze({ min: 0.75, max: 2 })

export const TOUCH_CSS_VARS = Object.freeze({
  minTarget: '--touch-min-target',
  fontScale: '--touch-font-scale',
})

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Merge a partial/untrusted `touch` block over the defaults, clamped. */
export function resolveTouchTokens(input?: Partial<TouchTokens> | null): TouchTokens {
  const r = TOUCH_MIN_TARGET_RANGE
  const f = TOUCH_FONT_SCALE_RANGE
  return {
    minTarget: clamp(
      finite(input?.minTarget) ? input.minTarget : DEFAULT_TOUCH_TOKENS.minTarget,
      r.min,
      r.max,
    ),
    fontScale: clamp(
      finite(input?.fontScale) ? input.fontScale : DEFAULT_TOUCH_TOKENS.fontScale,
      f.min,
      f.max,
    ),
  }
}

/** CSS custom properties for a style object / `element.style.setProperty`. */
export function touchCssVars(input?: Partial<TouchTokens> | null): Record<string, string> {
  const t = resolveTouchTokens(input)
  return {
    [TOUCH_CSS_VARS.minTarget]: `${t.minTarget}px`,
    [TOUCH_CSS_VARS.fontScale]: String(t.fontScale),
  }
}

/** A CSS rule string, e.g. for injecting next to the brand style tag. */
export function touchCss(input?: Partial<TouchTokens> | null, selector = ':root'): string {
  const body = Object.entries(touchCssVars(input))
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
  return `${selector}{${body}}`
}

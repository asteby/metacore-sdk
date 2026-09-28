/**
 * Runtime access to the theme's motion tokens (`--motion-duration-*`,
 * `--motion-ease-*` from @asteby/metacore-theme/tokens.css). Hosts that do
 * not ship those variables get the same defaults, so JS-driven animations
 * (WAAPI, dnd-kit) and CSS transitions stay on one scale.
 */
export type MotionDuration = 'instant' | 'fast' | 'moderate' | 'slow'
export type MotionEasing = 'standard' | 'emphasized' | 'exit'

export const MOTION_DEFAULTS = {
  duration: { instant: 100, fast: 150, moderate: 220, slow: 320 } as Record<MotionDuration, number>,
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.3, 0, 0, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
  } as Record<MotionEasing, string>,
}

function cssVar(name: string): string {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** True when the user asked the OS for reduced motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Duration token in ms (0 under prefers-reduced-motion). */
export function motionDuration(token: MotionDuration): number {
  if (prefersReducedMotion()) return 0
  const raw = cssVar(`--motion-duration-${token}`)
  if (raw) {
    const n = parseFloat(raw)
    if (Number.isFinite(n)) return raw.endsWith('ms') || !raw.endsWith('s') ? n : n * 1000
  }
  return MOTION_DEFAULTS.duration[token]
}

/** Easing token as a CSS timing function. */
export function motionEasing(token: MotionEasing): string {
  return cssVar(`--motion-ease-${token}`) || MOTION_DEFAULTS.easing[token]
}

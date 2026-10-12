// Decorative gradient backdrop for the sign-in showcase column. Pure CSS (no
// framer-motion, no brand assumptions): colors come from the theme's CSS
// variables by default, so any vertical inherits its own palette. Compose
// content on top through `children` or the title/subtitle/footer shortcuts.
import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@asteby/metacore-ui/lib'
import { HeroPanel } from './blocks'

export type GradientShowcaseProps = {
  /**
   * Gradient stops, any valid CSS color (`#102E6B`, `hsl(var(--primary))`).
   * Defaults to the theme's primary fading into the background. At least two
   * stops are needed; fewer fall back to the default.
   */
  colors?: readonly string[]
  /** `linear-gradient` angle in degrees. Default `135`. */
  angle?: number
  /** Soft decorative blobs over the gradient. Default `true`. */
  blobs?: boolean
  /** Darkening scrim so text stays legible over bright stops. Default `false`. */
  scrim?: boolean
  /** Headline rendered through `HeroPanel`. Omit to render only `children`. */
  title?: ReactNode
  subtitle?: ReactNode
  /** Slot below the subtitle (CTAs, badges, signed-by, …). */
  footer?: ReactNode
  /** Free content centered over the gradient (after the hero text, if any). */
  children?: ReactNode
  className?: string
}

export const DEFAULT_GRADIENT_COLORS: readonly string[] = [
  'color-mix(in oklab, var(--primary, #102E6B) 85%, black)',
  'var(--primary, #102E6B)',
  'color-mix(in oklab, var(--primary, #102E6B) 35%, var(--background, white))',
]

/** CSS `background-image` for `colors` / `angle` (exported for tests and hosts). */
export function buildGradient(colors?: readonly string[], angle = 135): string {
  const stops = colors && colors.length >= 2 ? colors : DEFAULT_GRADIENT_COLORS
  return `linear-gradient(${Number.isFinite(angle) ? angle : 135}deg, ${stops.join(', ')})`
}

export function GradientShowcase({
  colors,
  angle = 135,
  blobs = true,
  scrim = false,
  title,
  subtitle,
  footer,
  children,
  className,
}: GradientShowcaseProps = {}) {
  const style: CSSProperties = { backgroundImage: buildGradient(colors, angle) }
  return (
    <div
      data-slot="gradient-showcase"
      className={cn(
        'relative flex h-full w-full items-center justify-center overflow-hidden px-8 text-white',
        className,
      )}
      style={style}
    >
      {blobs && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-1/4 -right-1/4 size-[480px] rounded-full bg-white/15 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-1/4 -left-1/4 size-[420px] rounded-full bg-black/20 blur-3xl"
          />
        </>
      )}
      {scrim && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/30" />}
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-6">
        {title != null && (
          <HeroPanel
            title={title}
            subtitle={subtitle}
            footer={footer}
            noAnimate
            className="[&_p]:text-white/80"
          />
        )}
        {children}
      </div>
    </div>
  )
}

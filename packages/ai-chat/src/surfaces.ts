/**
 * Surfaces shared by the Aby workspace (/agent) and the floating widget.
 *
 * They paint with the semantic surface tokens of @asteby/metacore-theme
 * (--surface-*, --border-rim, --elevation-*, --backdrop-panel, --radius-*):
 * each theme pack defines them (glass.css → frosted rim + blur), so this
 * screen never knows which theme is active. The fallbacks are the base
 * tokens, for a theme that doesn't define them yet.
 *
 * Paint on top of the page, never with `bg-background` again: the route
 * already paints --background once, and stacking it is what made the glass
 * theme read as a flat dark fill here.
 */

const RIM = '[border-color:var(--border-rim,var(--border))]'
const BACKDROP = '[backdrop-filter:var(--backdrop-panel,none)] [-webkit-backdrop-filter:var(--backdrop-panel,none)]'

/** Floating panel: chat list, widget shell. */
export const AGENT_PANEL = [
  'rounded-[var(--radius-panel,1rem)] border bg-[var(--surface-panel,var(--card))]',
  RIM,
  BACKDROP,
  '[box-shadow:var(--elevation-panel,0_12px_32px_-16px_rgb(0_0_0/0.18))]',
].join(' ')

/** Translucent top bar over the page. */
export const AGENT_BAR = `border-b border-border/50 bg-[var(--surface-panel,var(--card))] ${BACKDROP}`

/** Composer capsule floating over the thread. */
export const AGENT_CAPSULE = [
  'rounded-[var(--radius-field,1.75rem)] border bg-[var(--surface-panel,var(--card))]',
  RIM,
  BACKDROP,
  '[box-shadow:var(--elevation-float,0_18px_45px_-18px_rgb(0_0_0/0.3))]',
  'transition-[border-color,box-shadow] duration-200 focus-within:[border-color:color-mix(in_oklab,var(--primary)_45%,transparent)]',
].join(' ')

/** Visible keyboard focus ring for every interactive control. */
export const AGENT_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 motion-reduce:transition-none'

/** Result / action card inside a reply. */
export const AGENT_CARD = [
  'rounded-xl border bg-[var(--surface-raised,var(--card))]',
  RIM,
  BACKDROP,
  '[box-shadow:var(--elevation-raised,0_1px_2px_rgb(0_0_0/0.05))]',
].join(' ')

/** Interactive card: hover lift + visible keyboard focus. */
export const AGENT_CARD_INTERACTIVE =
  'transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-px hover:[border-color:color-mix(in_oklab,var(--primary)_35%,transparent)] hover:[box-shadow:var(--elevation-panel,0_6px_16px_-8px_rgb(0_0_0/0.2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none motion-reduce:hover:translate-y-0'

/** Subtle entrance for messages and cards; off under prefers-reduced-motion. */
export const AGENT_ENTER =
  'animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-out fill-mode-both motion-reduce:animate-none'

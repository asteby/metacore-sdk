import type { CSSProperties, ReactNode, SVGProps } from 'react'

/** Side of the square viewBox every mockup draws in. */
export const MOCKUP_SIZE = 400

/**
 * Theme tokens. Each mockup reads `--mockup-*` (set them in the store CSS),
 * falls back to the store theme (`--color-muted`, `--color-primary`... as
 * emitted by `ThemeStyle`) and finally to neutral greys that follow
 * `color-scheme` through `light-dark()`. No brand colors live here.
 */
export const MOCKUP_TOKENS = {
  bg: 'var(--mockup-bg, var(--color-muted, light-dark(#f4f4f5, #27272a)))',
  surface: 'var(--mockup-surface, light-dark(#3f3f46, #0a0a0a))',
  'surface-ink': 'var(--mockup-surface-ink, light-dark(#e4e4e7, #a1a1aa))',
  label: 'var(--mockup-label, var(--color-background, light-dark(#ffffff, #18181b)))',
  'label-ink': 'var(--mockup-label-ink, var(--color-foreground, light-dark(#18181b, #fafafa)))',
  ink: 'var(--mockup-ink, var(--color-foreground, light-dark(#18181b, #fafafa)))',
  muted: 'var(--mockup-muted, var(--color-muted-foreground, light-dark(#71717a, #a1a1aa)))',
  accent: 'var(--mockup-accent, var(--color-primary, light-dark(#52525b, #d4d4d8)))',
  'accent-ink': 'var(--mockup-accent-ink, var(--color-primary-foreground, light-dark(#ffffff, #18181b)))',
} as const

export type MockupTone = keyof typeof MOCKUP_TOKENS

const ROOT_STYLE: Record<string, string> = {
  ...Object.fromEntries(Object.entries(MOCKUP_TOKENS).map(([k, v]) => [`--mk-${k}`, v])),
  fontFamily: 'var(--mockup-font, var(--font-heading, var(--font-sans, ui-sans-serif, system-ui, sans-serif)))',
  textTransform: 'var(--mockup-text-transform, none)',
}

/** `style` that paints an element with a token: `<rect style={tone('accent')} />`. */
export function tone(t: MockupTone, prop: 'fill' | 'stroke' = 'fill'): CSSProperties {
  return { [prop]: `var(--mk-${t})` }
}

/** Monospace stack for part numbers and sizes (`--mockup-font-mono`). */
export const MOCKUP_MONO = 'var(--mockup-font-mono, var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace))'

// ---------------------------------------------------------------------------
// Text layout (no DOM measuring: works the same in SSR)
// ---------------------------------------------------------------------------

/** Greedy word wrap by characters; the last allowed line ends in `…` when text is cut. */
export function wrapMockupText(text: string | null | undefined, maxChars: number, maxLines: number): string[] {
  if (!text || maxLines < 1) return []
  const words = text.split(' ').filter(Boolean)
  const lines: string[] = []
  let current = ''
  let cut = false
  for (let i = 0; i < words.length; i++) {
    let word = words[i]!
    if (Array.from(word).length > maxChars) word = Array.from(word).slice(0, maxChars - 1).join('') + '…'
    const next = current ? `${current} ${word}` : word
    if (Array.from(next).length <= maxChars) {
      current = next
      continue
    }
    lines.push(current)
    current = word
    if (lines.length === maxLines) {
      cut = true
      current = ''
      break
    }
  }
  if (current) lines.push(current)
  if (cut || lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    const last = Array.from(kept[maxLines - 1] ?? '')
    kept[maxLines - 1] = (last.length >= maxChars ? last.slice(0, maxChars - 1).join('') : last.join('')).replace(/[\s.,;:…-]+$/, '') + '…'
    return kept
  }
  return lines
}

/** Font size so the longest line fits `width` (approximate glyph width `ratio` em). */
export function fitMockupFontSize(lines: readonly string[], width: number, max: number, min = 10, ratio = 0.62): number {
  const longest = Math.max(1, ...lines.map((l) => Array.from(l).length))
  return Math.round(Math.max(min, Math.min(max, width / (longest * ratio))))
}

export type MockupTextProps = Omit<SVGProps<SVGTextElement>, 'children'> & {
  lines: readonly string[]
  x: number
  y: number
  size: number
  lineHeight?: number
  tone?: MockupTone
  weight?: number
  anchor?: 'start' | 'middle' | 'end'
  mono?: boolean
}

/** Multi-line `<text>`; `y` is the baseline of the first line. */
export function MockupText({ lines, x, y, size, lineHeight = 1.12, tone: t = 'ink', weight = 700, anchor = 'middle', mono, style, ...rest }: MockupTextProps) {
  if (!lines.length) return null
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontWeight={weight}
      textAnchor={anchor}
      style={{ ...tone(t), ...(mono ? { fontFamily: MOCKUP_MONO } : null), ...style }}
      {...rest}
    >
      {lines.length === 1
        ? lines[0]
        : lines.map((line, i) => (
            <tspan key={i} x={x} dy={i === 0 ? 0 : size * lineHeight}>
              {line}
            </tspan>
          ))}
    </text>
  )
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

export type MockupFrameProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'role' | 'ref'> & {
  /** Accessible name (`aria-label` and `<title>`). */
  label: string
  /** Hide from assistive tech (the product name is already next to it). */
  decorative?: boolean
  /** Written to `data-mockup` for styling and tests. */
  kind?: string
  children?: ReactNode
}

/**
 * The `<svg>` shell shared by every mockup: square viewBox, token variables,
 * background, `role="img"` with an accessible name that says it is an
 * illustration. Use it in custom renderers to get the same contract.
 */
export function MockupFrame({ label, decorative = false, kind, children, style, width = MOCKUP_SIZE, height = MOCKUP_SIZE, ...rest }: MockupFrameProps) {
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': label }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${MOCKUP_SIZE} ${MOCKUP_SIZE}`}
      width={width}
      height={height}
      focusable="false"
      data-mockup={kind}
      {...a11y}
      style={{ ...ROOT_STYLE, ...style } as CSSProperties}
      {...rest}
    >
      {decorative ? null : <title>{label}</title>}
      <rect width={MOCKUP_SIZE} height={MOCKUP_SIZE} style={tone('bg')} />
      {children}
    </svg>
  )
}

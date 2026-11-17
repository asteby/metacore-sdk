import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * AddonLogo — the ONE tile that draws a provider/addon logo (cards, rows,
 * sidebar, config-modal header). Shared so every app renders logos the same
 * and none can clip them again.
 *
 * Why logos used to look cropped: the tile was `border-box` with an inline
 * `padding` AND a real 1px border, while the <img> carried a hard-coded pixel
 * size computed as `tile - 2*pad`. The border ate 2px of the content box, so
 * the image overflowed it and `overflow-hidden` + the rounded corners shaved
 * the logo's edges; Tailwind's preflight `img { max-width: 100% }` additionally
 * squeezed the width alone. Here the ring is an inset box-shadow (takes no
 * layout space) and the image simply FILLS the padded content box with
 * `object-contain`, so any aspect ratio (square, wide, tall, SVG, transparent
 * PNG) is scaled down to fit — never cropped.
 *
 * The tile is pure white in light AND dark themes so dark/transparent marks
 * keep contrast. Security: logos come from a hub, so they are only ever an
 * `<img src>` (never injected markup) and only http(s), same-origin paths or
 * data:image/* are accepted; anything else falls back to glyph/monogram.
 */

type IconComponent = React.ComponentType<{ className?: string }>

const SAFE_SRC_RE = /^(https?:\/\/|\/(?!\/)|data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,])/i

/** Returns `src` only when it is a safe destination for `<img>`. */
export function safeLogoSrc(src?: string | null): string | undefined {
  const s = (src ?? '').trim()
  return s && SAFE_SRC_RE.test(s) ? s : undefined
}

export type AddonLogoSize = 'sidebar' | 'row' | 'card' | 'modal' | 'detail'

/** tile / inner padding / corner radius, in px. */
export const ADDON_LOGO_METRICS: Record<AddonLogoSize, { tile: number; pad: number; radius: number }> = {
  sidebar: { tile: 20, pad: 2, radius: 5 },
  row: { tile: 28, pad: 4, radius: 7 },
  card: { tile: 44, pad: 6, radius: 10 },
  modal: { tile: 48, pad: 7, radius: 11 },
  detail: { tile: 64, pad: 10, radius: 14 },
}

/** 1–2 letter deterministic monogram from the addon name. */
export function monogramOf(name?: string | null): string {
  const words = (name ?? '')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
  if (words.length === 0) return '?'
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0].charAt(0) + words[1].charAt(0)
  return letters.toUpperCase()
}

function luminance(hex: string): number | undefined {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return undefined
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

/** WCAG contrast of `hex` against white, or undefined if not a valid hex. */
export function contrastOnWhite(hex?: string | null): number | undefined {
  const l = hex ? luminance(hex) : undefined
  return l === undefined ? undefined : 1.05 / (l + 0.05)
}

const NEUTRAL_700 = '#404040'

/** Fallback color: the addon's own only when it reaches 4.5:1 on white. */
export function fallbackColor(color?: string | null): string {
  const c = contrastOnWhite(color)
  return c !== undefined && c >= 4.5 && color ? color.trim() : NEUTRAL_700
}

export interface AddonLogoProps {
  /** Logo URL (hub or data URL). Empty/unsafe => fallback. */
  src?: string | null
  /** Addon name: monogram fallback and alt text when `alone`. */
  name?: string | null
  /** Lucide glyph from the manifest, preferred fallback. */
  fallbackIcon?: IconComponent
  /** Addon color; used for the fallback only when it contrasts >= 4.5:1. */
  color?: string | null
  size?: AddonLogoSize
  /** true when the name is NOT rendered next to it: alt becomes the name. */
  alone?: boolean
  className?: string
}

export function AddonLogo({
  src,
  name,
  fallbackIcon: FallbackIcon,
  color,
  size = 'row',
  alone = false,
  className,
}: AddonLogoProps) {
  const safe = safeLogoSrc(src)
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null)
  const m = ADDON_LOGO_METRICS[size]
  const showLogo = Boolean(safe) && failedSrc !== safe
  const style: React.CSSProperties = {
    width: m.tile,
    height: m.tile,
    padding: m.pad,
    borderRadius: m.radius,
    // The sidebar tile is 20px but occupies 16px of layout so the nav item
    // keeps its height expanded or collapsed.
    ...(size === 'sidebar' ? { margin: -2 } : null),
  }

  return (
    <span
      data-slot='addon-logo'
      data-fallback={showLogo ? undefined : 'true'}
      style={style}
      className={cn(
        // box-border + inset ring (no real border) => content box is exactly
        // tile - 2*pad and the image can never overflow it.
        'box-border inline-flex shrink-0 items-center justify-center overflow-hidden bg-white',
        'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)]',
        'dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]',
        className,
      )}
    >
      {showLogo ? (
        <img
          src={safe}
          alt={alone ? (name ?? '') : ''}
          aria-hidden={alone ? undefined : true}
          loading='lazy'
          decoding='async'
          referrerPolicy='no-referrer'
          draggable={false}
          className='block size-full max-h-full max-w-full object-contain object-center'
          onError={() => setFailedSrc(safe ?? null)}
        />
      ) : FallbackIcon ? (
        <span style={{ color: fallbackColor(color) }} className='inline-flex size-full' aria-hidden>
          <FallbackIcon className='size-full' />
        </span>
      ) : (
        <span
          aria-hidden={alone ? undefined : true}
          role={alone ? 'img' : undefined}
          aria-label={alone ? (name ?? undefined) : undefined}
          className='select-none font-semibold leading-none'
          style={{
            color: fallbackColor(color),
            fontSize: Math.max(8, Math.round((m.tile - 2 * m.pad) * 0.55)),
          }}
        >
          {monogramOf(name)}
        </span>
      )}
    </span>
  )
}

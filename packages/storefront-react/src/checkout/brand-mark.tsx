import type { CSSProperties } from 'react'
import { brandLogo, brandName, findBrand } from './brands.js'

export type BrandMarkProps = {
  /** Provider identifier (`fedex`, `oxxo`, `mercadopago`, `7eleven`…). Unknown keys get a neutral monogram. */
  brand: string | null | undefined
  /** Licensed logo sent by the provider (`PaymentPoint.logo_url`…). Only `https:`; it wins over the bundled logo and the badge. */
  logoUrl?: string | null
  /** Height in px of the box. Badges are 3:2 (width = 1.5 × height); real logos get a width that follows their shape. Default 24. */
  size?: number
  /**
   * Accessible name. Omit it when the brand name is already written next to the mark (the usual case): the mark is then
   * decorative (`aria-hidden`).
   */
  title?: string
  className?: string
}

function safeLogo(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** Letters of a monogram for a brand outside the catalog: "envios rapidos" → "ER". */
function monogram(raw: string): string {
  const words = (brandName(raw) ?? raw).split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [(words[0] ?? '?').slice(0, 2)]
  return letters.join('').toUpperCase()
}

/** What the mark ended up drawing: the provider's logo, the bundled real logo, or the typographic fallback. */
export type BrandMarkSource = 'provider' | 'logo' | 'badge'

const PLATE_RING = 'var(--sf-brand-mark-ring, rgb(127 127 127 / 0.35))'
/** Neutral plate behind a real logo: always white, so an unrecolored logo reads the same on light and dark themes. */
const PLATE_BG = 'var(--sf-brand-mark-plate, #fff)'

/** Box of a real logo: fixed height, width follows the logo's aspect ratio (clamped), so it never shifts the layout. */
export function logoBox(ar: number, size: number) {
  const pad = Math.max(2, Math.round(size * 0.16))
  const padX = Math.max(3, Math.round(size * 0.2))
  const innerH = size - pad * 2
  const maxW = size * 2.6
  const innerW = Math.min(innerH * ar, maxW)
  const imgH = Math.min(innerH, innerW / ar)
  return { width: Math.round(Math.max(innerW, innerH * 0.9) + padX * 2), height: size, imgW: Math.round(innerW), imgH: Math.round(imgH), pad, padX }
}

/**
 * The mark of a carrier, card network, wallet or cash point. Precedence: the provider's `logoUrl` (https, lazy) > the
 * real logo bundled with the package (inline data URI: no network request, same size on the server and in the browser)
 * > a typographic badge in the brand color for the brands without an available logo.
 *
 * Logos are never recolored; they sit on a white plate with a hairline (`--sf-brand-mark-ring`, plate color
 * `--sf-brand-mark-plate`) so they keep their contrast on light and dark themes. The element carries
 * `data-sf-brand-mark="<key>"` and `data-sf-brand-source="provider|logo|badge"`.
 */
export function BrandMark({ brand, logoUrl, size = 24, title, className }: BrandMarkProps) {
  const height = size
  const width = Math.round(size * 1.5)
  const a11y = title ? { role: 'img' as const, 'aria-label': title } : { 'aria-hidden': true as const }
  const logo = safeLogo(logoUrl)
  const found = findBrand(brand)
  const key = found?.key ?? 'generic'
  const style: CSSProperties = { width, height, flex: 'none' }
  const plate = (w: number, pad: number, padX: number): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    flex: 'none',
    width: w,
    height,
    padding: `${pad}px ${padX}px`,
    background: PLATE_BG,
    border: `1px solid ${PLATE_RING}`,
    borderRadius: Math.round(size * 0.2),
    overflow: 'hidden',
  })
  if (logo) {
    const b = logoBox(1.5, size)
    return (
      <span className={className} style={plate(width, b.pad, b.padX)} data-sf-brand-mark={key} data-sf-brand-source="provider" {...a11y}>
        <img
          src={logo}
          alt={title ?? ''}
          width={width - b.padX * 2}
          height={height - b.pad * 2}
          loading="lazy"
          decoding="async"
          style={{ objectFit: 'contain', maxWidth: '100%', maxHeight: '100%' }}
          {...(title ? {} : { 'aria-hidden': true })}
        />
      </span>
    )
  }
  const real = brandLogo(brand)
  if (found && real) {
    const b = logoBox(real.ar, size)
    // The plate is a role="img" with the commercial name; the <img> inside is decorative so it is not announced twice.
    const label = title ?? found.name
    return (
      <span className={className} style={plate(b.width, b.pad, b.padX)} data-sf-brand-mark={key} data-sf-brand-source="logo" {...(title ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
        <img src={real.src} alt="" width={b.imgW} height={b.imgH} decoding="async" draggable={false} style={{ display: 'block', maxWidth: 'none' }} />
      </span>
    )
  }
  const ring = PLATE_RING
  if (found?.shape === 'mastercard') {
    return (
      <svg viewBox="0 0 48 32" width={width} height={height} className={className} style={style} data-sf-brand-mark={key} data-sf-brand-source="badge" focusable="false" {...a11y}>
        <rect x="0.5" y="0.5" width="47" height="31" rx="5" fill={found.bg} stroke={ring} />
        <circle cx="19" cy="16" r="9" fill="#EB001B" />
        <circle cx="29" cy="16" r="9" fill="#F79E1B" />
        <path d="M24 8.52a9 9 0 0 1 0 14.96a9 9 0 0 1 0-14.96z" fill="#FF5F00" />
      </svg>
    )
  }
  const text = found ? (found.mark ?? found.name) : monogram(brand ?? '')
  const bg = found?.bg ?? 'var(--sf-brand-mark-bg, #E7E9EE)'
  const fg = found?.fg ?? 'var(--sf-brand-mark-fg, #2B2F38)'
  const lines = text.split('\n')
  const longest = Math.max(...lines.map((l) => l.length))
  // Short marks grow; long ones are squeezed into the badge (textLength) so every badge has the same box.
  const fontSize = lines.length > 1 ? (longest <= 5 ? 11 : 9.5) : longest <= 2 ? 15 : longest <= 4 ? 12 : 10
  const fit = (l: string) => (l.length > 5 ? { textLength: 40, lengthAdjust: 'spacingAndGlyphs' as const } : {})
  const italic = found?.key === 'visa' || found?.key === 'fedex' ? 'italic' : undefined
  const common = {
    textAnchor: 'middle' as const,
    fill: fg,
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    fontWeight: 800,
    fontSize,
    fontStyle: italic,
  }
  return (
    <svg viewBox="0 0 48 32" width={width} height={height} className={className} style={style} data-sf-brand-mark={key} data-sf-brand-source="badge" focusable="false" {...a11y}>
      <rect x="0.5" y="0.5" width="47" height="31" rx="5" fill={bg} stroke={ring} />
      {lines.length > 1 ? (
        lines.slice(0, 2).map((l, i) => (
          <text key={i} x="24" y={i === 0 ? 15 : 25.5} {...common} {...fit(l)}>
            {l}
          </text>
        ))
      ) : (
        <text x="24" y="16" dominantBaseline="central" letterSpacing={longest <= 4 ? 0.3 : 0} {...common} {...fit(text)}>
          {text}
        </text>
      )}
    </svg>
  )
}

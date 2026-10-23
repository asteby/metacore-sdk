import type { CSSProperties } from 'react'
import { brandName, findBrand } from './brands.js'

export type BrandMarkProps = {
  /** Provider identifier (`fedex`, `oxxo`, `mercadopago`, `7eleven`…). Unknown keys get a neutral monogram. */
  brand: string | null | undefined
  /** Licensed logo sent by the provider (`PaymentPoint.logo_url`…). Only `https:`; it wins over the badge. */
  logoUrl?: string | null
  /** Height in px. The badge is 3:2 (width = 1.5 × height). Default 24. */
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

/**
 * The mark of a carrier, card network, wallet or cash point: an inline SVG badge in the brand color with its short
 * wordmark (no network request, same size on the server and in the browser, so no layout shift). With `logoUrl` it
 * draws the provider's licensed logo instead, lazily, with fixed dimensions.
 *
 * The badge carries its own background, so it keeps its contrast on light and dark themes; a hairline
 * (`--sf-brand-mark-ring`) separates it from the page.
 */
export function BrandMark({ brand, logoUrl, size = 24, title, className }: BrandMarkProps) {
  const height = size
  const width = Math.round(size * 1.5)
  const a11y = title ? { role: 'img' as const, 'aria-label': title } : { 'aria-hidden': true as const }
  const logo = safeLogo(logoUrl)
  const found = findBrand(brand)
  const key = found?.key ?? 'generic'
  const style: CSSProperties = { width, height, flex: 'none' }
  if (logo) {
    return (
      <img
        src={logo}
        alt={title ?? ''}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        className={className}
        style={{ ...style, objectFit: 'contain' }}
        data-sf-brand-mark={key}
        {...(title ? {} : { 'aria-hidden': true })}
      />
    )
  }
  const ring = 'var(--sf-brand-mark-ring, rgb(127 127 127 / 0.35))'
  if (found?.shape === 'mastercard') {
    return (
      <svg viewBox="0 0 48 32" width={width} height={height} className={className} style={style} data-sf-brand-mark={key} focusable="false" {...a11y}>
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
    <svg viewBox="0 0 48 32" width={width} height={height} className={className} style={style} data-sf-brand-mark={key} focusable="false" {...a11y}>
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

// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import axe from 'axe-core'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { BrandMark, brandLogo, listBrands } from './index.js'
import { LOGOS } from './brands/logos.generated.js'

afterEach(cleanup)

// happy-dom rewrites import.meta.url, so the files are resolved from the package root (where vitest runs).
const BRANDS = join(process.cwd(), 'src/checkout/brands')
const manifest = JSON.parse(readFileSync(join(BRANDS, 'manifest.json'), 'utf8')) as {
  logos: Record<string, { name: string; source: string; license: string; date: string; mode: string }>
  pending: Record<string, string>
}
const catalog = listBrands()
const withLogo = catalog.filter((b) => LOGOS[b.key])
const badgeOnly = catalog.filter((b) => !LOGOS[b.key])

describe('real brand logos', () => {
  it('every logo belongs to a catalog brand and is documented with source, license and date', () => {
    for (const key of Object.keys(LOGOS)) {
      expect(catalog.some((b) => b.key === key), `${key} is not in the catalog`).toBe(true)
      const m = manifest.logos[key]
      expect(m, `${key} missing from manifest`).toBeDefined()
      expect(m!.source).toMatch(/^https:\/\//)
      expect(m!.license.length).toBeGreaterThan(10)
      expect(m!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(['color', 'mono']).toContain(m!.mode)
    }
    expect(Object.keys(manifest.logos).sort()).toEqual(Object.keys(LOGOS).sort())
  })

  it('every catalog key resolves to a real logo or to a documented fallback', () => {
    const docs = readFileSync(join(BRANDS, 'LOGOS.md'), 'utf8')
    const pendingText = Object.entries(manifest.pending)
      .map(([k, v]) => `${k} ${v}`)
      .join('\n')
      .toLowerCase()
    for (const b of badgeOnly) {
      const documented = pendingText.includes(b.key) || pendingText.includes(b.name.toLowerCase()) || b.key === 'spei' || b.key === 'stp'
      // Wallets / networks without a published asset are listed explicitly in the pending section.
      const alsoListed = docs.toLowerCase().includes(b.key) || docs.toLowerCase().includes(b.name.toLowerCase())
      expect(documented || alsoListed, `${b.key} has neither a logo nor a documented reason`).toBe(true)
    }
    expect(withLogo.length).toBeGreaterThanOrEqual(25)
    for (const key of ['fedex', 'dhl', 'estafeta', 'ups', 'oxxo', '7eleven', 'circlek', 'soriana', 'bbva', 'visa', 'mastercard', 'amex', 'mercadopago', 'imile', 'paquetexpress']) {
      expect(brandLogo(key), key).not.toBeNull()
    }
  })

  it('logos are self-contained data URIs: no network, no scripts, no external references', () => {
    for (const [key, logo] of Object.entries(LOGOS)) {
      expect(logo.src, key).toMatch(/^data:image\/(svg\+xml|png)[,;]/)
      expect(logo.ar, key).toBeGreaterThan(0.3)
      if (logo.src.startsWith('data:image/svg+xml')) {
        const svg = decodeURIComponent(logo.src.slice('data:image/svg+xml,'.length))
        expect(svg, key).toContain('viewBox=')
        expect(svg, key).toContain('xmlns="http://www.w3.org/2000/svg"')
        expect(svg, key).not.toMatch(/<script|<foreignObject|\son\w+=|href="https?:|url\(["']?https?:|@import|<image/i)
      }
    }
  })

  it('ships exactly the assets declared in the manifest, each within the size budget', () => {
    const files = readdirSync(join(BRANDS, 'assets'))
    expect(files.map((f) => f.replace(/\.(svg|png)$/, '')).sort()).toEqual(Object.keys(manifest.logos).sort())
    for (const f of files) {
      const size = readFileSync(join(BRANDS, 'assets', f)).length
      expect(size, f).toBeLessThanOrEqual(20_000)
    }
    const total = Object.values(LOGOS).reduce((n, l) => n + l.src.length, 0)
    expect(total).toBeLessThanOrEqual(130_000)
  })
})

describe('BrandMark precedence: provider logo_url > bundled logo > badge', () => {
  it('uses the provider logo over the bundled one', () => {
    const html = renderToString(<BrandMark brand="oxxo" logoUrl="https://cdn.example.com/oxxo.svg" />)
    expect(html).toContain('data-sf-brand-source="provider"')
    expect(html).toContain('src="https://cdn.example.com/oxxo.svg"')
    expect(html).not.toContain('data:image')
  })

  it('uses the bundled real logo when there is no valid provider logo', () => {
    for (const logoUrl of [undefined, null, '', 'http://insecure.example.com/x.png', 'javascript:alert(1)']) {
      const html = renderToString(<BrandMark brand="oxxo" logoUrl={logoUrl} />)
      expect(html, String(logoUrl)).toContain('data-sf-brand-source="logo"')
      expect(html).toContain('src="data:image/svg+xml,')
    }
  })

  it('falls back to the typographic badge for brands without a logo, and to a monogram for unknown ones', () => {
    expect(renderToString(<BrandMark brand="stp" />)).toContain('data-sf-brand-source="badge"')
    expect(renderToString(<BrandMark brand="redpack" />)).toContain('data-sf-brand-source="badge"')
    expect(renderToString(<BrandMark brand="envios rapidos" />)).toContain('>ER<')
  })

  it('resolves aliases to the same logo', () => {
    for (const [alias, key] of [['FedEx México', 'fedex'], ['711', '7eleven'], ['bancomer', 'bbva'], ['banamex', 'citibanamex'], ['master', 'mastercard'], ['mp', 'mercadopago']] as const) {
      expect(renderToString(<BrandMark brand={alias} />), alias).toContain(`data-sf-brand-mark="${key}"`)
      expect(renderToString(<BrandMark brand={alias} />), alias).toContain('data-sf-brand-source="logo"')
    }
  })

  it('performs no network request: the only remote image is the provider one', () => {
    for (const b of withLogo) {
      const html = renderToString(<BrandMark brand={b.key} size={28} />)
      const srcs = [...html.matchAll(/src="([^"]*)"/g)].map((m) => m[1]!)
      expect(srcs.length, b.key).toBe(1)
      expect(srcs[0], b.key).toMatch(/^data:/)
    }
  })
})

describe('BrandMark layout and accessibility', () => {
  it('has a fixed box (height = size) and a width that follows the logo, identical on server and client', () => {
    const html = renderToString(<BrandMark brand="dhl" size={28} />)
    expect(html).toContain('height:28px')
    expect(html).toMatch(/width:\d+px/)
    const { container } = render(<BrandMark brand="dhl" size={28} />)
    const box = container.firstElementChild as HTMLElement
    expect(box.style.height).toBe('28px')
    expect(html).toContain(`width:${box.style.width}`)
    // Wide logos are clamped so they never blow up a row.
    const wide = render(<BrandMark brand="chedraui" size={28} />).container.firstElementChild as HTMLElement
    expect(parseInt(wide.style.width, 10)).toBeLessThanOrEqual(Math.ceil(28 * 2.6 + 2 * 6))
  })

  it('is decorative by default and named with the commercial name when a title is given', () => {
    const deco = renderToString(<BrandMark brand="fedex" />)
    expect(deco).toContain('aria-hidden="true"')
    expect(deco).not.toContain('role="img"')
    const named = renderToString(<BrandMark brand="fedex" title="FedEx" />)
    expect(named).toContain('role="img"')
    expect(named).toContain('aria-label="FedEx"')
    expect(named).toContain('alt=""')
  })

  it('has no axe violations, with and without a name, across every brand', async () => {
    const { container } = render(
      <div>
        {catalog.map((b) => (
          <span key={b.key}>
            <BrandMark brand={b.key} />
            <BrandMark brand={b.key} title={b.name} />
          </span>
        ))}
        <BrandMark brand="oxxo" logoUrl="https://cdn.example.com/oxxo.svg" title="OXXO" />
      </div>,
    )
    const res = await axe.run(container, { rules: { region: { enabled: false } } })
    expect(res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`)).toEqual([])
  })
})

describe('contrast of the real logos on their plate (light and dark themes)', () => {
  const lum = (hex: string) => {
    const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
  }
  const against = (hex: string, bg: string) => {
    const [a, b] = [lum(hex), lum(bg)].sort((x, y) => y - x)
    return (a! + 0.05) / (b! + 0.05)
  }
  const expand = (h: string) => (h.length === 3 ? h.split('').map((c) => c + c).join('') : h).toLowerCase()
  const fills = (src: string) => {
    const svg = decodeURIComponent(src.slice('data:image/svg+xml,'.length))
    const found = [...svg.matchAll(/(?:fill|stroke|stop-color)(?:=["']|:)\s*#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)].map((m) => expand(m[1]!))
    // Paths with no explicit paint are black (SVG default): Apple Pay, PayPal's wordmark.
    return found.length ? found : ['000000']
  }

  it('the plate is white regardless of theme, and the container ring is visible on both page backgrounds', () => {
    const html = renderToString(<BrandMark brand="visa" />)
    expect(html).toContain('background:var(--sf-brand-mark-plate, #fff)')
    // The hairline is a mid-gray with alpha: it separates the white plate from a white page (light) and a near-black one (dark).
    expect(html).toContain('rgb(127 127 127 / 0.35)')
    expect(against('7f7f7f', 'ffffff')).toBeGreaterThan(1.5)
  })

  it('no logo is white-on-white: every SVG logo has ink that reads against the white plate', () => {
    for (const [key, logo] of Object.entries(LOGOS)) {
      if (!logo.src.startsWith('data:image/svg+xml')) continue
      const colors = fills(logo.src).filter((c) => c !== 'ffffff' && c !== 'fff')
      // Logos that carry a full-bleed brand background (DHL yellow, Amex blue…) also have non-white ink.
      expect(colors.length, `${key} has no visible ink`).toBeGreaterThan(0)
      const best = Math.max(...colors.map((c) => against(c, 'ffffff')))
      expect(best, `${key} ink is too light on white`).toBeGreaterThanOrEqual(1.5)
    }
  })

  it('logos whose main ink is dark/saturated keep >= 3:1 on the plate; the rest are full-bleed brand boxes', () => {
    // These logos paint their own colored background (the contrast that matters is inside the logo, defined by the brand).
    const ownBackground = new Set(['dhl', 'amex', 'circlek', 'oxxo', '7eleven', '99minutos'])
    for (const [key, logo] of Object.entries(LOGOS)) {
      if (!logo.src.startsWith('data:image/svg+xml') || ownBackground.has(key)) continue
      const colors = fills(logo.src).filter((c) => c !== 'ffffff')
      const best = Math.max(...colors.map((c) => against(c, 'ffffff')))
      expect(best, key).toBeGreaterThanOrEqual(3)
    }
  })
})

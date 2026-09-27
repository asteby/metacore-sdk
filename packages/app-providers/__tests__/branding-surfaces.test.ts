import { describe, expect, it } from 'vitest'
import { buildBrandingSurfaceCss } from '../src/platform-config-provider'

const vars = {
  '--primary': 'oklch(0.6 0.19 260)',
  '--primary-foreground': 'oklch(0.98 0 0)',
  '--chart-2': 'oklch(0.6 0.19 260)',
  '--background': 'oklch(0.994 0 0)',
  '--card': 'oklch(0.994 0 0)',
  '--sidebar': 'oklch(0.97 0.005 260)',
}

function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  expect(start).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

describe('buildBrandingSurfaceCss', () => {
  const css = buildBrandingSurfaceCss(vars)
  const noPack = block(css, ":root:is(:not([data-ui-theme]), [data-ui-theme='default'])")
  const pack = block(css, ":root[data-ui-theme]:not([data-ui-theme='default'])")

  it('paints brand surfaces only when no theme pack is active', () => {
    expect(noPack).toContain('--background: oklch(0.994 0 0);')
    expect(noPack).toContain('--sidebar: oklch(0.97 0.005 260);')
    expect(pack).not.toContain('--background')
    expect(pack).not.toContain('--card')
    expect(pack).not.toContain('--sidebar:')
  })

  it('leaves the brand accent out of the stylesheet (it is painted inline)', () => {
    expect(css).not.toContain('--primary:')
    expect(css).not.toContain('--chart-2')
  })

  it('makes a pack follow the brand accent on ring and active sidebar item', () => {
    expect(pack).toContain('--ring: oklch(0.6 0.19 260);')
    expect(pack).toContain('--sidebar-primary: oklch(0.6 0.19 260);')
    expect(pack).toContain('--sidebar-primary-foreground: oklch(0.98 0 0);')
  })
})

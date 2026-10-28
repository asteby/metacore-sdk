import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  Mascot,
  MASCOT_SKINS,
  MASCOT_SKIN_ALIASES,
  isValidSkin,
  registerMascotSkin,
  resolveMascotName,
  type MascotSkin,
} from '../src/mascot'

const render = (skin: string | MascotSkin | undefined) =>
  renderToStaticMarkup(createElement(Mascot, { skin, state: 'idle' }))

const custom: MascotSkin = {
  id: 'custom',
  name: 'Custom',
  toothShape: 'hex-frame',
  antenna: false,
  screenTone: 'dark',
  colors: {
    tire: '#111111',
    treadOrTooth: '#222222',
    accent: '#33aa33',
    glow: '#44cc44',
    screen: '#000000',
    screenCenter: '#050505',
  },
}

describe('mascot skins', () => {
  it('keeps the legacy gobi-navy id as an alias of the neutral hex-navy skin', () => {
    expect(MASCOT_SKIN_ALIASES['gobi-navy']).toBe('hex-navy')
    expect(MASCOT_SKINS['hex-navy']).toBeDefined()
    expect(MASCOT_SKINS['gobi-navy']).toBeUndefined()
    // Same resolved skin → identical colours/shape (only the SVG id prefix differs).
    const strip = (h: string) => h.replace(/mascot-(gobi-navy|hex-navy)/g, 'mascot-X')
    expect(strip(render('gobi-navy'))).toBe(strip(render('hex-navy')))
  })

  it('no longer carries vertical branding in the built-in skin', () => {
    expect(MASCOT_SKINS['hex-navy']!.name).not.toMatch(/gobi/i)
    expect(resolveMascotName('gobi-navy', undefined)).toBe(MASCOT_SKINS['hex-navy']!.name)
    expect(resolveMascotName('gobi-navy', 'Otro')).toBe('Otro')
  })

  it('draws the face from skin.face (replaces the host CSS patch)', () => {
    const html = render('hex-navy')
    expect(html).toContain('stroke="#f4f8ff"')
    expect(html).toContain('stroke-width="6.5"')
    expect(html).toContain('fill="#f4f8ff"')
  })

  it('renders an unknown inline-valid skin object', () => {
    const html = render(custom)
    expect(html).toContain('#33aa33')
    expect(html).toContain('mascot-custom-grad')
  })

  it('falls back to the default skin for invalid or unknown skins', () => {
    const norm = (h: string) => h.replace(/mascot-[a-z-]+-(grad|glow)/g, 'mascot-X-$1')
    const fallback = norm(render('gear-lime'))
    expect(norm(render('does-not-exist'))).toBe(fallback)
    expect(norm(render({ ...custom, toothShape: 'nope' } as unknown as MascotSkin))).toBe(fallback)
  })

  it('registerMascotSkin adds valid skins and ignores invalid ones', () => {
    registerMascotSkin('my-brand', custom)
    expect(MASCOT_SKINS['my-brand']).toBe(custom)
    registerMascotSkin('broken', { name: 'x' } as unknown as MascotSkin)
    expect(MASCOT_SKINS['broken']).toBeUndefined()
    expect(isValidSkin(custom)).toBe(true)
    expect(isValidSkin(null)).toBe(false)
    delete MASCOT_SKINS['my-brand']
  })
})

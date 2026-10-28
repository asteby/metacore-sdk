import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { brandToManifest, metacorePWA } from '../src/vite-plugin'

const captured: { options?: any } = {}
vi.mock('vite-plugin-pwa', () => ({
  VitePWA: (options: unknown) => {
    captured.options = options
    return []
  },
}))

const brand = {
  name: 'Vantora',
  short_name: 'Vnt',
  description: 'Plataforma',
  color: '#0033f0',
  theme: { primary: '#0033f0', theme_color: '#020846', background_color: '#020846' },
  assets: {
    icon: { url: '/api/brand/icon', type: 'image/svg+xml' },
    maskable: { url: '/api/brand/maskable', type: 'image/png', width: 512, height: 512 },
    monochrome: { url: '/api/brand/monochrome', type: 'image/svg+xml' },
  },
}

describe('brandToManifest', () => {
  it('fills name, colours and the three icon purposes', () => {
    const m = brandToManifest(brand) as Record<string, any>
    expect(m.name).toBe('Vantora')
    expect(m.short_name).toBe('Vnt')
    expect(m.theme_color).toBe('#020846')
    expect(m.background_color).toBe('#020846')
    expect(m.icons.map((i: any) => i.purpose)).toEqual(['any', 'maskable', 'monochrome'])
    expect(m.icons[1]).toMatchObject({ src: '/api/brand/maskable', sizes: '512x512', type: 'image/png' })
  })

  it('uses neutral colours (never lime) and name as short_name when the brand lacks them', () => {
    const m = brandToManifest({ name: 'X' }) as Record<string, any>
    expect(m.short_name).toBe('X')
    expect(m.theme_color).toBe('#0f172a')
    expect(m.background_color).toBe('#ffffff')
    expect(m.icons).toEqual([])
  })
})

describe('metacorePWA', () => {
  afterEach(() => vi.restoreAllMocks())

  it('builds the manifest from a brand object and lets explicit manifest fields win', () => {
    metacorePWA({ brand, manifest: { short_name: 'Override' } })
    const m = captured.options.manifest
    expect(m.name).toBe('Vantora')
    expect(m.short_name).toBe('Override')
    expect(m.theme_color).toBe('#020846')
    expect(m.icons).toHaveLength(3)
  })

  it('reads a brand JSON from a path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'brand-'))
    const file = join(dir, 'brand.json')
    writeFileSync(file, JSON.stringify(brand))
    metacorePWA({ brand: file })
    expect(captured.options.manifest.name).toBe('Vantora')
  })

  it('keeps the legacy defaults when nothing is passed, warning once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    metacorePWA({ brand })
    metacorePWA({ manifest: { name: 'Mine' } })
    expect(warn).not.toHaveBeenCalled()
    metacorePWA()
    expect(captured.options.manifest.name).toBe('Metacore App')
    expect(captured.options.manifest.theme_color).toBe('#84cc16')
    metacorePWA()
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('legacy default'))).toHaveLength(1)
  })
})

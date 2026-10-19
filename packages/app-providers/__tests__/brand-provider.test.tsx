// PlatformConfigProvider alimenta el BrandProvider de runtime-react: lo que
// el host resuelve como PlatformBranding llega a useBrand() sin otro fetch.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useBrand } from '@asteby/metacore-runtime-react/brand'
import {
  FALLBACK_BRANDING,
  PlatformConfigProvider,
  type PlatformBranding,
} from '../src/platform-config-provider'
import { toBrand } from '../src/brand'
import * as entry from '../src/index'

function BrandProbe() {
  const b = useBrand()
  return <output>{JSON.stringify(b)}</output>
}

function renderBrand(defaults: PlatformBranding, extra: { resolveBrandAsset?: (r: string) => string } = {}) {
  const client = new QueryClient()
  const html = renderToString(
    <QueryClientProvider client={client}>
      <PlatformConfigProvider fetcher={async () => ({})} defaults={defaults} {...extra}>
        <BrandProbe />
      </PlatformConfigProvider>
    </QueryClientProvider>,
  )
  const json = html.replace(/^<output>/, '').replace(/<\/output>$/, '').replace(/&quot;/g, '"')
  return JSON.parse(json) as ReturnType<typeof useBrand>
}

describe('toBrand', () => {
  it('traduce PlatformBranding sin inventar valores', () => {
    expect(
      toBrand({
        platform_name: ' Acme ',
        platform_logo: 'logo.png',
        favicon_url: '',
        primary_color: '#112233',
        accent_color: '#445566',
        mascot_name: 'Rex',
        brand_locked: true,
        brand_source: 'hub',
      }),
    ).toEqual({
      name: 'Acme',
      logo: 'logo.png',
      favicon: '',
      primaryColor: '#112233',
      accentColor: '#445566',
      mascotName: 'Rex',
      locked: true,
      source: 'hub',
    })
  })

  it('resuelve los assets con resolveAssetUrl y deja vacíos los ausentes', () => {
    const b = toBrand(
      { platform_logo: 'logo.png', favicon_url: '' },
      { resolveAssetUrl: (r) => `/storage/platform/${r}` },
    )
    expect(b.logo).toBe('/storage/platform/logo.png')
    expect(b.favicon).toBe('')
  })

  it('sin datos el nombre queda vacío', () => {
    expect(toBrand(undefined).name).toBe('')
    expect(toBrand(FALLBACK_BRANDING).name).toBe('')
    expect(toBrand(FALLBACK_BRANDING).locked).toBe(false)
  })
})

describe('PlatformConfigProvider → BrandProvider', () => {
  it('expone la marca resuelta a useBrand()', () => {
    const brand = renderBrand(
      {
        ...FALLBACK_BRANDING,
        platform_name: 'Acme',
        platform_logo: 'logo.svg',
        brand_locked: true,
        brand_source: 'manual',
      },
      { resolveBrandAsset: (r) => `/storage/platform/${r}` },
    )
    expect(brand.name).toBe('Acme')
    expect(brand.logo).toBe('/storage/platform/logo.svg')
    expect(brand.locked).toBe(true)
    expect(brand.source).toBe('manual')
  })

  it('con los defaults del SDK el nombre es vacío', () => {
    expect(renderBrand(FALLBACK_BRANDING).name).toBe('')
  })

  it('el índice reexporta toBrand y useBrand', () => {
    expect(entry.toBrand).toBe(toBrand)
    expect(entry.useBrand).toBe(useBrand)
  })
})

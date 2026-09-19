import { describe, expect, it } from 'vitest'
import {
  FALLBACK_BRANDING,
  type BrandingFetcher,
  type PlatformBranding,
} from '../src/platform-config-provider'

describe('PlatformBranding default_preset_key', () => {
  it('is optional and absent from the fallback branding', () => {
    expect(FALLBACK_BRANDING.default_preset_key).toBeUndefined()
  })

  it('is exposed on payloads typed through BrandingFetcher without breaking existing consumers', async () => {
    const fetcher: BrandingFetcher = async () => ({
      ...FALLBACK_BRANDING,
      platform_name: 'Acme',
      default_preset_key: 'acme-holiday',
    })

    const payload: Partial<PlatformBranding> = await fetcher()

    expect(payload.default_preset_key).toBe('acme-holiday')
  })

  it('allows omitting default_preset_key entirely', async () => {
    const fetcher: BrandingFetcher = async () => ({
      ...FALLBACK_BRANDING,
      platform_name: 'Acme',
    })

    const payload = await fetcher()

    expect(payload.default_preset_key).toBeUndefined()
  })
})

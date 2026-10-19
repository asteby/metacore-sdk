// PlatformBranding (payload del backend del host) → Brand (contexto de
// @asteby/metacore-runtime-react/brand). Solo traduce: no inventa nombre ni
// logo, un campo vacío queda vacío.
import type { Brand } from '@asteby/metacore-runtime-react/brand'
import type { PlatformBranding } from './platform-config-provider'

export interface ToBrandOptions {
  /**
   * Convierte una referencia de asset (nombre de archivo, ruta o URL) en una
   * URL servible. Default: la referencia tal cual.
   */
  resolveAssetUrl?: (ref: string) => string
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function toBrand(
  config: Partial<PlatformBranding> | null | undefined,
  { resolveAssetUrl }: ToBrandOptions = {},
): Brand {
  const c = config ?? {}
  const asset = (ref: unknown) => {
    const r = str(ref)
    return r && resolveAssetUrl ? resolveAssetUrl(r) : r
  }
  return {
    name: str(c.platform_name),
    logo: asset(c.platform_logo),
    favicon: asset(c.favicon_url),
    primaryColor: str(c.primary_color),
    accentColor: str(c.accent_color),
    mascotName: str(c.mascot_name),
    locked: c.brand_locked === true,
    source: str(c.brand_source),
  }
}

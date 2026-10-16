/**
 * Ops appearance picker + storefront catalog ids.
 * Full self-hosted catalog (family/spec) lives in font-catalog.json / storefront.
 */
import { fontCatalog } from './storefront.js'

export const fonts = [
  'inter',
  'manrope',
  'sora',
  'instrument-sans',
  'dm-sans',
  'outfit',
  'space-grotesk',
  'jakarta',
  'montserrat',
  'krub',
  'oswald',
  'bebas',
  'playfair',
  'lora',
  'system',
] as const

export type FontFamily = (typeof fonts)[number]

export const fontFamilies = fonts

/** Ids from the storefront self-hosted catalog (excludes system). */
export const storefrontFontIds = fontCatalog.map((f) => f.id)

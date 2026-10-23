import { isSafeCssValue } from '../theme.js'

/** CSS custom properties (set by the shop in its stylesheet) -> provider widget variables. */
export const PAYMENT_THEME_TOKENS = {
  '--sf-pay-text': 'textPrimaryColor',
  '--sf-pay-text-muted': 'textSecondaryColor',
  '--sf-pay-background': 'formBackgroundColor',
  '--sf-pay-input-background': 'inputBackgroundColor',
  '--sf-pay-primary': 'baseColor',
  '--sf-pay-primary-contrast': 'buttonTextColor',
  '--sf-pay-error': 'errorColor',
  '--sf-pay-success': 'successColor',
  '--sf-pay-outline': 'outlinePrimaryColor',
  '--sf-pay-radius': 'borderRadiusMedium',
  '--sf-pay-radius-small': 'borderRadiusSmall',
  '--sf-pay-radius-large': 'borderRadiusLarge',
  '--sf-pay-outline-secondary': 'outlineSecondaryColor',
  '--sf-pay-primary-variant': 'baseColorFirstVariant',
  '--sf-pay-input-border-width': 'inputBorderWidth',
  '--sf-pay-form-padding': 'formPadding',
} as const

/**
 * Reads the `--sf-pay-*` tokens from an element's computed style, so the provider form follows the shop's
 * theme without the shop copying colors into JavaScript. Unsafe or empty values are skipped.
 */
export function readPaymentTheme(el: Element | null | undefined, tokens: Record<string, string> = PAYMENT_THEME_TOKENS): Record<string, string> {
  const out: Record<string, string> = {}
  if (!el || typeof getComputedStyle !== 'function') return out
  const style = getComputedStyle(el)
  for (const [cssVar, key] of Object.entries(tokens)) {
    const value = style.getPropertyValue(cssVar).trim()
    if (value && isSafeCssValue(value)) out[key] = value
  }
  return out
}

/**
 * Light or dark for the provider form, so it does not paint a white card inside a dark page. Order: the
 * `--sf-pay-scheme` token (`light` / `dark`), then the element's `color-scheme` (`light dark` follows the system
 * preference). `null` when nothing says it (the provider default).
 */
export function readPaymentScheme(el: Element | null | undefined): 'light' | 'dark' | null {
  if (!el || typeof getComputedStyle !== 'function') return null
  const style = getComputedStyle(el)
  const token = style.getPropertyValue('--sf-pay-scheme').trim()
  if (token === 'dark' || token === 'light') return token
  const cs = (style.getPropertyValue('color-scheme') || (style as unknown as { colorScheme?: string }).colorScheme || '').toLowerCase()
  const dark = /\bdark\b/.test(cs)
  const light = /\blight\b/.test(cs)
  if (dark && !light) return 'dark'
  if (light && !dark) return 'light'
  if (dark && light && typeof matchMedia === 'function') return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  return null
}

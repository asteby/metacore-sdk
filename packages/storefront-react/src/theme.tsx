/**
 * Server-side theme (S3): turns the content theme from
 * `content.theme()` into CSS custom properties so the first SSR byte already
 * carries the store's brand — no localStorage, no anti-flicker script.
 *
 * Token naming follows `@asteby/metacore-theme`: camelCase keys become
 * kebab-case (`primaryForeground` → `--primary-foreground`), and each color is
 * also exposed as a Tailwind 4 theme variable (`--color-primary-foreground`).
 * metacore-theme ships its tokens as static CSS with no reusable naming
 * helper, so this module is standalone and does not depend on it.
 */
import type { Theme } from '@asteby/storefront'

export type ThemeCssOptions = {
  /** Selector that receives the variables (default `:root`). */
  selector?: string
  /**
   * Variable names for color tokens:
   * `both` (default) → `--color-<name>` and `--<name>`;
   * `color` → only `--color-<name>` (Tailwind 4); `metacore` → only `--<name>`.
   */
  naming?: 'both' | 'color' | 'metacore'
  /** Fallback stack appended to every font (default system sans-serif). */
  fontFallback?: string
}

const DEFAULT_FONT_FALLBACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
const MONO_FALLBACK = 'ui-monospace, SFMono-Regular, Menlo, monospace'

/** `primaryForeground`, `primary_foreground`, `--color-primary-foreground` → `primary-foreground`. */
export function tokenName(key: string): string {
  return key
    .trim()
    .replace(/^-+/, '')
    .replace(/^color-/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_.]+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Rejects values that could escape the declaration or the `<style>` element. */
export function isSafeCssValue(value: string): boolean {
  if (!value || value.length > 200) return false
  if (/[;{}<>\\]/.test(value)) return false
  if (/url\s*\(|expression\s*\(|@import/i.test(value)) return false
  return true
}

function fontStack(family: string, role: string, fallback: string): string | null {
  const name = family.replace(/["']/g, '').trim()
  if (!name || !isSafeCssValue(name)) return null
  return `"${name}", ${role === 'mono' ? MONO_FALLBACK : fallback}`
}

/** CSS declarations (`--x:value`) for a theme, without selector. */
export function themeToCssVariables(theme: Partial<Theme> | null | undefined, options: ThemeCssOptions = {}): Record<string, string> {
  const naming = options.naming ?? 'both'
  const vars: Record<string, string> = {}
  for (const [key, raw] of Object.entries(theme?.tokens ?? {})) {
    const name = tokenName(key)
    const value = String(raw).trim()
    if (!name || !isSafeCssValue(value)) continue
    if (naming !== 'metacore') vars[`--color-${name}`] = value
    if (naming !== 'color') vars[`--${name}`] = value
  }
  const fallback = options.fontFallback ?? DEFAULT_FONT_FALLBACK
  for (const [role, family] of Object.entries(theme?.fonts ?? {})) {
    const name = tokenName(role)
    const stack = typeof family === 'string' ? fontStack(family, name, fallback) : null
    if (name && stack) vars[`--font-${name}`] = stack
  }
  if (theme?.radius && isSafeCssValue(theme.radius.trim())) vars['--radius'] = theme.radius.trim()
  return vars
}

/** `:root{--color-primary:#0f766e;--primary:#0f766e;...}` from a content theme. */
export function themeToCss(theme: Partial<Theme> | null | undefined, options: ThemeCssOptions = {}): string {
  const vars = themeToCssVariables(theme, options)
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
  if (!body) return ''
  const selector = (options.selector ?? ':root').replace(/[{}<>]/g, '')
  return `${selector}{${body}}`
}

/** Google Fonts stylesheet URL for the theme fonts (or `null` when there are none). */
export function themeFontsHref(theme: Partial<Theme> | null | undefined, weights: number[] = [400, 500, 600, 700]): string | null {
  const families = [...new Set(Object.values(theme?.fonts ?? {}).map((f) => String(f).replace(/["']/g, '').trim()).filter((f) => f && isSafeCssValue(f)))]
  if (!families.length) return null
  const params = families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@${weights.join(';')}`).join('&')
  return `https://fonts.googleapis.com/css2?${params}&display=swap`
}

export type ThemeStyleProps = ThemeCssOptions & {
  theme: Partial<Theme> | null | undefined
  nonce?: string
  id?: string
}

/** Emits the theme variables as a `<style>` (render it in `<head>` from the root route). */
export function ThemeStyle({ theme, nonce, id = 'storefront-theme', ...options }: ThemeStyleProps) {
  const css = themeToCss(theme, options)
  if (!css) return null
  return <style id={id} nonce={nonce} data-storefront-theme="" dangerouslySetInnerHTML={{ __html: css }} />
}

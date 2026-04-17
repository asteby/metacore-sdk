/**
 * Minimal translation type. Consumers can pass a function that wraps
 * `react-i18next`'s `t` (or any other i18n library). When omitted, components
 * simply render the supplied defaults (with `{{var}}` interpolation).
 */
export type WebhooksTranslate = (
  key: string,
  defaultValue: string,
  vars?: Record<string, unknown>
) => string

export function interpolate(s: string, vars?: Record<string, unknown>): string {
  if (!vars) return s
  return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : ''
  )
}

/**
 * Default translate — simply echoes the fallback string with optional
 * variable interpolation. Plug in your own `t` via the `WebhooksManager` prop.
 */
export const defaultTranslate: WebhooksTranslate = (_key, defaultValue, vars) =>
  interpolate(defaultValue, vars)

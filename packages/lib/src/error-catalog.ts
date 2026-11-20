/**
 * Error-code catalog: the kernel returns a stable `code` (+ optional `params`)
 * and an English fallback `message`. Hosts register `{code: template}` per
 * language with `{param}` placeholders; `getApiErrorMessage` consults it BEFORE
 * falling back to `message`. Pure, no React.
 */
import kernelCatalog from './error-catalog.data.json' with { type: 'json' }

export type ErrorCatalog = Record<string, string>

const catalogs = new Map<string, ErrorCatalog>()

const norm = (lang: string): string => lang.toLowerCase().split(/[-_]/)[0] ?? ''

/** Registers (merging over previous entries) the templates of a language. */
export function registerErrorCatalog(lang: string, catalog: ErrorCatalog): void {
  const key = norm(lang)
  catalogs.set(key, { ...(catalogs.get(key) ?? {}), ...catalog })
}

/** Registers every language of a `{lang: {code: template}}` bundle. */
export function registerErrorCatalogs(bundle: Record<string, ErrorCatalog>): void {
  for (const [lang, c] of Object.entries(bundle)) registerErrorCatalog(lang, c)
}

/** Replaces `{param}` with `params[param]`; unknown placeholders stay as-is. */
export function interpolateErrorTemplate(
  template: string,
  params?: Record<string, unknown> | null,
): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in params && params[k] != null ? String(params[k]) : m,
  )
}

/** Template message for `code` in `lang` (falls back to `en`); undefined if unknown. */
export function translateErrorCode(
  code: string | undefined,
  lang: string | undefined,
  params?: Record<string, unknown> | null,
): string | undefined {
  if (!code) return undefined
  const tpl =
    (lang ? catalogs.get(norm(lang))?.[code] : undefined) ?? undefined
  if (tpl === undefined) return undefined
  return interpolateErrorTemplate(tpl, params)
}

/** The kernel's own catalog (errcodes/locales/errors.json), as data. */
export const kernelErrorCatalog: Record<string, ErrorCatalog> = kernelCatalog

registerErrorCatalogs(kernelErrorCatalog)

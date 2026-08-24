/**
 * Translate an addon/host label that MAY already be localized by the backend.
 *
 * Hosts often run metadata through go-i18n before serving it, so `action.label`
 * / field labels arrive as plain Spanish/English ("Timbrar CFDI"). Passing those
 * through i18next again logs `missingKey` noise and, with some configs, can
 * surface the raw key. Only look up strings that look like dotted i18n keys
 * (`fiscal_mexico.action.stamp_fiscal.label`).
 */
export function translateMaybeKey(
  t: (key: string, opts?: { defaultValue?: string }) => string,
  label: string | undefined | null,
): string {
  const raw = (label ?? '').trim()
  if (!raw) return ''
  if (!raw.includes('.')) return raw
  return t(raw, { defaultValue: raw })
}

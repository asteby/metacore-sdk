// Pure helpers for connector secret fields (no React, no i18n): the minimum
// length a field declares, a CSPRNG generator that honours it, and a strength
// grade. Provider-agnostic on purpose: they read only how the field itself is
// declared (`validation` hint on a credential), so any addon benefits.

/** What these helpers need from a credential definition. */
export interface SecretFieldLike {
  key: string
  validation?: string
}

/** Length used by "Generar" when the field declares no minimum. */
export const DEFAULT_GENERATED_LENGTH = 32
/** Hard ceiling so a bad hint never produces an absurd secret. */
const MAX_GENERATED_LENGTH = 128

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * Minimum length the manifest declares for a credential, from its `validation`
 * hint. Understands `min_length:32` / `minlength=32` / `min:32` and the regex
 * form `^.{32,}$`. Returns 0 when nothing is declared.
 */
export function secretMinLength(field: SecretFieldLike): number {
  const v = (field.validation ?? '').trim()
  if (!v) return 0
  const named = /^(?:min_?length|min)\s*[:=]\s*(\d{1,4})$/i.exec(v)
  if (named) return Number(named[1])
  const rx = /^\^?\(?(?:\.|\\S|\[[^\]]+\])\{(\d{1,4}),(?:\d{0,4})\}\)?\$?$/.exec(v)
  if (rx) return Number(rx[1])
  return 0
}

/** Length "Generar" produces: the declared minimum (never below the default). */
export function generatedLength(field: SecretFieldLike): number {
  return Math.min(MAX_GENERATED_LENGTH, Math.max(DEFAULT_GENERATED_LENGTH, secretMinLength(field)))
}

type RandomSource = Pick<Crypto, 'getRandomValues'>

/**
 * Random secret of `length` chars over [A-Za-z0-9] using crypto.getRandomValues.
 * Rejection sampling keeps every character equally likely (no modulo bias).
 * Throws when no CSPRNG exists: a weak fallback is never acceptable here.
 */
export function generateSecret(length: number, source?: RandomSource): string {
  const rng = source ?? (typeof globalThis !== 'undefined' ? globalThis.crypto : undefined)
  if (!rng?.getRandomValues) throw new Error('crypto.getRandomValues unavailable')
  const n = Math.max(1, Math.min(MAX_GENERATED_LENGTH, Math.floor(length)))
  const limit = 256 - (256 % ALPHABET.length)
  let out = ''
  while (out.length < n) {
    const buf = new Uint8Array(n * 2)
    rng.getRandomValues(buf)
    for (const b of buf) {
      if (b < limit && out.length < n) out += ALPHABET[b % ALPHABET.length]
    }
  }
  return out
}

export type SecretStrength = 'empty' | 'weak' | 'fair' | 'strong'

/**
 * Coarse grade for the strength bar: length against the declared minimum
 * (or 16/32 when none), plus character variety and repetition.
 */
export function secretStrength(value: string, min = 0): SecretStrength {
  if (!value) return 'empty'
  const unique = new Set(value).size
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(value)).length
  const floor = Math.max(min, 16)
  if (value.length < floor || unique < 6) return 'weak'
  if (value.length >= Math.max(min, 32) && classes >= 2 && unique >= 12) return 'strong'
  return 'fair'
}

/** Keys of non-empty secret values shorter than the minimum their field declares. */
export function tooShortSecrets(
  fields: (SecretFieldLike & { secret?: boolean; type?: string })[],
  values: Record<string, string>,
): { key: string; min: number }[] {
  const out: { key: string; min: number }[] = []
  for (const f of fields) {
    if (!f.secret && f.type !== 'secret') continue
    const min = secretMinLength(f)
    const v = values[f.key] ?? ''
    if (min > 0 && v !== '' && v.length < min) out.push({ key: f.key, min })
  }
  return out
}

/**
 * Splits a long help sentence into a short lead and the technical remainder
 * (shown under a collapsible "Cómo se usa"). Splits at the first `;`, `.` or
 * line break; short texts are returned whole.
 */
export function splitHelp(text: string, maxLead = 90): { lead: string; detail: string } {
  const t = text.trim()
  if (t.length <= maxLead) return { lead: t, detail: '' }
  const m = /^(.+?)(?:[;.]\s+|\n+)(.+)$/s.exec(t)
  if (!m || m[1].length > 160) return { lead: t, detail: '' }
  return { lead: m[1].replace(/[;.]$/, '').trim(), detail: m[2].trim() }
}

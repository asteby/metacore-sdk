// Pure helpers for the connector credentials form (no React, no i18n instance):
// shape detection of pasted values, save-error parsing and required-field
// checks. Kept free of any provider name on purpose: the rules look at the
// SHAPE of a value and at how the form's own fields are declared, so every
// connector (any addon) benefits and none is special-cased.

/** The minimum a credential definition needs for these helpers. */
export interface CredentialLike {
  key: string
  label?: string
  required?: boolean
  secret?: boolean
  type?: string
  default?: string
}

export type CredentialShape = 'public_key' | 'secret_key'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
// Public (publishable) keys are short identifiers: "<PREFIX>-<uuid>" or the
// pk_live_/pk_test_ family. Server-side tokens are longer, numeric/hex blobs
// or sk_/rk_ prefixed. These are generic conventions, not one provider's.
const PUBLIC_SHAPES = [new RegExp(`^(?:[A-Z_]+-)?${UUID}$`, 'i'), /^pk_(?:live|test)_[A-Za-z0-9]+$/]
const SECRET_SHAPES = [/^(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+$/, /^[A-Z_]+-\d{6,}-\d{4,}-[0-9a-f]{16,}-\d+$/i]

/** What a pasted value looks like, or null when it is not recognisable. */
export function credentialShape(raw: string): CredentialShape | null {
  const v = raw.trim()
  if (!v) return null
  if (PUBLIC_SHAPES.some((r) => r.test(v))) return 'public_key'
  if (SECRET_SHAPES.some((r) => r.test(v))) return 'secret_key'
  return null
}

export const isSecretCredential = (f: CredentialLike) => !!f.secret || f.type === 'secret'

const looksPublic = (f: CredentialLike) => /public|publishable|client_id/i.test(f.key)

export interface ShapeMismatch {
  /** What the value looks like. */
  shape: CredentialShape
  /** The sibling field the value probably belongs to, when the form has one. */
  suggestedKey?: string
}

/**
 * A value pasted in the wrong box: a public key in the secret token field, or
 * a secret in the public-key field. Only a warning (never blocks), and only
 * raised when the form really has a field for what the value looks like.
 */
export function shapeMismatch(
  field: CredentialLike,
  value: string,
  fields: CredentialLike[],
): ShapeMismatch | null {
  const shape = credentialShape(value)
  if (!shape) return null
  const siblings = fields.filter((f) => f.key !== field.key)
  if (shape === 'public_key' && isSecretCredential(field) && !looksPublic(field)) {
    const target = siblings.find(looksPublic)
    return target ? { shape, suggestedKey: target.key } : null
  }
  if (shape === 'secret_key' && looksPublic(field)) {
    const target = siblings.find((f) => isSecretCredential(f) && !looksPublic(f))
    return target ? { shape, suggestedKey: target.key } : null
  }
  return null
}

/** Required fields still empty. A stored secret (connected) counts as filled. */
export function missingRequired(
  fields: CredentialLike[],
  values: Record<string, string>,
  connected: boolean,
): string[] {
  return fields
    .filter((f) => f.required)
    .filter((f) => !(values[f.key] ?? '').trim())
    .filter((f) => !(connected && isSecretCredential(f)))
    .filter((f) => !(f.default != null && f.default !== ''))
    .map((f) => f.key)
}

export interface SaveError {
  /** The complete server message, never shortened. */
  message: string
  /** Fields the server (or the client check) says need attention. */
  fieldKeys: string[]
}

/** Reads the kernel/ops error envelope: {message, errors: {field: [{code}]}}. */
export function parseSaveError(err: unknown, fallback: string): SaveError {
  const data = (err as { response?: { data?: { message?: unknown; errors?: unknown } } })?.response
    ?.data
  const message =
    typeof data?.message === 'string' && data.message.trim() ? data.message.trim() : fallback
  const errors = data?.errors
  const fieldKeys =
    errors && typeof errors === 'object' && !Array.isArray(errors) ? Object.keys(errors) : []
  return { message, fieldKeys }
}

/** Never show a raw dotted key: fall back to `fallback` when the text is the key. */
export function textOrFallback(text: string | undefined, key: string, fallback: string): string {
  if (!text || text === key) return fallback
  return text
}

/** Cheap content hash so a re-published bundle with the same key count re-merges. */
export function bundleSignature(labels: Record<string, unknown>): string {
  let h = 5381
  const s = JSON.stringify(labels)
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return `${Object.keys(labels).length}:${(h >>> 0).toString(36)}`
}

// ─── Conditional fields (visible_when) ──────────────────────────────────────
// Kernel contract (Setting.visible_when / FormSection.visible_when): a hidden
// credential counts for required checks only while visible. A connector with
// conditional providers (email: Resend / SendGrid / Mailgun, each with its own
// key in its own section) must never demand the keys of the providers that were
// not chosen. These pure helpers decide what is APPLICABLE for the live values.

export interface VisibilityPredicate {
  field?: string
  equals?: unknown
  in?: unknown[]
  class?: string
}

interface ConditionalField {
  key: string
  section?: string
  visible_when?: VisibilityPredicate
  visibleWhen?: VisibilityPredicate
}
interface ConditionalSection {
  key: string
  visible_when?: VisibilityPredicate
  visibleWhen?: VisibilityPredicate
}

/** Same semantics as `evaluateVisibleWhen` (no field / no comparison => visible). */
export function predicateHolds(
  cond: VisibilityPredicate | undefined,
  values: Record<string, string>,
  defaults: Record<string, string> = {},
): boolean {
  if (!cond || typeof cond.field !== 'string' || cond.field.trim() === '') return true
  const key = cond.field.trim()
  const raw = values[key]
  const current = raw == null || raw === '' ? (defaults[key] ?? '') : String(raw)
  if (Array.isArray(cond.in) && cond.in.length > 0) return cond.in.some((v) => String(v) === current)
  if (cond.equals != null) return String(cond.equals) === current
  return true
}

/** Sections the form shows for these values. */
export function visibleSections<S extends ConditionalSection>(
  sections: S[],
  values: Record<string, string>,
  defaults: Record<string, string> = {},
): S[] {
  return sections.filter((s) => predicateHolds(s.visible_when ?? s.visibleWhen, values, defaults))
}

/**
 * Fields the form shows for these values: the field's own `visible_when` holds
 * AND its section's does. Hidden fields are not validated, not counted in a
 * step's error state and not sent.
 */
export function applicableFields<F extends ConditionalField>(
  fields: F[],
  sections: ConditionalSection[],
  values: Record<string, string>,
  defaults: Record<string, string> = {},
): F[] {
  const hidden = new Set(
    sections.filter((s) => !predicateHolds(s.visible_when ?? s.visibleWhen, values, defaults)).map((s) => s.key),
  )
  return fields.filter(
    (f) => predicateHolds(f.visible_when ?? f.visibleWhen, values, defaults) && !(f.section && hidden.has(f.section)),
  )
}

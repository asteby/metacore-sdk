import type { ToolInputParam } from './types'
import type { ValidationError } from './types'

/**
 * Valida params contra un array de ToolInputParam. Mirror del Validate() del
 * kernel Go: mismo set de reglas para que los errores client-side y
 * server-side sean consistentes.
 */
export function validateParams(
  schema: ToolInputParam[],
  raw: Record<string, unknown>
): { cleaned: Record<string, unknown>; errors: ValidationError[] } {
  const cleaned: Record<string, unknown> = {}
  const errors: ValidationError[] = []

  for (const p of schema) {
    let value = raw[p.name]
    const missing = value === undefined || value === null || (typeof value === 'string' && value.trim() === '')

    if (missing) {
      if (p.default_value) {
        value = p.default_value
      } else if (p.required) {
        errors.push({ param: p.name, reason: 'required' })
        continue
      } else {
        continue
      }
    }

    let s = toStringValue(value)
    s = applyNormalize(p.normalize, s)

    const typeError = checkType(p.type, s)
    if (typeError) {
      errors.push({ param: p.name, reason: typeError })
      continue
    }

    if (p.validation) {
      let re: RegExp
      try {
        re = new RegExp(p.validation)
      } catch (err) {
        errors.push({ param: p.name, reason: `invalid validation regex: ${(err as Error).message}` })
        continue
      }
      if (!re.test(s)) {
        errors.push({ param: p.name, reason: 'does not match pattern' })
        continue
      }
    }

    cleaned[p.name] = coerceType(p.type, s)
  }

  return { cleaned, errors }
}

function toStringValue(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return String(v)
  if (v === null || v === undefined) return ''
  return JSON.stringify(v)
}

const normalizers: Record<string, (s: string) => string> = {
  uppercase: (s) => s.toUpperCase(),
  lowercase: (s) => s.toLowerCase(),
  trim: (s) => s.trim(),
  alphanumeric: (s) => s.replace(/[^a-zA-Z0-9]/g, ''),
  order_id: (s) => s.replace(/\s+/g, '').toUpperCase(),
}

function applyNormalize(rule: string | undefined, s: string): string {
  s = s.trim()
  if (rule && normalizers[rule]) return normalizers[rule]!(s)
  return s
}

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const phoneRe = /^\+?[0-9\s\-()]{6,}$/

function checkType(t: string | undefined, s: string): string | null {
  switch (t) {
    case undefined:
    case '':
    case 'string':
      return null
    case 'number':
      return Number.isFinite(Number(s)) ? null : `expected number, got ${JSON.stringify(s)}`
    case 'boolean':
      return s === 'true' || s === 'false' || s === '1' || s === '0'
        ? null
        : `expected boolean, got ${JSON.stringify(s)}`
    case 'date': {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
      const iso = Date.parse(s)
      return Number.isNaN(iso) ? `expected RFC3339 or YYYY-MM-DD date, got ${JSON.stringify(s)}` : null
    }
    case 'email':
      return emailRe.test(s) ? null : `invalid email ${JSON.stringify(s)}`
    case 'phone':
      return phoneRe.test(s) ? null : `invalid phone ${JSON.stringify(s)}`
    default:
      return null
  }
}

function coerceType(t: string | undefined, s: string): unknown {
  if (t === 'number') {
    const n = Number(s)
    return Number.isFinite(n) ? n : s
  }
  if (t === 'boolean') {
    return s === 'true' || s === '1'
  }
  return s
}

// The compatibility key of a saved item, read backwards. The guest keeps only `fit_key` in a cookie (never a plate or
// anything private); to show its label and to filter by it, it is resolved against the kind's catalog again.
import { resolveSubject, type ResolvedSubject, type SubjectKind } from '@asteby/storefront'

/** Shape of a key: what `fit_key` can hold (catalog ids and slugs joined by the template's separators). */
const KEY_RE = /^[a-z0-9._+/-]{1,100}$/

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Reads a key back into the item it names: the values are taken from the kind's template and validated against the
 * catalog like a saved item. `null` for a key that is not well formed, does not fit the template or does not resolve
 * (stale catalog, tampered cookie). Free (non-catalog) fields come back as their slug, which is all the key kept.
 */
export function subjectFromFitKey(kind: SubjectKind, fitKey: string | null | undefined): ResolvedSubject | null {
  if (!fitKey || !KEY_RE.test(fitKey) || !kind.fit_key_template) return null
  const names: string[] = []
  const pattern = kind.fit_key_template
    .split(/(\{[a-z][a-z0-9_]*\})/)
    .map((part) => {
      const m = /^\{([a-z][a-z0-9_]*)\}$/.exec(part)
      if (!m) return escape(part)
      names.push(m[1]!)
      return '([^/]+)'
    })
    .join('')
  const match = new RegExp(`^${pattern}$`).exec(fitKey)
  if (!match) return null
  const values: Record<string, string> = {}
  names.forEach((n, i) => (values[n] = match[i + 1]!))
  const r = resolveSubject(kind, values)
  // The key must be exactly the one the server would compute for those values.
  return r.ok && r.subject.fit_key === fitKey ? r.subject : null
}

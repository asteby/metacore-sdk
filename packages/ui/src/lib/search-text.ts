/**
 * Text helpers for type-to-filter controls (searchable selects, comboboxes).
 * Pure and dependency-free so every picker of the SDK matches the same way.
 */

/** Combining diacritical marks block, stripped after NFD decomposition. */
const MARKS = /[̀-ͯ]/g

/** Lowercase + strip accents + collapse whitespace: "Régimen  Fiscal" -> "regimen fiscal". */
export function normalizeSearchText(input: unknown): string {
  if (input == null) return ''
  return String(input)
    .normalize('NFD')
    .replace(MARKS, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Does `haystack` contain EVERY whitespace-separated token of `query`
 * (case/accent-insensitive)? An empty query matches everything.
 */
export function matchesSearch(haystack: string, query: string): boolean {
  const q = normalizeSearchText(query)
  if (!q) return true
  const h = normalizeSearchText(haystack)
  return q.split(' ').every((tok) => h.includes(tok))
}

export interface HighlightPart {
  text: string
  /** True when this slice matched the query. */
  match: boolean
}

/**
 * Splits `text` into matched / unmatched slices for `query` (case/accent
 * insensitive), preserving the ORIGINAL characters so accents are kept in the
 * rendered label. No query / no match -> a single unmatched slice.
 */
export function splitHighlight(text: string, query: string): HighlightPart[] {
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean)
  if (!text || tokens.length === 0) return [{ text, match: false }]

  // Normalize char by char, remembering the original index of each normalized
  // char, so a match in the normalized text maps back onto the raw text.
  let norm = ''
  const origin: number[] = []
  const chars = Array.from(text)
  let pos = 0
  for (const ch of chars) {
    const n = ch.normalize('NFD').replace(MARKS, '').toLowerCase()
    for (let k = 0; k < n.length; k++) origin.push(pos)
    norm += n
    pos += ch.length
  }

  const hit = new Array<boolean>(text.length).fill(false)
  let any = false
  for (const tok of tokens) {
    let from = 0
    for (;;) {
      const i = norm.indexOf(tok, from)
      if (i < 0) break
      any = true
      const start = origin[i]!
      const end = (origin[i + tok.length - 1] ?? start) + 1
      for (let j = start; j < Math.min(text.length, Math.max(end, start + 1)); j++) hit[j] = true
      from = i + tok.length
    }
  }
  if (!any) return [{ text, match: false }]

  const parts: HighlightPart[] = []
  let cur = ''
  let curHit = hit[0]!
  for (let j = 0; j < text.length; j++) {
    if (hit[j] !== curHit) {
      parts.push({ text: cur, match: curHit })
      cur = ''
      curHit = hit[j]!
    }
    cur += text[j]
  }
  parts.push({ text: cur, match: curHit })
  return parts
}

/**
 * Safe rich text for notification bodies (bell + toast).
 * Allows a small HTML subset and auto-emphasizes folios / quantities in plain text.
 */

const ALLOWED_TAGS = new Set(['strong', 'b', 'em', 'i', 'u', 'mark', 'code', 'br', 'span'])

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Strip dangerous tags/attrs; keep a tiny allowlist for emphasis. */
export function sanitizeNotificationHtml(input: string): string {
  let s = String(input ?? '')
  // Drop obviously dangerous blocks first.
  s = s.replace(/<\/?(script|style|iframe|object|embed|link|meta|img|svg|form|input|button)[^>]*>/gi, '')
  s = s.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  s = s.replace(/\s(href|src|xlink:href)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '')
  s = s.replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (match, tag: string) => {
    const t = tag.toLowerCase()
    if (!ALLOWED_TAGS.has(t)) return ''
    if (t === 'br') return '<br/>'
    if (match.startsWith('</')) return `</${t}>`
    // No attributes on allowlisted tags (keeps XSS surface tiny).
    return `<${t}>`
  })
  return s
}

/**
 * Plain-text → light HTML: **markdown**, folios (SO-00044), and qty tokens.
 * Already-escaped so safe to inject after sanitize.
 */
export function enhancePlainNotificationText(text: string): string {
  let s = escapeHtml(String(text ?? ''))
  // **bold**
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // _italic_ (avoid matching underscores inside ids)
  s = s.replace(/(^|[\s(])_(.+?)_([\s).,;!]|$)/g, '$1<em>$2</em>$3')
  // Folios / codes: SO-00044, WO-12, INV-0001, …
  s = s.replace(/\b([A-Z]{1,8}-\d{2,})\b/g, '<strong>$1</strong>')
  // Decimal quantities (e.g. -1.0000 → -1) and integers with units (3 ud)
  s = s.replace(
    /(^|[^\w.-])(-?\d+[.,]\d+)(\s*(?:ud|uds|pz|pzs|kg|g|lt|l|ml|cm|un))?\b/gi,
    (_m, pre: string, num: string, unit: string | undefined) =>
      `${pre}<strong>${formatQtyDisplay(num)}${unit ?? ''}</strong>`,
  )
  s = s.replace(
    /(^|[^\w.-])(-?\d+)(\s*(?:ud|uds|pz|pzs|kg|g|lt|l|ml|cm|un))\b/gi,
    (_m, pre: string, num: string, unit: string) =>
      `${pre}<strong>${num}${unit}</strong>`,
  )
  return s
}

/** -1.0000 → -1 · 1,50 → 1,5 · keep meaningful decimals, drop trailing zeros. */
export function formatQtyDisplay(raw: string): string {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return trimmed
  const comma = trimmed.includes(',')
  const n = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(n)) return trimmed
  let out = n.toFixed(4).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '')
  if (comma) out = out.replace('.', ',')
  return out
}

/** Final HTML string for a notification / toast body. */
export function formatNotificationBodyHtml(raw?: string | null): string {
  const text = (raw || '').trim()
  if (!text) return ''
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(text)
  const html = looksLikeHtml ? sanitizeNotificationHtml(text) : enhancePlainNotificationText(text)
  return html
}

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
  // Decimal quantities (e.g. -1.0000) and integers with units (3 ud, 2 kg)
  s = s.replace(
    /(^|[^\w.-])(-?\d+[.,]\d+)\b/g,
    (_m, pre: string, num: string) => `${pre}<strong>${num}</strong>`,
  )
  s = s.replace(
    /(^|[^\w.-])(-?\d+)(\s*(?:ud|uds|pz|pzs|kg|g|lt|l|ml|cm|un))\b/gi,
    (_m, pre: string, num: string, unit: string) =>
      `${pre}<strong>${num}${unit}</strong>`,
  )
  return s
}

/** Final HTML string for a notification / toast body. */
export function formatNotificationBodyHtml(raw?: string | null): string {
  const text = (raw || '').trim()
  if (!text) return ''
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(text)
  const html = looksLikeHtml ? sanitizeNotificationHtml(text) : enhancePlainNotificationText(text)
  return html
}

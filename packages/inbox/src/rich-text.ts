import { escapeHtml } from './html-sandbox'

const inline = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')

/**
 * Tiny, safe markdown subset -> HTML for the composer's HTML alternative:
 * **bold**, *italic*, [text](https://link), "- " lists and "> " quotes.
 * Input is escaped first, so the output can only contain these tags.
 */
export function markdownToHtml(md: string): string {
  const blocks = md.replace(/\r\n/g, '\n').split(/\n{2,}/)
  return blocks
    .map((block) => {
      const lines = block.split('\n')
      if (lines.every((l) => /^[-*] /.test(l))) return `<ul>${lines.map((l) => `<li>${inline(escapeHtml(l.slice(2)))}</li>`).join('')}</ul>`
      if (lines.every((l) => l.startsWith('> '))) return `<blockquote>${lines.map((l) => inline(escapeHtml(l.slice(2)))).join('<br>')}</blockquote>`
      return `<p>${lines.map((l) => inline(escapeHtml(l))).join('<br>')}</p>`
    })
    .join('')
}

/** Wraps the selection (or inserts the markers) and returns the new text plus selection. */
export function wrapSelection(value: string, start: number, end: number, before: string, after = before) {
  const sel = value.slice(start, end)
  const text = value.slice(0, start) + before + sel + after + value.slice(end)
  return { text, selStart: start + before.length, selEnd: start + before.length + sel.length }
}

/** Prefixes every selected line (lists, quotes). */
export function prefixLines(value: string, start: number, end: number, prefix: string) {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const nl = value.indexOf('\n', end)
  const lineEnd = nl === -1 ? value.length : nl
  const block = value.slice(lineStart, lineEnd).split('\n').map((l) => prefix + l).join('\n')
  return { text: value.slice(0, lineStart) + block + value.slice(lineEnd), selStart: lineStart, selEnd: lineStart + block.length }
}

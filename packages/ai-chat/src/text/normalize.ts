import { scrubToolDump } from './tool-dump'

/**
 * Model replies drift from strict GFM. Normalise them so lists and bullets
 * render, and leaked backend tool dumps never reach the user.
 */
export function normalizeMarkdown(content: string): string {
  let s = scrubToolDump(content).replace(/\r\n/g, '\n')
  // Drop leaked Go fmt map dumps (legacy bad fallbacks).
  if (s.includes('map[') && (s.includes('columns:') || s.includes('map[name:'))) {
    s = s
      .split('\n')
      .filter((line) => !line.includes('map[') || (!line.includes('columns:') && !line.includes('map[name:')))
      .join('\n')
      .trim()
  }
  // Line-start bullets (• ● ▪ ◦) → GFM "- "
  s = s.replace(/^[\t ]*[•●▪◦]\s+/gm, '- ')
  // Inline " • item" piles → one item per line
  s = s.replace(/([^\n])\s+[•●▪◦]\s+/g, '$1\n- ')
  // Blank line before a list so GFM parses it
  s = s.replace(/([^\n])\n(- )/g, '$1\n\n$2')
  return s
}

/**
 * Streaming-friendly: while a reply is still being typed in, an odd number of
 * ``` fences would swallow everything after them as code. Close it virtually.
 */
export function closeOpenFences(text: string): string {
  const fences = text.match(/^[ \t]*```/gm)?.length ?? 0
  return fences % 2 === 1 ? `${text}\n\`\`\`` : text
}

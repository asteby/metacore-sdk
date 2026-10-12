/** Strip markdown / noise for inbox & session list previews. */
export function stripMarkdownLite(input: string): string {
  let s = (input || '').replace(/\r\n/g, '\n')
  s = s.replace(/```[\s\S]*?```/g, ' ')
  s = s.replace(/`([^`]+)`/g, '$1')
  s = s.replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/__([^_]+)__/g, '$1')
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1$2')
  s = s.replace(/(^|[^_\w])_([^_\n]+)_(?!_)/g, '$1$2')
  s = s.replace(/^#{1,6}\s+/gm, '')
  s = s.replace(/^>\s?/gm, '')
  s = s.replace(/^[-*+]\s+/gm, '')
  s = s.replace(/^\d+\.\s+/gm, '')
  s = s.replace(/\n+/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

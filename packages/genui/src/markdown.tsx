import { Fragment, type ReactNode } from 'react'
import { isSafeLink } from './validate'

/**
 * Safe markdown subset parsed to React nodes: paragraphs, bold, italic, inline
 * code, bullet/numbered lists, h3/h4 and links. No HTML (text is always a React
 * child), no images, no tables. Links must pass `isSafeLink`; external ones also
 * need `allowExternalLinks`. There is no `dangerouslySetInnerHTML` anywhere.
 */
export interface MarkdownOptions {
  allowExternalLinks?: boolean
  onNavigate?: (path: string) => void
}

const INLINE = /(\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g

function inline(text: string, o: MarkdownOptions, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    const key = `${keyBase}-${n++}`
    if (m[2] !== undefined) out.push(<strong key={key}>{m[2]}</strong>)
    else if (m[3] !== undefined || m[4] !== undefined) out.push(<em key={key}>{m[3] ?? m[4]}</em>)
    else if (m[5] !== undefined) out.push(<code key={key} className='rounded bg-muted px-1 py-0.5 text-[0.85em]'>{m[5]}</code>)
    else {
      const label = m[6]!
      const href = m[7]!
      const local = href.startsWith('/')
      if (!isSafeLink(href) || (!local && !o.allowExternalLinks)) out.push(label)
      else if (local) {
        out.push(
          <a key={key} href={href} className='underline underline-offset-2' onClick={(e) => { if (o.onNavigate) { e.preventDefault(); o.onNavigate(href) } }}>
            {label}
          </a>,
        )
      } else {
        out.push(<a key={key} href={href} target='_blank' rel='noopener noreferrer nofollow' className='underline underline-offset-2'>{label}</a>)
      }
    }
    last = at + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function renderMarkdown(source: string, o: MarkdownOptions = {}): ReactNode {
  const blocks = source.replace(/\r\n?/g, '\n').split(/\n{2,}/)
  return blocks.map((raw, i) => {
    const chunk = raw.trim()
    if (!chunk) return null
    const key = `b${i}`
    const h = /^(#{3,4})\s+(.+)$/.exec(chunk)
    if (h && !chunk.includes('\n')) {
      return h[1]!.length === 3 ? <h3 key={key} className='m-0 text-sm font-semibold'>{inline(h[2]!, o, key)}</h3> : <h4 key={key} className='m-0 text-sm font-medium'>{inline(h[2]!, o, key)}</h4>
    }
    const lines = chunk.split('\n')
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      return <ul key={key} className='m-0 list-disc pl-5 text-sm'>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*]\s+/, ''), o, `${key}-${j}`)}</li>)}</ul>
    }
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      return <ol key={key} className='m-0 list-decimal pl-5 text-sm'>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*\d+[.)]\s+/, ''), o, `${key}-${j}`)}</li>)}</ol>
    }
    return (
      <p key={key} className='m-0 text-sm'>
        {lines.map((l, j) => (
          <Fragment key={j}>
            {j > 0 ? <br /> : null}
            {inline(l, o, `${key}-${j}`)}
          </Fragment>
        ))}
      </p>
    )
  })
}

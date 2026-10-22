import type { InboxParticipant, ThreadMessage } from './types'
import { toDate } from './utils'

export interface MessageGroup {
  key: string
  direction: ThreadMessage['direction']
  sender: InboxParticipant
  messages: ThreadMessage[]
}

const senderKey = (m: ThreadMessage) => `${m.direction}|${m.sender.id ?? m.sender.address ?? m.sender.name ?? ''}`

/** Consecutive messages from the same sender within `windowMs` share one header. */
export function groupMessages(messages: ThreadMessage[], windowMs = 5 * 60_000): MessageGroup[] {
  const out: MessageGroup[] = []
  let lastAt = 0
  for (const m of messages) {
    const at = toDate(m.sentAt)?.getTime() ?? 0
    const g = out[out.length - 1]
    if (g && senderKey(g.messages[0]!) === senderKey(m) && at - lastAt <= windowMs && at >= lastAt) {
      g.messages.push(m)
    } else {
      out.push({ key: m.id, direction: m.direction, sender: m.sender, messages: [m] })
    }
    lastAt = at
  }
  return out
}

// "On <date>, X wrote:" / "El <fecha>, X escribió:" / "-----Original Message-----"
const QUOTE_HEADER = /^(on .{5,200} wrote:|el .{5,200} escribi[oó]:|-{2,}\s*(original message|mensaje original|forwarded message)\s*-{2,}|from:\s.+)$/i

/**
 * Splits plain text into the new content and the quoted history. Quoted =
 * everything from the first attribution line or `>` block that runs to the end.
 */
export function splitQuoted(text: string): { body: string; quoted: string } {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()
    const isHeader = QUOTE_HEADER.test(line) && !/^from:/i.test(line)
    const isQuoteBlock = line.startsWith('>') && lines.slice(i).every((l) => !l.trim() || l.trim().startsWith('>') || QUOTE_HEADER.test(l.trim()))
    if (isHeader || isQuoteBlock) {
      // Attribution may wrap onto the next line.
      const rest = lines.slice(i)
      if (isHeader || rest.some((l) => l.trim().startsWith('>'))) {
        return { body: lines.slice(0, i).join('\n').trimEnd(), quoted: rest.join('\n').trim() }
      }
    }
  }
  return { body: text.trimEnd(), quoted: '' }
}

const URL_RE = /(https?:\/\/[^\s<>"')]+[^\s<>"')\].,;:!?])/g

export type TextPart = { type: 'text' | 'link'; value: string }

/** Linkify http(s) URLs only; everything else stays text (rendered by React, never as HTML). */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const idx = m.index ?? 0
    if (idx > last) parts.push({ type: 'text', value: text.slice(last, idx) })
    parts.push({ type: 'link', value: m[0] })
    last = idx + m[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts
}

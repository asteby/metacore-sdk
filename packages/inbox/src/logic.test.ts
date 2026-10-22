import { describe, expect, it } from 'vitest'
import { computeRange } from './use-virtual-list'
import { groupMessages, linkify, splitQuoted } from './thread-utils'
import { markdownToHtml, prefixLines, wrapSelection } from './rich-text'
import { formatBytes, formatListTime } from './utils'
import { matchShortcut, formatCombo } from './shortcuts'
import type { ThreadMessage } from './types'

describe('computeRange', () => {
  it('mounts only the window for 100k rows', () => {
    const r = computeRange(100_000, 76, 76 * 5000, 600, 6)
    expect(r.end - r.start).toBeLessThan(25)
    expect(r.start).toBe(5000 - 6)
    expect(r.totalSize).toBe(7_600_000)
  })
  it('clamps at both ends and handles empty', () => {
    expect(computeRange(10, 50, 0, 200, 2)).toMatchObject({ start: 0, end: 6 })
    expect(computeRange(10, 50, 9999, 200, 2).end).toBe(10)
    expect(computeRange(0, 50, 0, 200, 2)).toEqual({ start: 0, end: 0, totalSize: 0 })
  })
})

const msg = (id: string, who: string, at: string, dir: 'in' | 'out' = 'in'): ThreadMessage => ({ id, direction: dir, sender: { address: who }, sentAt: at, text: id })

describe('groupMessages', () => {
  it('groups same sender within the window and splits otherwise', () => {
    const g = groupMessages([
      msg('1', 'a', '2026-10-22T10:00:00Z'),
      msg('2', 'a', '2026-10-22T10:02:00Z'),
      msg('3', 'a', '2026-10-22T11:00:00Z'),
      msg('4', 'b', '2026-10-22T11:01:00Z'),
      msg('5', 'b', '2026-10-22T11:02:00Z', 'out'),
    ])
    expect(g.map((x) => x.messages.map((m) => m.id))).toEqual([['1', '2'], ['3'], ['4'], ['5']])
  })
  it('a negative window disables grouping', () => {
    expect(groupMessages([msg('1', 'a', '2026-10-22T10:00:00Z'), msg('2', 'a', '2026-10-22T10:00:01Z')], -1)).toHaveLength(2)
  })
})

describe('splitQuoted', () => {
  it('cuts at the attribution line (en/es)', () => {
    expect(splitQuoted('Gracias\n\nOn Mon, Oct 5, 2026 at 10:00 AM Ana <a@x.com> wrote:\n> hola')).toEqual({
      body: 'Gracias',
      quoted: 'On Mon, Oct 5, 2026 at 10:00 AM Ana <a@x.com> wrote:\n> hola',
    })
    expect(splitQuoted('Listo\nEl lun, 5 oct 2026 10:00, Ana escribió:\n> hola').body).toBe('Listo')
  })
  it('cuts at a trailing > block and leaves clean text alone', () => {
    expect(splitQuoted('ok\n> viejo\n> mas').body).toBe('ok')
    expect(splitQuoted('a > b is true\nfine')).toEqual({ body: 'a > b is true\nfine', quoted: '' })
  })
})

describe('linkify', () => {
  it('extracts http(s) urls without trailing punctuation and ignores others', () => {
    expect(linkify('ve a https://a.com/x?y=1, o javascript:alert(1)')).toEqual([
      { type: 'text', value: 've a ' },
      { type: 'link', value: 'https://a.com/x?y=1' },
      { type: 'text', value: ', o javascript:alert(1)' },
    ])
  })
})

describe('rich text', () => {
  it('renders the safe subset and escapes everything else', () => {
    expect(markdownToHtml('**hi** *there* <script>x</script>')).toBe('<p><strong>hi</strong> <em>there</em> &lt;script&gt;x&lt;/script&gt;</p>')
    expect(markdownToHtml('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>')
    expect(markdownToHtml('> q')).toBe('<blockquote>q</blockquote>')
  })
  it('only allows http/https/mailto links', () => {
    expect(markdownToHtml('[x](https://a.com)')).toContain('<a href="https://a.com">x</a>')
    expect(markdownToHtml('[x](javascript:alert(1))')).not.toContain('<a')
  })
  it('wraps and prefixes selections', () => {
    expect(wrapSelection('hola mundo', 5, 10, '**')).toEqual({ text: 'hola **mundo**', selStart: 7, selEnd: 12 })
    expect(prefixLines('a\nb\nc', 0, 3, '- ').text).toBe('- a\n- b\nc')
  })
})

describe('shortcuts', () => {
  const ev = (o: Partial<KeyboardEvent>) => ({ key: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...o })
  it('matches plain keys, ignores shifted letters and modifiers', () => {
    expect(matchShortcut(ev({ key: 'j' }), 'j', false)).toBe(true)
    expect(matchShortcut(ev({ key: 'J', shiftKey: true }), 'j', false)).toBe(false)
    expect(matchShortcut(ev({ key: 'j', ctrlKey: true }), 'j', false)).toBe(false)
  })
  it('matches symbols with shift and mod+enter per platform', () => {
    expect(matchShortcut(ev({ key: '#', shiftKey: true }), '#', false)).toBe(true)
    expect(matchShortcut(ev({ key: 'Enter', ctrlKey: true }), 'mod+enter', false)).toBe(true)
    expect(matchShortcut(ev({ key: 'Enter', metaKey: true }), 'mod+enter', true)).toBe(true)
    expect(matchShortcut(ev({ key: 'Enter', metaKey: true }), 'mod+enter', false)).toBe(false)
  })
  it('formats combos', () => {
    expect(formatCombo('mod+enter', true)).toBe('⌘↩')
    expect(formatCombo('mod+enter', false)).toBe('Ctrl+Enter')
  })
})

describe('formatting', () => {
  it('bytes and list time', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatListTime('nope', 'es')).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { PhoneLink, WhatsAppBubble } from './index.js'

describe('contact components without JavaScript (server render)', () => {
  it('renders the bubble as a plain link with its glyph', () => {
    const html = renderToString(<WhatsAppBubble phone="+525551046865" message="Hola" />)
    expect(html).toMatch(/<a [^>]*href="https:\/\/wa\.me\/525551046865\?text=Hola"/)
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('<svg')
  })
  it('renders the phone as a tel: link', () => {
    expect(renderToString(<PhoneLink phone="+52 55 5104 6865" />)).toMatch(/href="tel:\+525551046865"/)
  })
  it('renders nothing without a number or on a hidden path', () => {
    expect(renderToString(<WhatsAppBubble phone={undefined} />)).toBe('')
    expect(renderToString(<PhoneLink phone={null} />)).toBe('')
    expect(renderToString(<WhatsAppBubble phone="+525551046865" pathname="/pagar" hideOn={['/pagar']} />)).toBe('')
  })
})

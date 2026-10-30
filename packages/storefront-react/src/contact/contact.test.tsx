// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import axe from 'axe-core'
import { PhoneLink, WhatsAppBubble, isHiddenPath, isUsablePhone, phoneDigits, telHref, whatsappUrl } from './index.js'

afterEach(cleanup)
const AXE = { rules: { 'color-contrast': { enabled: false } } }

describe('whatsappUrl / telHref / phoneDigits', () => {
  it('keeps only digits and builds the wa.me link', () => {
    expect(phoneDigits('+52 55 5104 6865')).toBe('525551046865')
    expect(whatsappUrl('+525551046865')).toBe('https://wa.me/525551046865')
    expect(whatsappUrl('+52 (55) 5104-6865')).toBe('https://wa.me/525551046865')
  })
  it('encodes the pre-filled text and ignores an empty one', () => {
    expect(whatsappUrl('+525551046865', 'Hola, ¿tienen bujías? & filtros')).toBe(
      'https://wa.me/525551046865?text=Hola%2C%20%C2%BFtienen%20buj%C3%ADas%3F%20%26%20filtros',
    )
    expect(whatsappUrl('+525551046865', '   ')).toBe('https://wa.me/525551046865')
    expect(whatsappUrl('+525551046865', '')).toBe('https://wa.me/525551046865')
  })
  it('is null when the number is empty, missing or shorter than 8 digits', () => {
    for (const bad of ['', '   ', null, undefined, 'abc', '1234567', '+52 55']) {
      expect(whatsappUrl(bad)).toBeNull()
      expect(telHref(bad)).toBeNull()
      expect(isUsablePhone(bad)).toBe(false)
    }
  })
  it('keeps the leading + in tel:', () => {
    expect(telHref('+52 55 5104 6865')).toBe('tel:+525551046865')
    expect(telHref('55 5104 6865')).toBe('tel:5551046865')
  })
})

describe('isHiddenPath', () => {
  it('matches the path and its children at a segment boundary', () => {
    expect(isHiddenPath('/pagar', ['/pagar'])).toBe(true)
    expect(isHiddenPath('/pagar/gracias', ['/pagar'])).toBe(true)
    expect(isHiddenPath('/pagar/', ['/pagar'])).toBe(true)
    expect(isHiddenPath('/pagarx', ['/pagar'])).toBe(false)
    expect(isHiddenPath('/colecciones/frenos', ['/pagar'])).toBe(false)
  })
  it('accepts a RegExp, a trailing slash in the rule and query strings', () => {
    expect(isHiddenPath('/pagar?x=1', ['/pagar/'])).toBe(true)
    expect(isHiddenPath('/cuenta/pedidos/7', [/^\/cuenta\//])).toBe(true)
    expect(isHiddenPath('/', ['/'])).toBe(true)
  })
  it('shows the bubble when there is no pathname or no rules', () => {
    expect(isHiddenPath(undefined, ['/pagar'])).toBe(false)
    expect(isHiddenPath('/pagar', undefined)).toBe(false)
    expect(isHiddenPath('/pagar', [])).toBe(false)
  })
})

describe('<WhatsAppBubble />', () => {
  it('is a link that opens in a new tab with safe rel, a name and no visible text', () => {
    const { container } = render(<WhatsAppBubble phone="+525551046865" />)
    const a = container.querySelector('a[data-sf-whatsapp-bubble]') as HTMLAnchorElement
    expect(a).toBeTruthy()
    expect(a.getAttribute('href')).toBe('https://wa.me/525551046865?text=Hola%2C%20necesito%20ayuda%20con%20mi%20compra.')
    expect(a.target).toBe('_blank')
    expect(a.rel).toContain('noopener')
    expect(a.rel).toContain('noreferrer')
    expect(a.getAttribute('aria-label')).toBe('Escríbenos por WhatsApp')
    expect(a.textContent).toBe('')
    expect(a.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
  it('renders nothing without a usable number', () => {
    for (const phone of [undefined, null, '', '12']) {
      const { container, unmount } = render(<WhatsAppBubble phone={phone} />)
      expect(container.innerHTML).toBe('')
      unmount()
    }
  })
  it('uses English texts, a custom message/label, the position and the offset', () => {
    const { container } = render(<WhatsAppBubble phone="+14155550123" locale="en-US" message="Order 12" position="bottom-left" offset={72} />)
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a.getAttribute('aria-label')).toBe('Chat with us on WhatsApp')
    expect(a.getAttribute('href')).toBe('https://wa.me/14155550123?text=Order%2012')
    expect(a.dataset.position).toBe('bottom-left')
    expect(a.style.getPropertyValue('--sf-whatsapp-offset')).toBe('72px')
    const b = render(<WhatsAppBubble phone="+14155550123" label="Chat" message="" />).container.querySelector('a') as HTMLAnchorElement
    expect(b.getAttribute('aria-label')).toBe('Chat')
    expect(b.getAttribute('href')).toBe('https://wa.me/14155550123')
  })
  it('hides itself on the listed paths only', () => {
    const on = render(<WhatsAppBubble phone="+525551046865" pathname="/pagar/gracias" hideOn={['/pagar']} />)
    expect(on.container.innerHTML).toBe('')
    on.unmount()
    const off = render(<WhatsAppBubble phone="+525551046865" pathname="/colecciones" hideOn={['/pagar']} />)
    expect(off.container.querySelector('a')).toBeTruthy()
  })
  it('passes axe', async () => {
    const { container } = render(<WhatsAppBubble phone="+525551046865" />)
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })
})

describe('<PhoneLink />', () => {
  it('renders a tel: link with the number as text and a spoken name', () => {
    const { container } = render(<PhoneLink phone="+52 55 5104 6865" />)
    const a = container.querySelector('a[data-sf-phone-link]') as HTMLAnchorElement
    expect(a.getAttribute('href')).toBe('tel:+525551046865')
    expect(a.textContent).toBe('+52 55 5104 6865')
    expect(a.getAttribute('aria-label')).toBe('Llámanos al +52 55 5104 6865')
  })
  it('accepts custom children, passes other attributes and renders nothing without a number', () => {
    const { container } = render(<PhoneLink phone="+525551046865" className="x" data-testid="t">Llamar</PhoneLink>)
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a.textContent).toBe('Llamar')
    expect(a.className).toBe('x')
    cleanup()
    expect(render(<PhoneLink phone="" />).container.innerHTML).toBe('')
  })
  it('passes axe', async () => {
    const { container } = render(<PhoneLink phone="+525551046865" />)
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })
})

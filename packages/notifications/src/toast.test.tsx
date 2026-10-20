// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { showNotificationToast } from './toast'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderToast(opts: Parameters<typeof showNotificationToast>[0]) {
  const custom = vi.spyOn(toast, 'custom').mockImplementation(() => 'x')
  showNotificationToast(opts)
  const factory = custom.mock.calls[0]![0] as (id: string | number) => ReactElement
  return render(factory('tid'))
}

describe('showNotificationToast body', () => {
  const hostile = '<img src=x onerror=alert(1)>plain <b>b</b>'

  it('sanitizes rich text by default', () => {
    const { container } = renderToast({ title: 'T', body: hostile })
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')?.textContent).toBe('b')
  })

  it('richText=false paints plain escaped text', () => {
    const { container } = renderToast({ title: 'T', body: hostile, richText: false })
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toContain(hostile)
  })

  it('delegates the card click to onClick', () => {
    const onClick = vi.fn()
    const { container } = renderToast({ title: 'T', onClick })
    ;(container.querySelector('button') as HTMLButtonElement).click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  describe('multi-line bodies', () => {
    const bodyEl = (c: HTMLElement) =>
      Array.from(c.querySelectorAll('span.text-xs')).find((n) =>
        n.className.includes('text-muted-foreground'),
      ) as HTMLElement

    it('one-line body keeps line-clamp-2 and no pre-line', () => {
      for (const richText of [true, false]) {
        const { container } = renderToast({ title: 'T', body: 'una sola línea', richText })
        const el = bodyEl(container)
        expect(el.className).toContain('line-clamp-2')
        expect(el.className).not.toContain('whitespace-pre-line')
        expect(el.className).not.toContain('line-clamp-6')
        cleanup()
        vi.restoreAllMocks()
      }
    })

    it('3-line body gets pre-line + line-clamp-6 in plain and HTML', () => {
      for (const richText of [true, false]) {
        const { container } = renderToast({ title: 'T', body: 'a\nb\nc', richText })
        const el = bodyEl(container)
        expect(el.className).toContain('whitespace-pre-line')
        expect(el.className).toContain('line-clamp-6')
        expect(el.className).not.toContain('line-clamp-2')
        expect(el.textContent).toBe('a\nb\nc')
        cleanup()
        vi.restoreAllMocks()
      }
    })

    it('hostile multi-line HTML stays neutralized', () => {
      const { container } = renderToast({
        title: 'T',
        body: '<img src=x onerror=alert(1)>\n<b/onclick=alert(2)>x',
      })
      expect(container.querySelector('img')).toBeNull()
      const all = Array.from(container.querySelectorAll('*'))
      for (const n of all) {
        expect(n.getAttributeNames().some((a) => a.startsWith('on'))).toBe(false)
      }
      expect(bodyEl(container).className).toContain('whitespace-pre-line')
    })

    it('escapes < and & from server text', () => {
      const { container } = renderToast({ title: 'T', body: 'a < b & c\nlinea 2' })
      const el = bodyEl(container)
      expect(el.innerHTML).toContain('&lt;')
      expect(el.innerHTML).toContain('&amp;')
      expect(el.textContent).toBe('a < b & c\nlinea 2')
    })
  })
})

describe('showNotificationToast layout', () => {
  const bodyEl = (c: HTMLElement) =>
    Array.from(c.querySelectorAll('span.text-xs')).find((n) =>
      n.className.includes('text-muted-foreground'),
    ) as HTMLElement

  it('body span has no `block` that would cancel line-clamp', () => {
    for (const richText of [true, false]) {
      const { container } = renderToast({ title: 'T', body: 'texto', richText })
      const classes = bodyEl(container).className.split(/\s+/)
      expect(classes).toContain('line-clamp-2')
      expect(classes).not.toContain('block')
      cleanup()
      vi.restoreAllMocks()
    }
  })

  it('wraps a long title (up to 3 lines, no one-line ellipsis) and keeps the tooltip', () => {
    const long = 'No se pudo verificar la conexión: Mercado Pago respondió HTTP 403 '.repeat(3).trim()
    const { getByText } = renderToast({ title: long })
    const el = getByText(long)
    expect(el.className).not.toContain('truncate')
    expect(el.className).toContain('line-clamp-3')
    expect(el.className).toContain('break-words')
    expect(el.getAttribute('title')).toBe(long)
  })

  it('summary replaces the body as escaped plain text', () => {
    const { container } = renderToast({
      title: 'T',
      body: 'cuerpo completo <b>x</b>',
      summary: 'Resumen <i>breve</i>',
    })
    const el = bodyEl(container)
    expect(el.textContent).toBe('Resumen <i>breve</i>')
    expect(container.querySelector('i')).toBeNull()
    expect(container.textContent).not.toContain('cuerpo completo')
  })
})

describe('showNotificationToast actions', () => {
  it('renders extra actions; each runs its handler and dismisses', () => {
    const dismiss = vi.spyOn(toast, 'dismiss').mockImplementation(() => 'x')
    const a = vi.fn()
    const b = vi.fn()
    const { getByText, container } = renderToast({
      title: 'T',
      actions: [
        { label: 'Ver evidencia', onClick: a },
        { label: 'Asignar', onClick: b },
      ],
    })
    // With actions the card is a div (no nested buttons inside a button).
    expect(container.firstElementChild?.tagName).toBe('DIV')
    ;(getByText('Asignar') as HTMLButtonElement).click()
    expect(b).toHaveBeenCalledTimes(1)
    expect(a).not.toHaveBeenCalled()
    expect(dismiss).toHaveBeenCalledWith('tid')
  })
})

describe('showNotificationToast focus pause', () => {
  it('pauses the auto-close while focused and restores it on blur', () => {
    const custom = vi.spyOn(toast, 'custom').mockImplementation(() => 'x')
    showNotificationToast({ title: 'T', duration: 4000, id: 'n1' })
    const factory = custom.mock.calls[0]![0] as (id: string | number) => ReactElement
    expect(custom.mock.calls[0]![1]).toMatchObject({ id: 'n1', duration: 4000 })
    const { container } = render(factory('n1'))
    const card = container.querySelector('button') as HTMLButtonElement

    card.focus()
    expect(custom).toHaveBeenCalledTimes(2)
    expect(custom.mock.calls[1]![1]).toMatchObject({ id: 'n1', duration: Infinity })

    card.blur()
    expect(custom).toHaveBeenCalledTimes(3)
    expect(custom.mock.calls[2]![1]).toMatchObject({ id: 'n1', duration: 4000 })
  })
})

// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PaymentOutcome } from '@asteby/storefront'
import { PaymentChallenge } from './payment-brick.js'

const outcome = { kind: 'challenge', challenge: { url: 'https://acs.test/c' } } as unknown as PaymentOutcome

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PaymentChallenge lock', () => {
  it('ignores Esc and backdrop clicks, and shows the exit only after the delay', () => {
    vi.useFakeTimers()
    const onCancel = vi.fn()
    const { container } = render(<PaymentChallenge outcome={outcome} onCancel={onCancel} escapeAfterMs={120_000} />)
    const dlg = container.querySelector('dialog[data-sf-challenge]') as HTMLDialogElement
    expect(dlg.open).toBe(true)
    fireEvent(dlg, new Event('cancel', { cancelable: true }))
    fireEvent.click(dlg)
    expect(dlg.open).toBe(true)
    expect(onCancel).not.toHaveBeenCalled()
    expect(container.querySelector('[data-sf-challenge-escape] button')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(120_001)
    })
    const btn = container.querySelector('[data-sf-challenge-escape] button') as HTMLButtonElement
    expect(btn.textContent).toBe('Cancelar y volver al pago')
    fireEvent.click(btn)
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('la salida aparece por defecto a los 20 s (una página 5xx del banco no atrapa al comprador minutos) y su texto es accionable', () => {
    vi.useFakeTimers()
    const { container } = render(<PaymentChallenge outcome={outcome} onCancel={() => {}} />)
    expect(container.querySelector('[data-sf-challenge-escape] button')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(19_999)
    })
    expect(container.querySelector('[data-sf-challenge-escape] button')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(2)
    })
    expect(container.querySelector('[data-sf-challenge-escape] button')).not.toBeNull()
    const hint = container.querySelector('[data-sf-challenge-escape] p')?.textContent ?? ''
    expect(hint).toMatch(/error/i)
    expect(hint).toMatch(/nunca se cobra dos veces/i)
  })

  it('el iframe no fija un alto en línea: el alto lo reparte el CSS para que la salida no se recorte en pantallas bajas', () => {
    const { container } = render(<PaymentChallenge outcome={outcome} onCancel={() => {}} />)
    const frame = container.querySelector('iframe[data-sf-challenge-frame]') as HTMLIFrameElement
    expect(frame.style.minHeight).toBe('')
  })
})


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
    expect(container.querySelector('[data-sf-challenge-escape]')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(120_001)
    })
    const btn = container.querySelector('[data-sf-challenge-escape] button') as HTMLButtonElement
    expect(btn.textContent).toBe('Cancelar y volver al pago')
    fireEvent.click(btn)
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

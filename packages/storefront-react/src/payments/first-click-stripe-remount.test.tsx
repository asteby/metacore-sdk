// @vitest-environment happy-dom
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PaymentAttemptResult, PaymentClient } from '@asteby/storefront'
import { stripeElementsAdapter, useEmbeddedPayment, type EmbeddedPaymentState, type StripeFactory } from './index.js'

afterEach(() => cleanup())

const client: PaymentClient = { kind: 'stripe_elements', sdk_url: 'https://js.stripe.com/v3', public_key: 'pk_test_x', test_mode: true, options: [{ key: 'card', redirect: false }] }
const paid: PaymentAttemptResult = { payment: { provider: 'stripe', status: 'paid', outcome: 'approved' } }

/** Stripe.js falso: los campos ya estan completos (los iframes lo avisan) y `elements.update` falla o tarda segun el caso. */
function fakeStripe(o: { updateFails?: boolean; updateSlow?: boolean; slowToken?: boolean } = {}) {
  const handlers: Record<string, Array<() => void>> = {}
  const element = {
    mount: vi.fn(() => queueMicrotask(() => handlers.ready?.forEach((h) => h()))),
    on: (ev: string, h: () => void) => void (handlers[ev] ??= []).push(h),
    destroy: vi.fn(),
  }
  let releaseUpdate: () => void = () => {}
  let releaseToken: () => void = () => {}
  let tokens = 0
  const elements = {
    create: () => element,
    update: vi.fn((): Promise<void> | undefined => (o.updateFails ? Promise.reject(new Error('update')) : o.updateSlow ? new Promise<void>((r) => (releaseUpdate = r)) : undefined)),
    submit: vi.fn(async () => ({})),
  }
  const stripe = {
    elements: () => elements,
    createConfirmationToken: vi.fn(async () => {
      if (o.slowToken && ++tokens === 1) await new Promise<void>((r) => (releaseToken = r))
      return { confirmationToken: { id: 'ctoken_1' } }
    }),
    handleNextAction: vi.fn(),
  }
  return { factory: (() => stripe) as unknown as StripeFactory, elements, stripe, releaseUpdate: () => releaseUpdate(), releaseToken: () => releaseToken() }
}

function setup(f: ReturnType<typeof fakeStripe>) {
  const submit = vi.fn(async () => paid)
  const h = { current: null as EmbeddedPaymentState | null }
  const adapter = stripeElementsAdapter({ getSdk: () => f.factory, collectRetryDelayMs: 1 })
  adapter.load = async () => {}
  function C({ amount, pk = 'pk_test_x' }: { amount: string; pk?: string }) {
    const s = useEmbeddedPayment({ client: { ...client, public_key: pk }, amount: { amount, currency_code: 'MXN' }, transport: { submit }, adapter, sdkTimeoutMs: 2000, storage: null })
    h.current = s
    return <div ref={s.containerRef} />
  }
  const r = render(<C amount="100.00" />)
  return { h, submit, setTotal: (amount: string) => r.rerender(<C amount={amount} />), setKey: (pk: string) => r.rerender(<C amount="100.00" pk={pk} />) }
}

describe('Stripe: el primer clic en PAGAR con la tarjeta ya llena no se pierde si el formulario se reconstruye', () => {
  it('clic mientras el total cambia y elements.update falla (remonta): el pago sale solo, en el primer clic, una vez', async () => {
    const f = fakeStripe({ updateFails: true })
    const { h, submit, setTotal } = setup(f)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    setTotal('120.00')
    let pressed: Promise<void> = Promise.resolve()
    await act(async () => {
      pressed = h.current!.submit()
    })
    await act(async () => void (await pressed))
    await waitFor(() => expect(h.current?.status).toBe('approved'))
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('clic mientras el total cambia con update lento: espera al update y cobra con el mismo formulario', async () => {
    const f = fakeStripe({ updateSlow: true })
    const { h, submit, setTotal } = setup(f)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    setTotal('120.00')
    let pressed: Promise<void> = Promise.resolve()
    await act(async () => {
      pressed = h.current!.submit()
    })
    await act(async () => {
      f.releaseUpdate()
      await pressed
    })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(f.elements.update).toHaveBeenCalledTimes(1)
  })

  it('el formulario se reconstruye mientras se crea el token: el clic no muere en "idle", se repite sobre el nuevo', async () => {
    const f = fakeStripe({ slowToken: true })
    const { h, submit, setKey } = setup(f)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    let pressed: Promise<void> = Promise.resolve()
    await act(async () => {
      pressed = h.current!.submit()
    })
    await waitFor(() => expect(f.stripe.createConfirmationToken).toHaveBeenCalledTimes(1))
    // el formulario se reconstruye bajo el clic (cambia el cliente de pago, p. ej. al recargar los metodos)
    await act(async () => {
      setKey('pk_test_y')
    })
    await act(async () => {
      f.releaseToken()
    })
    await act(async () => void (await pressed))
    // lo que no puede pasar: quedarse en idle sin enviar ni avisar
    await waitFor(() => expect(h.current?.status).toBe('approved'))
    expect(submit).toHaveBeenCalledTimes(1)
  })
})

describe('Stripe: tras cambiar el total (envio) Stripe aun se sincroniza y el primer elements.submit() falla', () => {
  /** Stripe.js falso con la ventana real: tras `elements.update`, el primer `submit()` falla sin ser un error de campos. */
  function syncingStripe(kind: 'transient' | 'validation') {
    const f = fakeStripe()
    let syncing = false
    f.elements.update.mockImplementation((() => {
      syncing = true
      return undefined
    }) as never)
    f.elements.submit.mockImplementation((async () => {
      if (kind === 'validation') return { error: { type: 'validation_error', code: 'incomplete_number' } }
      if (syncing) {
        syncing = false
        return { error: { type: 'invalid_request_error', code: 'elements_update_in_progress' } }
      }
      return {}
    }) as never)
    return f
  }

  it('el primer clic envia el pago (se relee una vez la condicion transitoria)', async () => {
    const f = syncingStripe('transient')
    const { h, submit, setTotal } = setup(f)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    setTotal('149.99')
    await waitFor(() => expect(f.elements.update).toHaveBeenCalled())
    await act(async () => void (await h.current!.submit()))
    await waitFor(() => expect(h.current?.status).toBe('approved'))
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('si los campos no estan completos no se envia nada y el error es visible (nunca mudo)', async () => {
    const f = syncingStripe('validation')
    const { h, submit, setTotal } = setup(f)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    setTotal('149.99')
    await waitFor(() => expect(f.elements.update).toHaveBeenCalled())
    await act(async () => void (await h.current!.submit()))
    expect(submit).not.toHaveBeenCalled()
    expect(f.elements.submit).toHaveBeenCalledTimes(1) // un error de campos no se relee
    expect(h.current?.status).toBe('ready')
    expect(h.current?.error?.message).toBeTruthy()
  })
})

describe('un clic sin formulario utilizable nunca queda mudo', () => {
  it('estado idle: no se envia nada y se muestra un error', async () => {
    const submit = vi.fn(async () => paid)
    const h = { current: null as EmbeddedPaymentState | null }
    function C() {
      const s = useEmbeddedPayment({ client, amount: { amount: '10.00', currency_code: 'MXN' }, transport: { submit }, enabled: false, storage: null })
      h.current = s
      return <div ref={s.containerRef} />
    }
    render(<C />)
    expect(h.current?.status).toBe('idle')
    await act(async () => void (await h.current!.submit()))
    expect(submit).not.toHaveBeenCalled()
    expect(h.current?.error?.message).toBeTruthy()
  })
})

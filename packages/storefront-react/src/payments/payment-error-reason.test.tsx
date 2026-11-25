// @vitest-environment happy-dom
//
// El comprador (y quien da soporte) debe ver el MOTIVO de un pago fallido, no un mensaje de tarjeta que culpa a la tarjeta de,
// por ejemplo, un teléfono mal escrito. El servidor ya clasificaba el error y mandaba `kind`, `field` y `message`, pero el
// navegador los tiraba y todo salía como «generic» (y vaciaba el formulario de la tarjeta).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { paymentErrorView, type Money, type PaymentAttemptResult, type PaymentClient } from '@asteby/storefront'
import {
  PaymentHttpError,
  createFetchTransport,
  mercadoPagoBricksAdapter,
  payErrorResponse,
  useEmbeddedPayment,
  type EmbeddedPaymentState,
  type MercadoPagoCtor,
  type PaymentTransport,
} from './index.js'
import { validationFieldMessage } from './recovery-messages.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const OPS_PHONE = 'el teléfono debe tener 10 dígitos (sin lada internacional)'

describe('validationFieldMessage', () => {
  it('dice cómo corregir el campo en el idioma de la tienda', () => {
    expect(validationFieldMessage('en-US', 'phone')).toMatch(/10-digit phone number, without the country code/)
    expect(validationFieldMessage('es-MX', 'phone')).toMatch(/10 dígitos, sin lada internacional/)
  })
  it('acepta rutas y sinónimos del campo (shipping_address.phone, zip, first_name…)', () => {
    expect(validationFieldMessage('en', 'shipping_address.phone')).toBe(validationFieldMessage('en', 'phone'))
    expect(validationFieldMessage('en', 'buyer.phone')).toBe(validationFieldMessage('en', 'phone'))
    expect(validationFieldMessage('en', 'zip')).toBe(validationFieldMessage('en', 'postal_code'))
    expect(validationFieldMessage('es', 'first_name')).toBe(validationFieldMessage('es', 'name'))
  })
  it('un campo desconocido o vacío no inventa nada', () => {
    expect(validationFieldMessage('en', 'something_else')).toBeUndefined()
    expect(validationFieldMessage('en', '')).toBeUndefined()
    expect(validationFieldMessage('en', null)).toBeUndefined()
  })
})

describe('payErrorResponse — el motivo viaja al navegador', () => {
  it('un teléfono rechazado por OPS sale clasificado como validation, con su campo y el texto en el idioma de la tienda', () => {
    const { status, body } = payErrorResponse({ status: 400, code: 'validation', field: 'phone', message: OPS_PHONE }, { locale: 'en-US' })
    expect(status).toBe(400)
    expect(body.error.kind).toBe('validation')
    expect(body.error.field).toBe('phone')
    expect(body.error.message).toMatch(/Enter your 10-digit phone number/)
    expect(body.error.message).not.toMatch(/teléfono/)
  })
  it('un campo sin texto propio conserva el de OPS (como antes)', () => {
    const { body } = payErrorResponse({ status: 422, code: 'validation', field: 'tax_id', message: 'RFC inválido' }, { locale: 'en-US' })
    expect(body.error.message).toBe('RFC inválido')
    expect(body.error.field).toBe('tax_id')
  })
  it('un texto escrito por la propia tienda (ownMessage) sigue ganando', () => {
    const { body } = payErrorResponse({ status: 400, code: 'validation', field: 'phone', message: 'Mensaje de la tienda' }, { locale: 'en-US', ownMessage: true })
    expect(body.error.message).toBe('Mensaje de la tienda')
  })
})

describe('createFetchTransport + paymentErrorView — el navegador ya no tira el motivo', () => {
  async function failWith(error: Record<string, unknown>, status = 400) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json' } }))
    const transport = createFetchTransport('/pay', { fetch: fetchMock as unknown as typeof fetch })
    try {
      await transport.submit({ option: 'card', attempt: 'a1', idempotencyKey: 'a1', provider_data: {}, expected_total: { amount: '1.00', currency_code: 'USD' } } as never, { signal: new AbortController().signal } as never)
    } catch (e) {
      return e as PaymentHttpError
    }
    throw new Error('debía fallar')
  }

  it('PaymentHttpError conserva el field del servidor', async () => {
    const err = await failWith({ code: 'validation', kind: 'validation', field: 'phone', message: 'Enter your 10-digit phone number.', retryable: false })
    expect(err.field).toBe('phone')
    expect(err.kind).toBe('validation')
  })

  it('un validation se muestra como validation, con SU mensaje y SU campo (no «generic»)', async () => {
    const err = await failWith({ code: 'validation', kind: 'validation', field: 'phone', message: 'Enter your 10-digit phone number.', retryable: false })
    const view = paymentErrorView(err, 'en-US')
    expect(view.kind).toBe('validation')
    expect(view.message).toBe('Enter your 10-digit phone number.')
    expect(view.field).toBe('phone')
    expect(view.canRetry).toBe(true)
    expect(view.retrySameAttempt).toBe(false)
  })

  it('validation sin texto del servidor usa el del catálogo', () => {
    const view = paymentErrorView({ status: 400, code: 'validation' }, 'en-US')
    expect(view.kind).toBe('validation')
    expect(view.message).toMatch(/Check the highlighted details/)
  })

  it('provider_declined y merchant_config muestran su motivo, el segundo sin reintento', () => {
    const declined = paymentErrorView({ status: 422, code: 'payment_provider_rejected', kind: 'provider_declined', message: 'Tu banco rechazó el pago.' }, 'es')
    expect(declined).toMatchObject({ kind: 'provider_declined', message: 'Tu banco rechazó el pago.', canRetry: true })
    const config = paymentErrorView({ status: 503, code: 'unavailable', kind: 'merchant_config' }, 'en')
    expect(config.kind).toBe('merchant_config')
    expect(config.message).toMatch(/not a problem with your card/)
    expect(config.canRetry).toBe(false)
  })

  it('lo que no sabe clasificar sigue cayendo en generic (sin regresión)', () => {
    expect(paymentErrorView({ status: 418, code: 'teapot' }, 'en').kind).toBe('generic')
    expect(paymentErrorView({ status: 409, code: 'conflict' }, 'en').kind).toBe('generic')
  })
})

// ───────── el hook: un validation no vacía el formulario de la tarjeta ─────────
const client: PaymentClient = { kind: 'mercadopago_bricks', sdk_url: 'https://sdk.mercadopago.com/js/v2', public_key: 'APP_USR-test', options: [{ key: 'card', redirect: false }] }
const money = (n: number): Money => ({ amount: n.toFixed(2), currency_code: 'USD' })
const approved: PaymentAttemptResult = { payment: { provider: 'mp', status: 'paid', outcome: 'approved' } }

function fakeSdk() {
  const log = { creates: 0, unmounts: 0 }
  class MP {
    bricks() {
      return {
        create: async (_b: string, _id: string, settings: { callbacks?: { onReady?: () => void } }) => {
          log.creates++
          queueMicrotask(() => settings.callbacks?.onReady?.())
          return { getFormData: async () => ({ token: 'tok_1', payment_method_id: 'visa', installments: 1 }), unmount: async () => void log.unmounts++ }
        },
      }
    }
  }
  return { log, ctor: MP as unknown as MercadoPagoCtor }
}

function Harness({ holder, transport, ctor }: { holder: { current: EmbeddedPaymentState | null }; transport: PaymentTransport; ctor: MercadoPagoCtor }) {
  const state = useEmbeddedPayment({
    client,
    amount: money(1),
    transport,
    adapter: mercadoPagoBricksAdapter({ getSdk: () => ctor, deviceWaitMs: 0 }),
    storage: null,
    sdkTimeoutMs: 2000,
  })
  holder.current = state
  return <div ref={state.containerRef} />
}

async function pay(transport: PaymentTransport) {
  const sdk = fakeSdk()
  const holder = { current: null as EmbeddedPaymentState | null }
  render(<Harness holder={holder} transport={transport} ctor={sdk.ctor} />)
  await waitFor(() => expect(holder.current?.status).toBe('ready'))
  await act(async () => {
    await holder.current!.submit()
  })
  return { sdk, holder }
}

describe('useEmbeddedPayment — un validation dice el motivo y NO vacía el formulario', () => {
  it('muestra el campo y el texto, vuelve a «ready» y NO vuelve a montar el formulario de la tarjeta', async () => {
    const transport: PaymentTransport = {
      submit: vi.fn(async () => {
        throw new PaymentHttpError(400, 'validation', 'Enter your 10-digit phone number, without the country code.', undefined, { kind: 'validation', retryable: false, field: 'phone' })
      }),
    }
    const { sdk, holder } = await pay(transport)
    await waitFor(() => expect(holder.current?.error?.kind).toBe('validation'))
    expect(holder.current?.error?.field).toBe('phone')
    expect(holder.current?.error?.message).toMatch(/10-digit phone number/)
    expect(holder.current?.status).toBe('ready')
    expect(sdk.log.creates).toBe(1) // el formulario de la tarjeta sigue como lo dejó el comprador
    expect(sdk.log.unmounts).toBe(0)
  })

  it('un error que sí es desconocido sigue reiniciando el formulario (comportamiento anterior)', async () => {
    const transport: PaymentTransport = {
      submit: vi.fn(async () => {
        throw new PaymentHttpError(418, 'teapot', 'no sé', undefined, { retryable: false })
      }),
    }
    const { sdk, holder } = await pay(transport)
    await waitFor(() => expect(holder.current?.error?.kind).toBe('generic'))
    await waitFor(() => expect(sdk.log.creates).toBe(2))
  })

  it('un pago aprobado no muestra error', async () => {
    const { holder } = await pay({ submit: async () => approved })
    expect(holder.current?.error).toBeNull()
  })
})

import { loadPaymentSdk } from './sdk-loader.js'
import type { MountedPaymentForm, PaymentFormAdapter, PaymentFormData, PaymentFormMountOptions } from './adapter.js'

/** The `PaymentClient.kind` the addon `mercadopago` declares. */
export const MERCADOPAGO_BRICKS_KIND = 'mercadopago_bricks'

type MpController = {
  getFormData(): Promise<Record<string, unknown> | undefined | null>
  unmount(): void | Promise<void>
  /** Card Payment Brick: changes the amount without recreating the form. Absent in old SDK builds. */
  update?(settings: { amount: number }): void | Promise<void>
}
type MpBricks = { create(brick: string, containerId: string, settings: Record<string, unknown>): Promise<MpController> }
export type MercadoPagoCtor = new (publicKey: string, options?: { locale?: string }) => { bricks(): MpBricks }

export type MercadoPagoAdapterOptions = {
  /** Exact origins allowed for `sdk_url`. Default: Mercado Pago's SDK origin only. */
  allowedSdkOrigins?: readonly string[]
  /** Resolves the SDK constructor. Default: `window.MercadoPago`. Inject a fake in tests. */
  getSdk?: () => MercadoPagoCtor | undefined
  /** Reads the anti-fraud device id. Default: `window.MP_DEVICE_SESSION_ID`. */
  getDeviceSessionId?: () => string | undefined
  /** Wait before the single internal re-read of the form data (see `collect`). Default 400. */
  collectRetryDelayMs?: number
}

/**
 * The only fields that may leave the browser, and the only place that decides it. Anything else the SDK returns
 * (notably `transaction_amount`, the amount: the server owns it) is dropped. Strings only, bounded length.
 */
export function sanitizeMercadoPagoFormData(data: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const d = data ?? {}
  const str = (v: unknown, max = 256) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined)
  const out: Record<string, unknown> = {}
  const token = str(d.token, 128)
  if (token) out.token = token
  const pm = str(d.payment_method_id, 64)
  if (pm) out.payment_method_id = pm
  const issuer = typeof d.issuer_id === 'number' ? String(d.issuer_id) : str(d.issuer_id, 32)
  if (issuer) out.issuer_id = issuer
  const inst = typeof d.installments === 'number' ? d.installments : Number.parseInt(String(d.installments ?? ''), 10)
  if (Number.isInteger(inst) && inst >= 1 && inst <= 48) out.installments = inst
  const payer = d.payer as { email?: unknown; identification?: { type?: unknown; number?: unknown } } | undefined
  if (payer && typeof payer === 'object') {
    const p: Record<string, unknown> = {}
    const email = str(payer.email, 254)
    if (email) p.email = email
    const idType = str(payer.identification?.type, 16)
    const idNumber = str(payer.identification?.number, 32)
    if (idType && idNumber) p.identification = { type: idType, number: idNumber }
    if (Object.keys(p).length) out.payer = p
  }
  return out
}

/**
 * Card Payment Brick adapter. The payment button is hidden: the shop's own button calls `collect()` (MP's
 * `getFormData()`), which tokenises inside MP's iframes. Card data never touches this code. `collect()` re-reads the
 * form once if the first read fails, before anything is sent to the shop's server.
 */
export function mercadoPagoBricksAdapter(options: MercadoPagoAdapterOptions = {}): PaymentFormAdapter {
  const allowed = options.allowedSdkOrigins ?? ['https://sdk.mercadopago.com']
  const getSdk =
    options.getSdk ?? (() => (typeof window !== 'undefined' ? (window as unknown as { MercadoPago?: MercadoPagoCtor }).MercadoPago : undefined))
  const retryDelay = options.collectRetryDelayMs ?? 400
  const getDevice =
    options.getDeviceSessionId ?? (() => (typeof window !== 'undefined' ? (window as unknown as { MP_DEVICE_SESSION_ID?: string }).MP_DEVICE_SESSION_ID : undefined))

  return {
    kind: MERCADOPAGO_BRICKS_KIND,
    async load(client, { nonce, timeoutMs }) {
      await loadPaymentSdk(client.sdk_url, { ...(nonce ? { nonce } : {}), timeoutMs, allowedOrigins: allowed, isLoaded: () => !!getSdk() })
      if (!getSdk()) throw new Error('payment sdk: MercadoPago global missing after load')
    },
    async mount(opts: PaymentFormMountOptions): Promise<MountedPaymentForm> {
      const Ctor = getSdk()
      if (!Ctor) throw new Error('payment sdk: not loaded')
      const { client, container } = opts
      const card = client.options?.find((o) => o.key === 'card')
      const mp = new Ctor(client.public_key, { locale: opts.locale ?? client.locale ?? 'es-MX' })
      const amount = Number.parseFloat(opts.amount.amount)
      const controller = await mp.bricks().create('cardPayment', container.id, {
        initialization: { amount, ...(opts.email ? { payer: { email: opts.email } } : {}) },
        customization: {
          paymentMethods: { minInstallments: 1, ...(card?.max_installments ? { maxInstallments: card.max_installments } : {}) },
          visual: {
            hidePaymentButton: true,
            // El encabezado del Brick ("Tarjeta de crédito o débito" + banderas de tarjetas
            // aceptadas) lo dibuja Mercado Pago, repite lo que la tienda ya muestra en su propia
            // fila de método de pago y se veía cortado (p. ej. AMEX partido). hideFormTitle oculta
            // la línea del título y las banderas.
            hideFormTitle: true,
            // Dark page: the Brick's `dark` base theme, so it does not draw a white card; the shop tokens refine it.
            style: { theme: opts.colorScheme === 'dark' ? 'dark' : 'default', ...(opts.theme && Object.keys(opts.theme).length ? { customVariables: opts.theme } : {}) },
          },
        },
        callbacks: {
          onReady: () => opts.onReady(),
          onError: (e: { type?: string; message?: string; cause?: string } | undefined) => {
            opts.onError({ critical: e?.type === 'critical', ...(e?.cause ? { message: String(e.cause) } : {}) })
          },
          onSubmit: async () => undefined,
        },
      })
      let gone = false
      return {
        async collect(): Promise<PaymentFormData> {
          if (gone) throw new Error('payment form is unmounted')
          // The Brick can fail the FIRST `getFormData()` after the fields were just filled even though its own
          // `POST /v1/card_tokens` answered 201 (`secure_fields_card_token_creation_failed`: its internal validation of
          // the secure fields / installments was still settling); the second call works. Nothing has reached the shop's
          // server yet (the token only travels afterwards, in `transport.submit`), so reading the form ONCE more is safe:
          // it never repeats a charge and never touches the idempotency key. The discarded token was never sent anywhere.
          const read = async (): Promise<Record<string, unknown>> => {
            const raw = await controller.getFormData()
            const data = sanitizeMercadoPagoFormData(raw)
            if (!data.token) throw new Error('payment form incomplete')
            return data
          }
          let provider_data: Record<string, unknown>
          try {
            provider_data = await read()
          } catch (first) {
            if (gone) throw first
            await new Promise<void>((r) => setTimeout(r, retryDelay))
            if (gone) throw first
            provider_data = await read()
          }
          const device = getDevice()
          return { provider_data, ...(typeof device === 'string' && device ? { device_session_id: device } : {}) }
        },
        async update(next) {
          if (gone) throw new Error('payment form is unmounted')
          if (typeof controller.update !== 'function') throw new Error('payment form: update not supported')
          const value = Number.parseFloat(next.amount.amount)
          if (!Number.isFinite(value) || value <= 0) throw new Error('payment form: invalid amount')
          await controller.update({ amount: value })
        },
        async unmount() {
          gone = true
          try {
            await controller.unmount()
          } catch {
            /* the provider may already have removed it */
          }
        },
      }
    },
  }
}

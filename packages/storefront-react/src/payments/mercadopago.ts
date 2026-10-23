import { loadPaymentSdk } from './sdk-loader.js'
import type { MountedPaymentForm, PaymentFormAdapter, PaymentFormData, PaymentFormMountOptions } from './adapter.js'

/** The `PaymentClient.kind` the addon `mercadopago` declares. */
export const MERCADOPAGO_BRICKS_KIND = 'mercadopago_bricks'

type MpController = { getFormData(): Promise<Record<string, unknown> | undefined | null>; unmount(): void | Promise<void> }
type MpBricks = { create(brick: string, containerId: string, settings: Record<string, unknown>): Promise<MpController> }
export type MercadoPagoCtor = new (publicKey: string, options?: { locale?: string }) => { bricks(): MpBricks }

export type MercadoPagoAdapterOptions = {
  /** Exact origins allowed for `sdk_url`. Default: Mercado Pago's SDK origin only. */
  allowedSdkOrigins?: readonly string[]
  /** Resolves the SDK constructor. Default: `window.MercadoPago`. Inject a fake in tests. */
  getSdk?: () => MercadoPagoCtor | undefined
  /** Reads the anti-fraud device id. Default: `window.MP_DEVICE_SESSION_ID`. */
  getDeviceSessionId?: () => string | undefined
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
 * `getFormData()`), which tokenises inside MP's iframes. Card data never touches this code.
 */
export function mercadoPagoBricksAdapter(options: MercadoPagoAdapterOptions = {}): PaymentFormAdapter {
  const allowed = options.allowedSdkOrigins ?? ['https://sdk.mercadopago.com']
  const getSdk =
    options.getSdk ?? (() => (typeof window !== 'undefined' ? (window as unknown as { MercadoPago?: MercadoPagoCtor }).MercadoPago : undefined))
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
          const raw = await controller.getFormData()
          const provider_data = sanitizeMercadoPagoFormData(raw)
          if (!provider_data.token) throw new Error('payment form incomplete')
          const device = getDevice()
          return { provider_data, ...(typeof device === 'string' && device ? { device_session_id: device } : {}) }
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

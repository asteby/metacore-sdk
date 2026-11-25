import type { PaymentErrorClassKind } from '@asteby/storefront'

/** The notices `<PaymentRecovery>` can show. */
export type PaymentNoticeKind =
  /** Confirming the payment (automatic retry or status check). */
  | 'confirming'
  /** The secure card form did not load after the automatic retries. */
  | 'form_failed'
  /** The bank or provider rejected the charge (definitive): another card can be tried. */
  | 'rejected'
  /** The provider refused the charge at API level (definitive, nothing charged). */
  | 'provider_declined'
  /** Credentials or configuration of the merchant with the provider. */
  | 'merchant_config'
  /** The cart already became an order and the payment could not be reopened. */
  | 'stale_checkout'
  /** Another definitive error. */
  | 'other'

export type PaymentRecoveryMessageKey =
  | `error.${PaymentErrorClassKind}`
  | `notice.${PaymentNoticeKind}.title`
  | `notice.${PaymentNoticeKind}.body`
  | 'action.retry'
  | 'action.retry_form'
  | 'action.refresh'
  /** `{label}` is the name of the alternative payment choice. */
  | 'action.alternative'

export type PaymentRecoveryMessages = Record<PaymentRecoveryMessageKey, string>

const ES: PaymentRecoveryMessages = {
  'error.transient': 'Estamos verificando tu pago. Si el cargo se hizo, lo veremos aquí; no te cobraremos dos veces.',
  'error.in_progress': 'Ya hay un pago en proceso para este pedido. Estamos verificándolo; no vuelvas a pagar.',
  'error.rate_limited': 'Hiciste varios intentos seguidos. Espera unos minutos e inténtalo de nuevo.',
  'error.merchant_config': 'Por ahora no podemos procesar pagos con tarjeta. No es un problema con tu tarjeta: puedes pagar de otra forma.',
  'error.provider_declined': 'No pudimos procesar tu pago con esa tarjeta. Revisa los datos o prueba con otro método; no se hizo ningún cobro.',
  'error.stale_checkout': 'Este pedido ya quedó registrado y no se pudo reabrir el pago. Actualiza para ver cómo va tu pedido.',
  'error.expired': 'Tu carrito venció. Vuelve a armarlo para pagar.',
  'error.price_mismatch': 'El total cambió. Revisa el nuevo total y vuelve a pagar.',
  'error.store_closed': 'Esta tienda aún no está abierta para compras. Vuelve pronto.',
  'error.validation': 'Completa los campos marcados.',
  'error.other': 'No pudimos procesar tu pago. Intenta de nuevo.',
  'notice.confirming.title': 'Estamos confirmando tu pago…',
  'notice.confirming.body': 'No cierres esta página ni vuelvas a pagar. Si el cargo ya se hizo, lo verás reflejado aquí.',
  'notice.form_failed.title': 'No pudimos cargar el formulario de tarjeta',
  'notice.form_failed.body': 'Suele resolverse al intentar de nuevo. También puedes pagar de otra forma.',
  'notice.rejected.title': 'El cargo no se completó',
  'notice.rejected.body': 'No se hizo ningún cobro. Puedes intentar con otra tarjeta o elegir otra forma de pago.',
  'notice.provider_declined.title': 'No pudimos procesar tu pago con esa tarjeta',
  'notice.provider_declined.body': 'No se hizo ningún cobro. Revisa los datos o prueba con otra tarjeta u otro método de pago.',
  'notice.merchant_config.title': 'Por ahora no podemos cobrar con tarjeta',
  'notice.merchant_config.body': 'No es un problema con tu tarjeta: es un tema de nuestro lado. Puedes pagar de otra forma.',
  'notice.stale_checkout.title': 'Tu pedido ya quedó registrado',
  'notice.stale_checkout.body': 'No pudimos reabrir el pago de este pedido. Actualiza para ver cómo va tu pedido; no se cobró de nuevo.',
  'notice.other.title': 'No pudimos procesar tu pago',
  'notice.other.body': 'Intenta de nuevo; si sigue igual, puedes pagar de otra forma.',
  'action.retry': 'Reintentar pago',
  'action.retry_form': 'Reintentar',
  'action.refresh': 'Actualizar mi pedido',
  'action.alternative': 'Pagar con {label}',
}

const EN: PaymentRecoveryMessages = {
  'error.transient': "We're verifying your payment. If the charge went through we'll show it here; you won't be charged twice.",
  'error.in_progress': "A payment is already in progress for this order. We're verifying it; don't pay again.",
  'error.rate_limited': 'Too many attempts in a row. Wait a few minutes and try again.',
  'error.merchant_config': "We can't take card payments right now. It isn't a problem with your card: you can pay another way.",
  'error.provider_declined': "We couldn't process your payment with that card. Check the details or try another method; you were not charged.",
  'error.stale_checkout': "This order is already registered and the payment couldn't be reopened. Refresh to see how it's going.",
  'error.expired': 'Your cart expired. Rebuild it to pay.',
  'error.price_mismatch': 'The total changed. Check the new total and pay again.',
  'error.store_closed': "This store isn't open for purchases yet. Come back soon.",
  'error.validation': 'Complete the marked fields.',
  'error.other': "We couldn't process your payment. Try again.",
  'notice.confirming.title': "We're confirming your payment…",
  'notice.confirming.body': "Don't close this page or pay again. If the charge already went through you'll see it here.",
  'notice.form_failed.title': "We couldn't load the card form",
  'notice.form_failed.body': 'Trying again usually fixes it. You can also pay another way.',
  'notice.rejected.title': "The charge didn't go through",
  'notice.rejected.body': 'You were not charged. Try another card or choose another way to pay.',
  'notice.provider_declined.title': "We couldn't process your payment with that card",
  'notice.provider_declined.body': 'You were not charged. Check the details or try another card or method.',
  'notice.merchant_config.title': "We can't charge cards right now",
  'notice.merchant_config.body': "It isn't a problem with your card: it's on our side. You can pay another way.",
  'notice.stale_checkout.title': 'Your order is already registered',
  'notice.stale_checkout.body': "We couldn't reopen the payment for this order. Refresh to see how it's going; you were not charged again.",
  'notice.other.title': "We couldn't process your payment",
  'notice.other.body': 'Try again; if it keeps failing you can pay another way.',
  'action.retry': 'Retry payment',
  'action.retry_form': 'Retry',
  'action.refresh': 'Refresh my order',
  'action.alternative': 'Pay with {label}',
}

/** Texts for a locale (`es*` default, `en*`), with optional overrides. Nothing here names a provider or a brand. */
export function paymentRecoveryMessages(locale?: string | null, overrides?: Partial<PaymentRecoveryMessages> | null): PaymentRecoveryMessages {
  const base = (locale ?? 'es-MX').toLowerCase().startsWith('en') ? EN : ES
  return overrides ? { ...base, ...overrides } : base
}

/**
 * What to tell the buyer when the shop refused ONE field of the order before charging (a `validation` with a `field`).
 * OPS' own wording is technical and in the organisation's language, not the buyer's; this says how to fix it, in the
 * shop's locale. Unknown field: `undefined` (the caller keeps OPS' text). `field` may arrive as `phone`,
 * `shipping_address.phone`, `buyer.phone`: only the last segment counts.
 */
const FIELD_ES: Record<string, string> = {
  phone: 'El teléfono debe tener 10 dígitos, sin lada internacional (por ejemplo 5512345678).',
  email: 'Revisa tu correo: parece que no es válido.',
  postal_code: 'Revisa tu código postal.',
  name: 'Escribe tu nombre y apellido.',
  address: 'Revisa tu calle y número.',
  city: 'Escribe tu ciudad.',
  state: 'Elige tu estado.',
}
const FIELD_EN: Record<string, string> = {
  phone: 'Enter your 10-digit phone number, without the country code (for example 7045550123).',
  email: 'Check your email: it does not look valid.',
  postal_code: 'Check your postal code.',
  name: 'Enter your first and last name.',
  address: 'Check your street and number.',
  city: 'Enter your city.',
  state: 'Choose your state.',
}
const FIELD_ALIAS: Record<string, string> = {
  telefono: 'phone',
  mobile: 'phone',
  zip: 'postal_code',
  zip_code: 'postal_code',
  postcode: 'postal_code',
  postal: 'postal_code',
  first_name: 'name',
  last_name: 'name',
  full_name: 'name',
  line1: 'address',
  street: 'address',
  address1: 'address',
  address_line1: 'address',
  street_name: 'address',
  region: 'state',
  province: 'state',
}

export function validationFieldMessage(locale: string | null | undefined, field: string | null | undefined): string | undefined {
  if (!field) return undefined
  const last = String(field).split('.').pop()!.trim().toLowerCase().replace(/[\s-]+/g, '_')
  const key = FIELD_ALIAS[last] ?? last
  const table = (locale ?? 'es-MX').toLowerCase().startsWith('en') ? FIELD_EN : FIELD_ES
  return table[key]
}

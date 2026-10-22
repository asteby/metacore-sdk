import type { PaymentOptionKey } from '@asteby/storefront'

/** Texts of the "Payment method" section. Override any of them with the `messages` prop. */
export type PaymentMethodMessages = {
  legend: string
  /** Button label before the total: "Pagar $1,200.00". */
  pay: string
  /** Button label for card and cash, before the total. */
  placeOrder: string
  /** Button label when the buyer leaves for the provider's page. */
  payRedirect: string
  /** Button label for the first step (address) of a two-step checkout. */
  continue: string
  /** Button label when the address must be saved again. */
  retryAddress: string
  processing: string
  redirectNote: string
  cashPoints: string
  cashMore: string
  cashNote: string
  secureCard: string
  pickDeliveryFirst: string
  updatingTotal: string
  syncFailed: string
  rebuildCart: string
  noPaymentTitle: string
  noPayment: string
  paymentNote: string
  /** Fallback names for the provider options when the server sends no `label`. */
  options: Record<PaymentOptionKey, string>
}

const ES: PaymentMethodMessages = {
  legend: 'Método de pago',
  pay: 'Pagar',
  placeOrder: 'Realizar el pedido',
  payRedirect: 'Continuar al pago',
  continue: 'Continuar',
  retryAddress: 'Guardar dirección y continuar',
  processing: 'Procesando…',
  redirectNote: 'Te llevamos a la página del proveedor para terminar el pago y regresas aquí.',
  cashPoints: 'Elige dónde pagar en efectivo',
  cashMore: 'Ver más puntos de pago',
  cashNote: 'Al hacer el pedido te damos una ficha con la referencia y la fecha límite. El pedido se confirma cuando pagas.',
  secureCard: 'Tus datos de tarjeta los captura directamente nuestro proveedor de pagos; la tienda nunca los ve.',
  pickDeliveryFirst: 'Elige primero la entrega para ver el total y pagar con tarjeta.',
  updatingTotal: 'Actualizando el total…',
  syncFailed: 'No pudimos actualizar el total con tu entrega. Puedes continuar al sitio del proveedor para pagar con tarjeta.',
  rebuildCart: 'Volver a armar mi carrito',
  noPaymentTitle: 'Por ahora no hay formas de pago disponibles',
  noPayment: 'Intenta de nuevo en unos minutos o escríbenos para completar tu pedido.',
  paymentNote: 'El pago se procesa de forma segura con nuestro proveedor de pagos.',
  options: {
    card: 'Tarjeta de crédito o débito',
    cash: 'Efectivo',
    wallet: 'Cuenta del proveedor de pagos',
    credits: 'Pagos sin tarjeta',
  },
}

const EN: PaymentMethodMessages = {
  legend: 'Payment method',
  pay: 'Pay',
  placeOrder: 'Place order',
  payRedirect: 'Continue to payment',
  continue: 'Continue',
  retryAddress: 'Save address and continue',
  processing: 'Processing…',
  redirectNote: "We'll take you to the provider's page to finish paying, then bring you back here.",
  cashPoints: 'Choose where to pay in cash',
  cashMore: 'Show more payment points',
  cashNote: 'When you place the order you get a slip with the reference and the deadline. The order is confirmed once you pay.',
  secureCard: 'Your card details are captured directly by our payment provider; the shop never sees them.',
  pickDeliveryFirst: 'Choose delivery first to see the total and pay by card.',
  updatingTotal: 'Updating the total…',
  syncFailed: "We couldn't update the total with your delivery. You can continue to the provider's site to pay by card.",
  rebuildCart: 'Rebuild my cart',
  noPaymentTitle: 'No payment methods are available right now',
  noPayment: 'Try again in a few minutes or contact us to complete your order.',
  paymentNote: 'Payment is processed securely by our payment provider.',
  options: {
    card: 'Credit or debit card',
    cash: 'Cash',
    wallet: 'Payment provider account',
    credits: 'Pay without a card',
  },
}

/** Messages for a locale (`es*` default, `en*`), with optional overrides. */
export function paymentMethodMessages(locale?: string | null, overrides?: Partial<Omit<PaymentMethodMessages, 'options'>> & { options?: Partial<PaymentMethodMessages['options']> } | null): PaymentMethodMessages {
  const base = (locale ?? 'es-MX').toLowerCase().startsWith('en') ? EN : ES
  if (!overrides) return base
  const { options, ...rest } = overrides
  return { ...base, ...rest, options: { ...base.options, ...options } }
}

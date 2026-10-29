/** Texts of the public tracking screens (es / en). Every key can be overridden with the `messages` prop. */
const es = {
  'timeline.label': 'Movimientos del envío',
  'timeline.current': 'Estado actual',
  'timeline.empty': 'Aún no hay movimientos de tu envío.',
  'tracker.loading': 'Buscando tu envío…',
  'tracker.empty': 'Todavía no hay movimientos. Te los mostraremos aquí en cuanto salga tu paquete.',
  'tracker.error': 'No pudimos cargar el rastreo de tu envío.',
  'tracker.retry': 'Reintentar',
  'tracker.exception': 'Hay una incidencia con tu envío. Si necesitas ayuda, escríbenos con tu número de guía.',
  'tracker.carrier': 'Transportista',
  'tracker.guide': 'Número de guía',
  'tracker.eta': 'Llegada estimada',
  'tracker.updated': 'Actualizado',
  'tracker.copy': 'Copiar',
  'tracker.copied': 'Copiado',
  'tracker.copyFailed': 'No pudimos copiar; selecciona el texto.',
  'tracker.track': 'Rastrear con {carrier}',
  'tracker.trackGeneric': 'Rastrear con el transportista',
  'tracker.map': 'Recorrido aproximado del paquete',
  'tracker.mapLoading': 'Cargando el mapa…',
  'lookup.title': 'Rastrea tu pedido',
  'lookup.intro': 'Escribe tu número de pedido y el correo con el que compraste, o el número de guía.',
  'lookup.orderNumber': 'Número de pedido',
  'lookup.email': 'Correo de la compra',
  'lookup.guide': 'Número de guía',
  'lookup.or': 'o',
  'lookup.submit': 'Rastrear',
  'lookup.submitting': 'Buscando…',
  'lookup.error.not_found': 'No encontramos un envío con esos datos. Revisa el número y el correo, o la guía.',
  'lookup.error.rate_limited': 'Hiciste muchos intentos. Espera un momento e inténtalo de nuevo.',
  'lookup.error.rate_limited_in': 'Hiciste muchos intentos. Inténtalo de nuevo en {seconds} s.',
  'lookup.error.unavailable': 'No pudimos consultar el rastreo ahora. Inténtalo en unos minutos.',
  'lookup.error.incomplete': 'Escribe el número de pedido y el correo, o el número de guía.',
}

const en: typeof es = {
  'timeline.label': 'Shipment movements',
  'timeline.current': 'Current status',
  'timeline.empty': 'There are no movements for your shipment yet.',
  'tracker.loading': 'Looking for your shipment…',
  'tracker.empty': 'No movements yet. We will show them here as soon as your parcel leaves.',
  'tracker.error': 'We could not load the tracking of your shipment.',
  'tracker.retry': 'Try again',
  'tracker.exception': 'There is an issue with your shipment. If you need help, write to us with your tracking number.',
  'tracker.carrier': 'Carrier',
  'tracker.guide': 'Tracking number',
  'tracker.eta': 'Estimated arrival',
  'tracker.updated': 'Updated',
  'tracker.copy': 'Copy',
  'tracker.copied': 'Copied',
  'tracker.copyFailed': 'We could not copy; select the text.',
  'tracker.track': 'Track with {carrier}',
  'tracker.trackGeneric': 'Track with the carrier',
  'tracker.map': 'Approximate route of the parcel',
  'tracker.mapLoading': 'Loading the map…',
  'lookup.title': 'Track your order',
  'lookup.intro': 'Enter your order number and the email you bought with, or the tracking number.',
  'lookup.orderNumber': 'Order number',
  'lookup.email': 'Email of the purchase',
  'lookup.guide': 'Tracking number',
  'lookup.or': 'or',
  'lookup.submit': 'Track',
  'lookup.submitting': 'Searching…',
  'lookup.error.not_found': 'We could not find a shipment with those details. Check the order number and email, or the tracking number.',
  'lookup.error.rate_limited': 'Too many attempts. Wait a moment and try again.',
  'lookup.error.rate_limited_in': 'Too many attempts. Try again in {seconds} s.',
  'lookup.error.unavailable': 'We could not check the tracking right now. Try again in a few minutes.',
  'lookup.error.incomplete': 'Enter the order number and email, or the tracking number.',
}

export type TrackingMessages = typeof es
export type TrackingMessageKey = keyof TrackingMessages

/** The messages of a locale (`en*` → English, anything else → Spanish) with the host's overrides on top. */
export function trackingMessages(locale: string, overrides?: Partial<TrackingMessages>): TrackingMessages {
  const base = /^en\b/i.test(locale) ? en : es
  return overrides ? { ...base, ...overrides } : base
}

export function fillText(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`))
}

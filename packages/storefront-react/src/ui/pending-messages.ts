/**
 * Texts of the pending-action primitives (`PendingButton`, `useActionLock`). Spanish (es-MX) by default, English with
 * `en*`; every text can be overridden with `messages` (a partial map), so a store never needs its own copy.
 */
export type PendingKind =
  | 'download'
  | 'invoice'
  | 'pay'
  | 'send'
  | 'save'
  | 'load'
  | 'add'
  | 'apply'
  | 'cancel'
  | 'scan'
  | 'update'

const ES = {
  'pending.download': 'Descargando…',
  'pending.invoice': 'Generando factura…',
  'pending.pay': 'Procesando pago…',
  'pending.send': 'Enviando…',
  'pending.save': 'Guardando…',
  'pending.load': 'Cargando…',
  'pending.add': 'Agregando…',
  'pending.apply': 'Aplicando…',
  'pending.cancel': 'Cancelando…',
  'pending.scan': 'Leyendo el documento…',
  'pending.update': 'Actualizando…',
  'pending.done': 'Listo.',
  'pending.failed': 'No se pudo completar. Inténtalo de nuevo.',
  'pending.slow': 'Esto puede tardar unos segundos…',
} as const

export type PendingMessageKey = keyof typeof ES
export type PendingMessages = Record<PendingMessageKey, string>

const EN: PendingMessages = {
  'pending.download': 'Downloading…',
  'pending.invoice': 'Generating invoice…',
  'pending.pay': 'Processing payment…',
  'pending.send': 'Sending…',
  'pending.save': 'Saving…',
  'pending.load': 'Loading…',
  'pending.add': 'Adding…',
  'pending.apply': 'Applying…',
  'pending.cancel': 'Cancelling…',
  'pending.scan': 'Reading the document…',
  'pending.update': 'Updating…',
  'pending.done': 'Done.',
  'pending.failed': 'It could not be completed. Try again.',
  'pending.slow': 'This can take a few seconds…',
}

export function pendingMessages(locale?: string | null, overrides?: Partial<PendingMessages> | null): PendingMessages {
  const base: PendingMessages = (locale ?? 'es').toLowerCase().startsWith('en') ? EN : { ...ES }
  return overrides ? { ...base, ...overrides } : base
}

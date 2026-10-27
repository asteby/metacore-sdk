/**
 * Texts and layout decisions of the printable voucher, shared by the HTML document and the PDF so both say the same
 * thing: which fields a method prints and which instructions it gets. Plain data, no React, no DOM. Loaded only with
 * one of the two generators (never in the first load of the order screens).
 *
 * A voucher is per METHOD: cash at a store (barcode + reference + store steps), bank transfer (beneficiary, bank,
 * CLABE, reference + transfer steps), or generic (no brand named). The server picks the instructions with
 * `instructions_key` (or the method); an unknown key falls back to the kind, never to another method's steps.
 */
import type { Money } from '@asteby/storefront'
import type { VoucherView } from './voucher.js'

export type DocText = {
  title: string
  total: string
  reference: string
  clabe: string
  beneficiary: string
  bank: string
  expires: string
  expiresNote: string
  order: string
  barcode: string
  code: string
  print: string
  downloadPdf: string
  noScript: string
  stepsTitle: string
  footer: string
  methods: Record<string, string>
  cash: string
  steps: Record<string, (v: VoucherView) => string[]>
}

const KEEP_ES = 'Conserva tu comprobante: confirmaremos tu pago automáticamente.'
const KEEP_EN = 'Keep your receipt: we will confirm your payment automatically.'

const ES: DocText = {
  title: 'Ficha de pago',
  total: 'Total a pagar',
  reference: 'Referencia',
  clabe: 'CLABE',
  beneficiary: 'Beneficiario',
  bank: 'Banco',
  expires: 'Vence',
  expiresNote: 'Pasada esa fecha la ficha deja de ser válida.',
  order: 'Pedido',
  barcode: 'Código de barras',
  code: 'Código',
  print: 'Imprimir',
  downloadPdf: 'Descargar PDF',
  noScript: 'Para imprimir usa la opción Imprimir de tu navegador (Ctrl+P) o descarga el PDF.',
  stepsTitle: 'Cómo pagar',
  footer: 'Tu pedido se genera cuando se confirma el pago. Esta ficha es de un solo uso; no la compartas.',
  methods: { oxxo: 'OXXO', spei: 'Transferencia SPEI', bank_transfer: 'Transferencia bancaria', bank_deposit: 'Depósito bancario', cash: 'Pago en efectivo' },
  cash: 'Pago en efectivo',
  steps: {
    oxxo: (v) => [
      'Acude a cualquier tienda OXXO y di que vas a hacer un pago de servicio en efectivo.',
      v.barcode ? 'Muestra el código de barras en caja o dicta la referencia, y paga el monto exacto.' : 'Dicta la referencia en caja y paga el monto exacto.',
      KEEP_ES,
    ],
    cash: (v) => [
      'Acude a la tienda o comercio indicado y di que vas a hacer un pago en efectivo.',
      v.barcode ? 'Muestra el código de barras o dicta la referencia, y paga el monto exacto.' : 'Dicta la referencia y paga el monto exacto.',
      KEEP_ES,
    ],
    spei: (v) => [
      'Entra a la banca en línea o a la app de tu banco.',
      'Haz una transferencia SPEI a la CLABE indicada, por el monto exacto.',
      ...(v.reference ? ['Escribe la referencia de esta ficha en el concepto o referencia de la transferencia.'] : []),
      KEEP_ES,
    ],
    bank_transfer: (v) => [
      'Entra a la banca en línea o a la app de tu banco.',
      'Haz una transferencia a la cuenta o CLABE indicada, por el monto exacto.',
      ...(v.reference ? ['Escribe la referencia de esta ficha en el concepto de la transferencia.'] : []),
      KEEP_ES,
    ],
    bank_deposit: (v) => [
      'Acude a una sucursal del banco indicado o a su cajero con depósitos.',
      `Deposita el monto exacto a la cuenta${v.reference ? ' con la referencia de esta ficha' : ' indicada'}.`,
      KEEP_ES,
    ],
    transfer: (v) => [
      'Entra a la banca en línea o a la app de tu banco.',
      'Haz una transferencia a la CLABE indicada, por el monto exacto.',
      ...(v.reference ? ['Escribe la referencia de esta ficha en el concepto de la transferencia.'] : []),
      KEEP_ES,
    ],
    generic: () => ['Realiza el pago con los datos de esta ficha, por el monto exacto y antes de que venza.', KEEP_ES],
  },
}

const EN: DocText = {
  title: 'Payment voucher',
  total: 'Amount to pay',
  reference: 'Reference',
  clabe: 'CLABE',
  beneficiary: 'Beneficiary',
  bank: 'Bank',
  expires: 'Expires',
  expiresNote: 'After that date the voucher is no longer valid.',
  order: 'Order',
  barcode: 'Barcode',
  code: 'Code',
  print: 'Print',
  downloadPdf: 'Download PDF',
  noScript: 'To print, use your browser\'s Print option (Ctrl+P) or download the PDF.',
  stepsTitle: 'How to pay',
  footer: 'Your order is created when the payment is confirmed. This voucher is single-use; do not share it.',
  methods: { oxxo: 'OXXO', spei: 'SPEI transfer', bank_transfer: 'Bank transfer', bank_deposit: 'Bank deposit', cash: 'Cash payment' },
  cash: 'Cash payment',
  steps: {
    oxxo: (v) => [
      'Go to any OXXO store and say you want to make a cash service payment.',
      v.barcode ? 'Show the barcode at the register or read out the reference, and pay the exact amount.' : 'Read out the reference at the register and pay the exact amount.',
      KEEP_EN,
    ],
    cash: (v) => [
      'Go to the store indicated and say you want to make a cash payment.',
      v.barcode ? 'Show the barcode or read out the reference, and pay the exact amount.' : 'Read out the reference and pay the exact amount.',
      KEEP_EN,
    ],
    spei: (v) => [
      'Open your online banking or your bank app.',
      'Make a SPEI transfer to the CLABE below for the exact amount.',
      ...(v.reference ? ['Enter the reference of this voucher as the transfer concept or reference.'] : []),
      KEEP_EN,
    ],
    bank_transfer: (v) => [
      'Open your online banking or your bank app.',
      'Make a transfer to the account or CLABE below for the exact amount.',
      ...(v.reference ? ['Enter the reference of this voucher as the transfer concept.'] : []),
      KEEP_EN,
    ],
    bank_deposit: (v) => [
      'Go to a branch of the bank indicated or to one of its deposit ATMs.',
      `Deposit the exact amount to the account${v.reference ? ' with the reference of this voucher' : ' indicated'}.`,
      KEEP_EN,
    ],
    transfer: (v) => [
      'Open your online banking or your bank app.',
      'Make a transfer to the CLABE below for the exact amount.',
      ...(v.reference ? ['Enter the reference of this voucher as the transfer concept.'] : []),
      KEEP_EN,
    ],
    generic: () => ['Make the payment with the details of this voucher, for the exact amount and before it expires.', KEEP_EN],
  },
}

export const isEnglish = (locale: string) => locale.toLowerCase().startsWith('en')
export function docText(locale: string): DocText {
  return isEnglish(locale) ? EN : ES
}

const own = <T>(o: Record<string, T>, k: string | null | undefined): T | undefined => {
  const key = k?.toLowerCase()
  return key && Object.prototype.hasOwnProperty.call(o, key) ? o[key] : undefined
}

/** Method as the buyer reads it. Own keys only: a method named `constructor` or `__proto__` prints as itself. */
export function methodName(v: VoucherView, t: DocText): string {
  return (v.method ? own(t.methods, v.method) ?? v.method : t.cash)
}

/** Numbered instructions of this voucher: the server's `instructions_key`, else the method, else the kind. */
export function voucherSteps(v: VoucherView, t: DocText): string[] {
  const fn = own(t.steps, v.instructions_key) ?? own(t.steps, v.method) ?? (v.kind === 'cash' ? t.steps.cash : v.kind === 'transfer' ? t.steps.transfer : t.steps.generic)
  return fn!(v)
}

export type VoucherField = { key: 'beneficiary' | 'bank' | 'clabe' | 'reference' | 'code'; label: string; value: string }

/** Fields to print, in the order the method needs them: transfers lead with who/where/CLABE, cash with the reference. */
export function voucherFields(v: VoucherView, t: DocText): VoucherField[] {
  const f = (key: VoucherField['key'], label: string, value: string | null): VoucherField[] => (value ? [{ key, label, value }] : [])
  return v.kind === 'transfer'
    ? [...f('beneficiary', t.beneficiary, v.beneficiary), ...f('bank', t.bank, v.bank), ...f('clabe', t.clabe, v.clabe), ...f('reference', t.reference, v.reference), ...f('code', t.code, v.barcode_text)]
    : [...f('reference', t.reference, v.reference), ...f('clabe', t.clabe, v.clabe), ...f('beneficiary', t.beneficiary, v.beneficiary), ...f('bank', t.bank, v.bank), ...f('code', t.code, v.barcode_text)]
}

export function formatMoney(m: Money | null, locale: string): string {
  if (!m) return ''
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency_code }).format(Number(m.amount))
  } catch {
    return `${m.amount} ${m.currency_code}`
  }
}

export function formatDate(iso: string | null, locale: string, timeZone?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return d.toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) })
  } catch {
    return d.toISOString()
  }
}

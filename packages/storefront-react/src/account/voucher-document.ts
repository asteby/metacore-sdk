/**
 * Printable voucher (A4 HTML) that does not depend on any payment gateway: built only from the voucher data OPS keeps.
 * Loaded on demand (the buyer taps print/download) or by `pendingVoucherResponse` on the server; plain text, no React.
 * Everything external passes through `esc` before it enters the HTML.
 */
import type { Money } from '@asteby/storefront'
import { barcodeGeometry, barcodeValue, type VoucherView } from './voucher.js'

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

type DocText = {
  title: string
  total: string
  reference: string
  clabe: string
  expires: string
  expiresNote: string
  order: string
  barcode: string
  print: string
  footer: string
  stepsCash: string[]
  stepsSpei: string[]
  methods: Record<string, string>
  cash: string
}

const ES: DocText = {
  title: 'Ficha de pago',
  total: 'Total a pagar',
  reference: 'Referencia',
  clabe: 'CLABE',
  expires: 'Vence',
  expiresNote: 'Pasada esa fecha la ficha deja de ser válida.',
  order: 'Pedido',
  barcode: 'Código de barras',
  print: 'Imprimir ficha',
  footer: 'Tu pedido se genera cuando se confirma el pago. Esta ficha es de un solo uso; no la compartas.',
  stepsCash: [
    'Acude a la tienda OXXO (o el comercio indicado) y di que vas a hacer un pago de servicio en efectivo.',
    'Muestra el código de barras o dicta la referencia y paga el monto exacto.',
    'Conserva tu comprobante: confirmaremos tu pago automáticamente.',
  ],
  stepsSpei: ['Entra a la banca en línea o app de tu banco.', 'Haz una transferencia SPEI a la CLABE indicada por el monto exacto.', 'Conserva tu comprobante: confirmaremos tu pago automáticamente.'],
  methods: { oxxo: 'OXXO', spei: 'Transferencia SPEI', bank_transfer: 'Transferencia bancaria', bank_deposit: 'Depósito bancario', cash: 'Pago en efectivo' },
  cash: 'Pago en efectivo',
}

const EN: DocText = {
  title: 'Payment voucher',
  total: 'Amount to pay',
  reference: 'Reference',
  clabe: 'CLABE',
  expires: 'Expires',
  expiresNote: 'After that date the voucher is no longer valid.',
  order: 'Order',
  barcode: 'Barcode',
  print: 'Print voucher',
  footer: 'Your order is created when the payment is confirmed. This voucher is single-use; do not share it.',
  stepsCash: [
    'Go to an OXXO store (or the store indicated) and say you want to make a cash service payment.',
    'Show the barcode or read out the reference and pay the exact amount.',
    'Keep your receipt: we will confirm your payment automatically.',
  ],
  stepsSpei: ['Open your bank online or app.', 'Make a SPEI transfer to the CLABE below for the exact amount.', 'Keep your receipt: we will confirm your payment automatically.'],
  methods: { oxxo: 'OXXO', spei: 'SPEI transfer', bank_transfer: 'Bank transfer', bank_deposit: 'Bank deposit', cash: 'Cash payment' },
  cash: 'Cash payment',
}

export type VoucherDocumentOptions = {
  shopName?: string
  /** Order number, if there is one yet. */
  number?: string | null
  locale?: string
  /** IANA zone the expiry is printed in (default: the runtime's). */
  timeZone?: string
  /** Print button on screen (hidden when printing). */
  printButton?: boolean
  /** Opens the print dialog on load. */
  autoPrint?: boolean
  /** `<script>` nonce when the one serving the voucher sends a CSP with `script-src 'nonce-…'`. */
  nonce?: string
}

const CSS = `
@page { size: A4; margin: 18mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; background: #fff; }
main { max-width: 174mm; margin: 0 auto; padding: 24px 16px; }
h1 { font-size: 22px; margin: 0; }
.muted { color: #555; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #111; padding-bottom: 12px; }
.amount { font-size: 28px; font-weight: 700; text-align: right; }
.box { border: 1px solid #111; padding: 14px 16px; margin-top: 18px; }
.label { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #555; }
.value { font: 700 22px/1.3 ui-monospace, "SF Mono", Menlo, Consolas, monospace; word-break: break-all; letter-spacing: .04em; }
.bar { margin-top: 18px; text-align: center; }
.bar svg { max-width: 100%; height: auto; }
.steps { margin: 18px 0 0; padding-left: 20px; }
.note { margin-top: 18px; font-size: 12px; }
.pre { white-space: pre-line; }
.actions { margin-top: 24px; display: flex; gap: 12px; }
.actions button { font: inherit; padding: 10px 18px; border: 1px solid #111; background: #111; color: #fff; cursor: pointer; }
@media print { .actions { display: none; } main { padding: 0; } }
`

function formatMoney(m: Money | null, locale: string): string {
  if (!m) return ''
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency_code }).format(Number(m.amount))
  } catch {
    return `${m.amount} ${m.currency_code}`
  }
}

function formatDate(iso: string | null, locale: string, timeZone?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return d.toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) })
  } catch {
    return d.toISOString()
  }
}

function barcodeSvg(value: string, label: string): string | null {
  const g = barcodeGeometry(value)
  if (!g) return null
  const rects = g.rects.map((r) => `<rect x="${r.x}" y="0" width="${r.w}" height="${g.height}"/>`).join('')
  return `<svg viewBox="0 0 ${g.width} ${g.height}" width="${g.width}" height="${g.height}" role="img" aria-label="${esc(label)} ${esc(value)}" shape-rendering="crispEdges" fill="#000">${rects}</svg>`
}

/** Complete HTML document of the voucher. Missing data is simply not drawn. */
export function renderVoucherDocument(v: VoucherView, opts: VoucherDocumentOptions = {}): string {
  const locale = opts.locale ?? 'es-MX'
  const t = locale.toLowerCase().startsWith('en') ? EN : ES
  const shop = opts.shopName || ''
  // Own keys only: a gateway method named `constructor` or `__proto__` must print as itself, not as Object internals.
  const method = v.method ? (Object.prototype.hasOwnProperty.call(t.methods, v.method.toLowerCase()) ? t.methods[v.method.toLowerCase()]! : v.method) : t.cash
  const isSpei = !!v.clabe && !v.reference
  const code = barcodeValue(v)
  const svg = code ? barcodeSvg(code, t.barcode) : null
  const expires = formatDate(v.expires_at, locale, opts.timeZone)
  const field = (label: string, value: string | null) => (value ? `<div class="box"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>` : '')
  const steps = isSpei ? t.stepsSpei : t.stepsCash
  const subtitle = [shop, method, opts.number ? `${t.order} ${opts.number}` : ''].filter(Boolean).map(esc).join(' · ')
  return `<!doctype html>
<html lang="${esc(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(t.title)}${shop ? ` - ${esc(shop)}` : ''}</title><style>${CSS}</style></head>
<body><main>
<div class="head"><div><h1>${esc(t.title)}</h1><div class="muted">${subtitle}</div></div>
${v.amount ? `<div><div class="label" style="text-align:right">${esc(t.total)}</div><div class="amount">${esc(formatMoney(v.amount, locale))}</div></div>` : ''}</div>
${field(t.reference, v.reference)}${field(t.clabe, v.clabe)}
${svg ? `<div class="bar">${svg}<div class="muted" style="font-family:ui-monospace,monospace">${esc(code as string)}</div></div>` : ''}
${expires ? `<p><strong>${esc(t.expires)}:</strong> ${esc(expires)}. ${esc(t.expiresNote)}</p>` : ''}
<ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
${v.instructions ? `<p class="note pre muted">${esc(v.instructions)}</p>` : ''}
<p class="note muted">${esc(t.footer)}</p>
${opts.printButton ? `<div class="actions"><button type="button" id="print">${esc(t.print)}</button></div>` : ''}
</main>
${opts.printButton || opts.autoPrint ? `<script${opts.nonce ? ` nonce="${esc(opts.nonce)}"` : ''}>(function(){var b=document.getElementById("print");if(b)b.addEventListener("click",function(){window.print()});${opts.autoPrint ? 'window.addEventListener("load",function(){setTimeout(function(){window.print()},300)});' : ''}})();</script>` : ''}
</body></html>`
}

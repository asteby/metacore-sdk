/**
 * Printable voucher (A4 HTML) that does not depend on any payment gateway: built only from the voucher data OPS keeps.
 * Loaded on demand (the buyer taps print/download) or by `pendingVoucherResponse` on the server; plain text, no React.
 * Everything external passes through `esc` before it enters the HTML.
 */
import { barcodeGeometry, type VoucherView } from './voucher.js'
import { docText, formatDate, formatMoney, methodName, voucherFields, voucherSteps } from './voucher-text.js'

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

export type VoucherDocumentOptions = {
  shopName?: string
  /** Order number, if there is one yet. */
  number?: string | null
  locale?: string
  /** IANA zone the expiry is printed in (default: the runtime's). */
  timeZone?: string
  /** Print button on screen (hidden when printing). Needs JS; without it the page says to use the browser's print. */
  printButton?: boolean
  /** Link of the real PDF of this voucher (a plain `<a download>`, so it works without JS). */
  pdfHref?: string
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
.amount { margin: 0; font-size: 28px; font-weight: 700; text-align: right; }
.box { border: 1px solid #111; padding: 14px 16px; margin-top: 18px; }
.label { margin: 0; font-weight: 400; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #555; }
.value { margin: 0; font: 700 22px/1.3 ui-monospace, "SF Mono", Menlo, Consolas, monospace; word-break: break-all; letter-spacing: .04em; }
.bar { text-align: center; }
.bar svg { max-width: 100%; height: auto; }
.note { margin-top: 18px; font-size: 12px; }
.pre { white-space: pre-line; }
.steps-title { font-size: 16px; margin: 18px 0 0; }
.steps { margin: 6px 0 0; padding-left: 20px; }
.bar { margin: 18px 0 0; }
.actions { margin-top: 24px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.btn { display: inline-block; font: inherit; padding: 10px 18px; border: 2px solid #111; background: #111; color: #fff; cursor: pointer; text-decoration: none; }
.btn.alt { background: #fff; color: #111; }
.btn:focus-visible { outline: 3px solid #1a56db; outline-offset: 2px; }
@media print { .actions { display: none; } main { padding: 0; } }
`

function barcodeSvg(value: string, format: VoucherView['barcode_format'], label: string): string | null {
  const g = barcodeGeometry(value, { ...(format ? { format } : {}) })
  if (!g) return null
  const rects = g.rects.map((r) => `<rect x="${r.x}" y="0" width="${r.w}" height="${g.height}"/>`).join('')
  return `<svg viewBox="0 0 ${g.width} ${g.height}" width="${g.width}" height="${g.height}" role="img" aria-label="${esc(label)} ${esc(value)}" shape-rendering="crispEdges" fill="#000">${rects}</svg>`
}

/** Complete HTML document of the voucher. Missing data is simply not drawn. */
export function renderVoucherDocument(v: VoucherView, opts: VoucherDocumentOptions = {}): string {
  const locale = opts.locale ?? 'es-MX'
  const t = docText(locale)
  const shop = opts.shopName || ''
  const method = methodName(v, t)
  const code = v.barcode
  const svg = code ? barcodeSvg(code, v.barcode_format, t.barcode) : null
  const expires = formatDate(v.expires_at, locale, opts.timeZone)
  const fields = voucherFields(v, t)
  const steps = voucherSteps(v, t)
  const subtitle = [shop, method, opts.number ? `${t.order} ${opts.number}` : ''].filter(Boolean).map(esc).join(' · ')
  const actions = opts.printButton || opts.pdfHref
  return `<!doctype html>
<html lang="${esc(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(t.title)}${shop ? ` - ${esc(shop)}` : ''}</title><style>${CSS}</style></head>
<body><main aria-labelledby="t">
<header class="head"><div><h1 id="t">${esc(t.title)}</h1><p class="muted" data-voucher-method="${esc(v.method ?? '')}">${subtitle}</p></div>
${v.amount ? `<div><p class="label" style="text-align:right">${esc(t.total)}</p><p class="amount">${esc(formatMoney(v.amount, locale))}</p></div>` : ''}</header>
${fields.map((f) => `<section class="box" data-field="${f.key}"><h2 class="label">${esc(f.label)}</h2><p class="value">${esc(f.value)}</p></section>`).join('')}
${svg ? `<figure class="bar">${svg}<figcaption class="muted" style="font-family:ui-monospace,monospace">${esc(code as string)}</figcaption></figure>` : ''}
${expires ? `<p><strong>${esc(t.expires)}:</strong> ${esc(expires.replace(/\.$/, ''))}. ${esc(t.expiresNote)}</p>` : ''}
<h2 class="steps-title">${esc(t.stepsTitle)}</h2>
<ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
${v.instructions ? `<p class="note pre muted">${esc(v.instructions)}</p>` : ''}
<p class="note muted">${esc(t.footer)}</p>
${
  actions
    ? `<div class="actions" role="group" aria-label="${esc(t.title)}">${opts.pdfHref ? `<a class="btn" href="${esc(opts.pdfHref)}" download="ficha-de-pago.pdf" data-voucher-pdf>${esc(t.downloadPdf)}</a>` : ''}${opts.printButton ? `<button type="button" class="btn alt" id="print" hidden>${esc(t.print)}</button><noscript><p class="note muted">${esc(t.noScript)}</p></noscript>` : ''}</div>`
    : ''
}
</main>
${opts.printButton || opts.autoPrint ? `<script${opts.nonce ? ` nonce="${esc(opts.nonce)}"` : ''}>(function(){var b=document.getElementById("print");if(b){b.hidden=false;b.addEventListener("click",function(){window.print()})}${opts.autoPrint ? 'window.addEventListener("load",function(){setTimeout(function(){window.print()},300)});' : ''}})();</script>` : ''}
</body></html>`
}

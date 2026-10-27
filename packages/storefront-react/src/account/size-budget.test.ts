import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'tsup'
import { describe, expect, it } from 'vitest'

// Budget of the order screens (design D: "detail of an order <= +15 KB gz of SDK JS"). The entry imports every order
// component and hook, bundles them minified with the peers external, and measures what a store's first load pays. The
// printable voucher generator must stay a chunk of its own (loaded when the buyer taps print), not part of that load.
// 16 KB: the shared product picture (ProductThumb/ProductPreview: shimmer, fallback, srcset) now serves the order card and the lines.
// 17 KB: the voucher card now knows per-method kinds, Code 39 next to Code 128, beneficiary / bank fields and the client-side PDF download (the PDF generator itself stays lazy).
// 18 KB: the card reads the server's `barcode_data` (contract 1.10): ITF and EAN-13 next to Code 128 / 39, the text code and the provider receipt link.
const BUDGET_GZ = 18 * 1024
const here = fileURLToPath(new URL('.', import.meta.url))

describe('order screens bundle size', () => {
  it('stays under the gzip budget and keeps the voucher document lazy', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-size-'))
    try {
      mkdirSync(join(dir, 'out'))
      const entry = join(dir, 'entry.ts')
      writeFileSync(
        entry,
        `export { OrderList, OrderCard, OrderProgress, OrderStatusBadge, NextActionBar, ShipmentCard, InvoiceList, PendingPaymentCard, PendingPaymentList, RefundList, PaymentSummary, useCustomerOrders, useCustomerOrder, usePendingPayments } from ${JSON.stringify(join(here, 'index.ts'))}\n`,
      )
      await build({
        entry: { account: entry },
        outDir: join(dir, 'out'),
        format: ['esm'],
        minify: true,
        splitting: true,
        treeshake: true,
        dts: false,
        silent: true,
        config: false,
        external: ['react', 'react/jsx-runtime', '@asteby/storefront'],
      })
      const files = readdirSync(join(dir, 'out')).filter((f) => f.endsWith('.js'))
      const text = (f: string) => readFileSync(join(dir, 'out', f), 'utf8')
      // First load = the entry and what it imports statically; the voucher generators (HTML, PDF and their shared texts) are reached only by dynamic import().
      const initial: string[] = []
      const walk = (f: string) => {
        if (initial.includes(f)) return
        initial.push(f)
        for (const m of text(f).matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)) if (files.includes(m[1]!)) walk(m[1]!)
      }
      walk('account.js')
      const lazy = files.filter((f) => !initial.includes(f))
      expect(lazy.some((f) => /^voucher-document/.test(f)), 'the HTML voucher is its own chunk').toBe(true)
      expect(lazy.some((f) => /^voucher-pdf/.test(f)), 'the PDF generator is its own chunk').toBe(true)
      const gz = initial.reduce((n, f) => n + gzipSync(text(f)).length, 0)
      expect(gz, `order screens: ${gz} B gzip (budget ${BUDGET_GZ})`).toBeLessThanOrEqual(BUDGET_GZ)
      // the document template and its CSS are not in the first load
      for (const f of initial) expect(text(f)).not.toContain('@page')
      // nothing heavy slipped in: no map library, no brand logos
      for (const f of initial) expect(text(f)).not.toMatch(/maplibre|data:image\//)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})

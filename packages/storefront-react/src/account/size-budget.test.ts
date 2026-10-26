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
const BUDGET_GZ = 14 * 1024
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
      const lazy = files.filter((f) => /^voucher-document/.test(f))
      expect(lazy, 'the voucher generator is its own chunk').toHaveLength(1)
      const initial = files.filter((f) => !lazy.includes(f))
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

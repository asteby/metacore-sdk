import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'tsup'
import { describe, expect, it } from 'vitest'

// Budget of the product entry (`@asteby/storefront-react/product`): ProductGallery, its pure helpers and es/en texts.
// Peers external; the shared `Image` is counted. 5 KB: one component, three glyphs, no dependencies.
const BUDGET_GZ = 5 * 1024
const here = fileURLToPath(new URL('.', import.meta.url))

describe('product bundle size', () => {
  it('stays under the gzip budget', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-product-size-'))
    try {
      mkdirSync(join(dir, 'out'))
      const entry = join(dir, 'entry.ts')
      writeFileSync(entry, `export * from ${JSON.stringify(join(here, 'index.ts'))}\n`)
      await build({
        entry: { product: entry },
        outDir: join(dir, 'out'),
        format: ['esm'],
        minify: true,
        splitting: true,
        treeshake: true,
        dts: false,
        silent: true,
        config: false,
        external: ['react', 'react/jsx-runtime', '@asteby/storefront', '@asteby/storefront/geo'],
      })
      const files = readdirSync(join(dir, 'out')).filter((f) => f.endsWith('.js'))
      const gz = files.reduce((n, f) => n + gzipSync(readFileSync(join(dir, 'out', f), 'utf8')).length, 0)
      expect(gz, `product: ${gz} B gzip (budget ${BUDGET_GZ})`).toBeLessThanOrEqual(BUDGET_GZ)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})

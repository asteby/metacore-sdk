import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'tsup'
import { describe, expect, it } from 'vitest'

// Budget of the contact entry (`@asteby/storefront-react/contact`): WhatsApp bubble, phone link, url helpers, es/en texts
// Peers external.
// 4 KB: it is a single link, a glyph and a handful of pure helpers.
const BUDGET_GZ = 4 * 1024
const here = fileURLToPath(new URL('.', import.meta.url))

describe('contact bundle size', () => {
  it('stays under the gzip budget', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-contact-size-'))
    try {
      mkdirSync(join(dir, 'out'))
      const entry = join(dir, 'entry.ts')
      writeFileSync(entry, `export * from ${JSON.stringify(join(here, 'index.ts'))}\n`)
      await build({
        entry: { contact: entry },
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
      expect(gz, `tracking: ${gz} B gzip (budget ${BUDGET_GZ})`).toBeLessThanOrEqual(BUDGET_GZ)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})

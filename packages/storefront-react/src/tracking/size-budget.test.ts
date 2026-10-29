import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'tsup'
import { describe, expect, it } from 'vitest'

// Budget of the tracking entry (`@asteby/storefront-react/tracking`): timeline, tracker, public lookup, map loader
// (without the map library: the host passes `() => import('@asteby/metacore-maps')`), es/en texts. Peers external.
// 15 KB: it reuses the order screens' es/en texts for the shipment statuses (a store with accounts already ships them).
const BUDGET_GZ = 15 * 1024
const here = fileURLToPath(new URL('.', import.meta.url))

describe('tracking bundle size', () => {
  it('stays under the gzip budget and never bundles a map library', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-trk-size-'))
    try {
      mkdirSync(join(dir, 'out'))
      const entry = join(dir, 'entry.ts')
      writeFileSync(entry, `export * from ${JSON.stringify(join(here, 'index.ts'))}\n`)
      await build({
        entry: { tracking: entry },
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
      for (const f of files) expect(readFileSync(join(dir, 'out', f), 'utf8')).not.toMatch(/maplibre|metacore-maps/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})

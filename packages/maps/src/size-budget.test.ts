// Size budget (plan §0.2): the package's initial chunk stays under 15 KB gzip,
// the registration entry is near zero, and MapLibre is never part of the
// static graph — it is a dynamic import only. Bundles the sources with
// esbuild (peers external) so the check does not depend on a prior build.
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const entries = { index: 'src/index.ts', register: 'src/register.ts', view: 'src/view.ts', panel: 'src/panel.ts', 'timeline-panel': 'src/timeline-panel.ts' }

async function bundle() {
    const res = await build({
        absWorkingDir: root,
        entryPoints: entries,
        bundle: true,
        splitting: true,
        format: 'esm',
        outdir: 'out',
        write: false,
        minify: true,
        target: 'es2022',
        platform: 'browser',
        jsx: 'automatic',
        external: ['react', 'react-dom', 'react/jsx-runtime', 'maplibre-gl', 'maplibre-gl/*', 'pmtiles', 'react-i18next', '@asteby/*'],
        logLevel: 'silent',
    })
    return new Map(res.outputFiles.map((f) => [path.basename(f.path), f.text]))
}

/** Files reachable from `name` through static `import … from "./x.js"` only. */
function staticClosure(files: Map<string, string>, name: string): string[] {
    const seen = new Set<string>()
    const walk = (n: string) => {
        if (seen.has(n)) return
        seen.add(n)
        const src = files.get(n) ?? ''
        for (const m of src.matchAll(/(?:^|[;}\s])(?:import|export)\b[^"'`()]*?from\s*"\.\/([^"]+)"/g)) walk(m[1] as string)
        for (const m of src.matchAll(/(?:^|[;}])import"\.\/([^"]+)"/g)) walk(m[1] as string)
    }
    walk(name)
    return [...seen]
}

const gz = (files: Map<string, string>, names: string[]) => names.reduce((n, f) => n + gzipSync(files.get(f) ?? '', { level: 9 }).length, 0)

describe('size budget', () => {
    it('keeps the initial chunk under 15 KB gzip and register tiny', async () => {
        const files = await bundle()
        const index = gz(files, staticClosure(files, 'index.js'))
        const register = gz(files, staticClosure(files, 'register.js'))
        // eslint-disable-next-line no-console
        console.log(`[size] index.js static closure: ${(index / 1024).toFixed(2)} KB gzip; register.js: ${(register / 1024).toFixed(2)} KB gzip`)
        expect(index).toBeLessThan(15 * 1024)
        expect(register).toBeLessThan(1024)
    })

    it('never loads maplibre-gl or pmtiles statically', async () => {
        const files = await bundle()
        for (const entry of ['index.js', 'register.js', 'view.js', 'panel.js', 'timeline-panel.js']) {
            for (const f of staticClosure(files, entry)) {
                const src = files.get(f) ?? ''
                expect(src, `${entry} → ${f}`).not.toMatch(/(?:from|import)\s*["']maplibre-gl/)
                expect(src, `${entry} → ${f}`).not.toMatch(/(?:from|import)\s*["']pmtiles["']/)
            }
        }
        // maplibre is reachable only through a dynamic import().
        expect([...files.values()].some((s) => /import\("maplibre-gl"\)/.test(s))).toBe(true)
    })

    it('keeps the renderers out of the registration chunk', async () => {
        const files = await bundle()
        const closure = staticClosure(files, 'register.js')
        expect(closure.join(' ')).not.toMatch(/view|panel/)
        expect(files.get('register.js')).toMatch(/import\("\.\/(view|panel|timeline-panel)/)
    })
})

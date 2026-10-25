// Size budget: the light entry never reaches recharts statically (it is a
// dynamic import only) and Sparkline imports 0 KB of recharts. Bundles the
// sources with esbuild so the check does not depend on a prior build.
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const entries = { index: 'src/index.ts', sparkline: 'src/sparkline.tsx', recharts: 'src/recharts.ts' }

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
        external: ['react', 'react-dom', 'react/jsx-runtime', 'recharts', 'recharts/*'],
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
const importsRecharts = (src: string) => /(?:from|import)\s*\(?\s*["']recharts/.test(src)

describe('size budget', () => {
    it('keeps recharts out of the static closure of the light entries', async () => {
        const files = await bundle()
        for (const entry of ['index.js', 'sparkline.js']) {
            for (const f of staticClosure(files, entry)) {
                expect(importsRecharts(files.get(f) ?? ''), `${entry} → ${f}`).toBe(false)
            }
        }
        // recharts is reachable only through a dynamic import() of the bodies chunk…
        const dynamicTargets = [...(files.get('index.js') ?? '').matchAll(/import\("\.\/([^"]+)"\)/g)].map((m) => m[1] as string)
        expect(dynamicTargets.length).toBeGreaterThan(0)
        expect(dynamicTargets.some((t) => staticClosure(files, t).some((f) => importsRecharts(files.get(f) ?? '')))).toBe(true)
        // …and the explicit heavy entry does import it statically.
        expect(staticClosure(files, 'recharts.js').some((f) => importsRecharts(files.get(f) ?? ''))).toBe(true)
    })

    it('Sparkline pulls 0 KB of recharts and stays tiny', async () => {
        const files = await bundle()
        const closure = staticClosure(files, 'sparkline.js')
        expect(closure.some((f) => importsRecharts(files.get(f) ?? ''))).toBe(false)
        const size = gz(files, closure)
        // eslint-disable-next-line no-console
        console.log(`[size] sparkline.js static closure: ${(size / 1024).toFixed(2)} KB gzip`)
        expect(size).toBeLessThan(4 * 1024)
    })

    it('keeps the initial chunk of the light entry under 8 KB gzip', async () => {
        const files = await bundle()
        const size = gz(files, staticClosure(files, 'index.js'))
        // eslint-disable-next-line no-console
        console.log(`[size] index.js static closure: ${(size / 1024).toFixed(2)} KB gzip`)
        expect(size).toBeLessThan(8 * 1024)
    })
})

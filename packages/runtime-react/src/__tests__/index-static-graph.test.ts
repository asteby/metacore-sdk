// Guards the host's first paint: the package index must not reach recharts (or
// any other heavy charting/map library) through STATIC imports. Dynamic
// `import()` is allowed — that is how ./widgets/lazy-charts defers it.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HEAVY = ['recharts', 'maplibre-gl', 'leaflet', 'echarts', 'd3', '@visx']

function resolveLocal(from: string, spec: string): string | null {
    const base = resolve(dirname(from), spec)
    for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
        if (existsSync(c) && statSync(c).isFile()) return c
    }
    return null
}

// Static specifiers: `import ... from 'x'`, `import 'x'`, `export ... from 'x'`.
// `import type` / `export type` are erased and skipped.
function staticSpecifiers(code: string): string[] {
    const out: string[] = []
    const re = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/g
    for (const m of code.matchAll(re)) if (!m[1]) out.push(m[2])
    return out
}

function staticGraph(entry: string) {
    const seen = new Set<string>()
    const external = new Map<string, string>() // pkg -> first importer
    const walk = (file: string) => {
        if (seen.has(file)) return
        seen.add(file)
        for (const spec of staticSpecifiers(readFileSync(file, 'utf8'))) {
            if (spec.startsWith('.')) {
                const next = resolveLocal(file, spec)
                if (next) walk(next)
            } else if (!external.has(spec)) {
                external.set(spec, file.slice(SRC.length + 1))
            }
        }
    }
    walk(entry)
    return { seen, external }
}

describe('runtime-react index static graph', () => {
    const { seen, external } = staticGraph(join(SRC, 'index.ts'))

    it('walks a non-trivial graph (guards against a broken walker)', () => {
        expect(seen.size).toBeGreaterThan(50)
        expect(external.has('react')).toBe(true)
    })

    it.each(HEAVY)('does not statically reach %s', (lib) => {
        const hit = [...external].find(([spec]) => spec === lib || spec.startsWith(`${lib}/`))
        expect(hit && `${hit[0]} imported from ${hit[1]}`).toBeUndefined()
    })

    it.each([
        'views/chart-view.tsx',
        'views/timeline-view.tsx',
        'views/calendar-view.tsx',
        'views/split-view.tsx',
        'views/map-view.tsx',
        'views/panels.tsx',
        'testing.tsx',
    ])('loads %s lazily (declarative renderers by type, test helpers never)', (file) => {
        expect(seen.has(join(SRC, file))).toBe(false)
    })

    it('reaches the view registry and the federated page host (light modules)', () => {
        expect(seen.has(join(SRC, 'views/registry.tsx'))).toBe(true)
        expect(seen.has(join(SRC, 'addon-page-loader.tsx'))).toBe(true)
        expect(external.has('@testing-library/react')).toBe(false)
    })

    it('keeps the recharts-backed module out of the static graph', () => {
        expect(seen.has(join(SRC, 'widgets/charts.tsx'))).toBe(false)
        expect(seen.has(join(SRC, 'widgets/lazy-charts.tsx'))).toBe(true)
    })
})

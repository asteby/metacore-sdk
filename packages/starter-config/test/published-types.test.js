// Guard: the published TypeScript surface (vite-preset.d.ts re-exports the
// shipped vite-preset.ts, so consumers typecheck that source) must not import
// a bare module that is absent from `dependencies` / non-optional
// `peerDependencies`. Otherwise hosts without the optional peer installed fail
// with TS2307 (see @tanstack/router-plugin). An import is allowed when the
// preceding line is a `@ts-ignore` (consumer-safe, locally typed).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const optional = new Set(
  Object.entries(pkg.peerDependenciesMeta ?? {})
    .filter(([, m]) => m.optional)
    .map(([n]) => n)
)
const allowed = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}).filter((n) => !optional.has(n)),
])

const pkgName = (spec) =>
  spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]

const SPEC = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/

test('published .ts/.d.ts only import required (non-optional) packages', () => {
  const typed = pkg.files.filter((f) => /\.(d\.)?ts$/.test(f))
  assert.ok(typed.length > 0)
  const offenders = []
  for (const file of typed) {
    const lines = readFileSync(path.join(root, file), 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (/^\s*(\*|\/\/)/.test(line)) return
      const m = SPEC.exec(line)
      if (!m) return
      const spec = m[1]
      if (spec.startsWith('.') || spec.startsWith('node:')) return
      const name = pkgName(spec)
      if (builtinModules.includes(name) || allowed.has(name)) return
      if (/@ts-ignore/.test(lines[i - 1] ?? '')) return
      offenders.push(`${file}:${i + 1} imports "${spec}" (not a required dependency/peer)`)
    })
  }
  assert.deepEqual(offenders, [])
})

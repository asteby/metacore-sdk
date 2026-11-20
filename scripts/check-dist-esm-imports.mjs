#!/usr/bin/env node
// Falla si algun paquete publicable emite en dist/ (.js y .d.ts) imports que
// Node ESM no resuelve: relativos sin extension, JSON sin `with { type: 'json' }`
// (solo .js) o subpaths bare de dependencias sin `exports` y sin extension
// (solo .js). Vite/bundlers los toleran; Node (vitest, SSR, scripts) no.
// Ver @asteby/metacore-lib 0.12.0.
//
// Uso: node scripts/check-dist-esm-imports.mjs [dir-de-paquete ...]
//   sin args: todos los packages/* publicables que tengan dist/. Requiere build previo.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { moduleSpecifiers, walkDist } from './esm-specifiers.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RESOLVABLE = /\.(m?js|cjs|json|node|wasm)$/

// Subpaths bare conocidos y aceptados (dependencia sin `exports`, sin forma
// portable entre las versiones del peer range). `<paquete>: [spec, ...]`.
const KNOWN_BARE = {
  'packages/runtime-react': ['lucide-react/dynamicIconImports'], // 0.x solo .js, 1.x solo .mjs
  'packages/ui': ['lucide-react/dynamicIconImports'], // import() perezoso
}

function bareParts(spec) {
  const m = /^((?:@[^/]+\/)?[^/]+)\/(.+)$/.exec(spec)
  return m ? { name: m[1], sub: m[2] } : null
}

function findDep(fromDir, name) {
  for (let d = fromDir; ; d = dirname(d)) {
    const p = join(d, 'node_modules', name)
    if (existsSync(join(p, 'package.json'))) return p
    if (dirname(d) === d) return null
  }
}

export function scanPackage(pkgDir) {
  const dist = join(pkgDir, 'dist')
  const rel = pkgDir.slice(root.length + 1)
  const known = new Set(KNOWN_BARE[rel] ?? [])
  const bad = []
  if (!existsSync(dist)) return bad
  for (const file of walkDist(dist)) {
    const isDts = file.endsWith('.d.ts')
    const src = readFileSync(file, 'utf8')
    const where = file.slice(root.length + 1)
    for (const m of moduleSpecifiers(file, src)) {
      const { spec } = m
      if (/^\.{1,2}(\/|$)/.test(spec)) {
        if (spec.endsWith('.json')) {
          if (!isDts && !m.attrs) bad.push(`${where}: '${spec}' (JSON sin 'with { type: "json" }')`)
        } else if (!RESOLVABLE.test(spec)) {
          bad.push(`${where}: '${spec}'`)
        }
        continue
      }
      if (isDts || spec.startsWith('node:')) continue
      const parts = bareParts(spec)
      if (!parts || RESOLVABLE.test(parts.sub) || known.has(spec)) continue
      const dep = findDep(pkgDir, parts.name)
      if (!dep) continue
      const pj = JSON.parse(readFileSync(join(dep, 'package.json'), 'utf8'))
      if (!pj.exports) bad.push(`${where}: '${spec}' (subpath bare de ${parts.name}, que no declara "exports")`)
    }
  }
  return bad
}

function publishablePackages() {
  const base = join(root, 'packages')
  return readdirSync(base)
    .map((n) => join(base, n))
    .filter((d) => existsSync(join(d, 'package.json')))
    .filter((d) => {
      const pj = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8'))
      return !pj.private && pj.type === 'module'
    })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2).map((a) => resolve(a))
  const pkgs = args.length ? args : publishablePackages()
  let failed = 0
  let checked = 0
  for (const p of pkgs) {
    if (!existsSync(join(p, 'dist'))) continue
    checked++
    const bad = scanPackage(p)
    if (bad.length) {
      failed++
      console.error(`\n${p.slice(root.length + 1)}: ${bad.length} import(s) que Node ESM no resuelve en dist/:`)
      for (const b of bad.slice(0, 10)) console.error(`  ${b}`)
      if (bad.length > 10) console.error(`  ... +${bad.length - 10}`)
    }
  }
  if (failed) {
    console.error(`\nFAIL: ${failed} paquete(s). Usa .js explicito en imports relativos (o el postbuild fix-dist-esm-imports).`)
    process.exit(1)
  }
  console.log(`OK: ${checked} paquete(s) sin imports que Node ESM no resuelva en dist/`)
}

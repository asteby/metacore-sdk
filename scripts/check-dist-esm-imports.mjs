#!/usr/bin/env node
// Falla si algun paquete publicable emite en dist/ imports relativos que Node
// ESM no resuelve (sin extension, o apuntando a un directorio). Vite/bundlers
// los toleran; Node (vitest, SSR, scripts) no. Ver @asteby/metacore-lib 0.12.0.
//
// Uso: node scripts/check-dist-esm-imports.mjs [dir-de-paquete ...]
//   sin args: todos los packages/* publicables que tengan dist/. Requiere build previo.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RESOLVABLE = /\.(m?js|cjs|json|node|wasm)$/

// from '...' / import '...' / import('...') / export ... from '...'
const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"]*|\.{1,2})\1/g

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (/\.m?js$/.test(name)) yield p
  }
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

export function scanPackage(pkgDir) {
  const dist = join(pkgDir, 'dist')
  const bad = []
  if (!existsSync(dist)) return bad
  for (const file of walk(dist)) {
    const src = stripComments(readFileSync(file, 'utf8'))
    for (const m of src.matchAll(SPEC)) {
      const spec = m[2]
      if (spec.endsWith('.json')) {
        // Node exige `with { type: 'json' }` en imports estaticos de JSON.
        const tail = src.slice(m.index + m[0].length, m.index + m[0].length + 40)
        if (!/^\s*(?:with|assert)\s*\{/.test(tail)) bad.push(`${file.slice(root.length + 1)}: '${spec}' (JSON sin 'with { type: "json" }')`)
        continue
      }
      if (RESOLVABLE.test(spec)) continue
      bad.push(`${file.slice(root.length + 1)}: '${spec}'`)
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
      console.error(`\n${p.slice(root.length + 1)}: ${bad.length} import(s) relativo(s) sin extension en dist/ (Node ESM no los resuelve):`)
      for (const b of bad.slice(0, 10)) console.error(`  ${b}`)
      if (bad.length > 10) console.error(`  ... +${bad.length - 10}`)
    }
  }
  if (failed) {
    console.error(`\nFAIL: ${failed} paquete(s). Usa extensiones .js explicitas en los imports relativos del fuente.`)
    process.exit(1)
  }
  console.log(`OK: ${checked} paquete(s) sin imports relativos sin extension en dist/`)
}

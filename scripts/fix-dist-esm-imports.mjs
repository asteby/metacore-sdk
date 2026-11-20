#!/usr/bin/env node
// Postbuild para paquetes compilados con tsc + moduleResolution "Bundler": el
// fuente usa imports relativos sin extension (validos para bundlers) y tsc los
// emite tal cual, lo que Node ESM no resuelve. Reescribe dist/**/*.{js,d.ts} a
// './x.js' o './x/index.js' segun lo que exista en disco.
// Uso: node ../../scripts/fix-dist-esm-imports.mjs [dist-dir]   (default ./dist)
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const dist = resolve(process.argv[2] ?? 'dist')
if (!existsSync(dist)) {
  console.error(`fix-dist-esm-imports: ${dist} no existe`)
  process.exit(1)
}

const SPEC = /((?:\bfrom\s*|\bimport\s*\(?\s*)['"])(\.{1,2}(?:\/[^'"]*)?)(['"])/g
const HAS_EXT = /\.(m?js|cjs|json|node|wasm|css)$/

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (/\.(m?js|d\.ts)$/.test(name)) yield p
  }
}

const isFile = (p) => existsSync(p) && statSync(p).isFile()
const isDir = (p) => existsSync(p) && statSync(p).isDirectory()

function fix(file, spec) {
  if (HAS_EXT.test(spec) && isFile(resolve(dirname(file), spec))) return spec
  const abs = resolve(dirname(file), spec)
  const ext = file.endsWith('.d.ts') ? '.d.ts' : '.js'
  const outExt = '.js'
  if (isFile(abs + ext)) return spec + outExt
  if (isDir(abs) && isFile(join(abs, 'index' + ext))) return spec.replace(/\/$/, '') + '/index.js'
  return spec
}

let files = 0
let rewrites = 0
for (const file of walk(dist)) {
  const src = readFileSync(file, 'utf8')
  const out = src.replace(SPEC, (all, pre, spec, post) => {
    const next = fix(file, spec)
    if (next === spec) return all
    rewrites++
    return pre + next + post
  })
  if (out !== src) {
    writeFileSync(file, out)
    files++
  }
}
console.log(`fix-dist-esm-imports: ${rewrites} import(s) reescritos en ${files} archivo(s)`)

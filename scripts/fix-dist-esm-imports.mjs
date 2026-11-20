#!/usr/bin/env node
// Postbuild para paquetes compilados con tsc + moduleResolution "Bundler": el
// fuente usa imports relativos sin extension (validos para bundlers) y tsc los
// emite tal cual, lo que Node ESM no resuelve. Reescribe dist/**/*.{js,d.ts} a
// './x.js' o './x/index.js' segun lo que exista en disco. Usa el parser de TS
// (solo especificadores reales, nunca literales ni comentarios) y FALLA si un
// destino relativo no existe.
// Uso: node ../../scripts/fix-dist-esm-imports.mjs [dist-dir]   (default ./dist)
// Nota: `dev` (`tsc -w`) NO lo ejecuta; en watch los imports quedan sin extension
// (basta para Vite/bundlers). Corre `pnpm build` antes de probar en Node.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { moduleSpecifiers, walkDist } from './esm-specifiers.mjs'

const dist = resolve(process.argv[2] ?? 'dist')
if (!existsSync(dist)) {
  console.error(`fix-dist-esm-imports: ${dist} no existe`)
  process.exit(1)
}

const HAS_EXT = /\.(m?js|cjs|json|node|wasm|css)$/
const isFile = (p) => existsSync(p) && statSync(p).isFile()
const isDir = (p) => existsSync(p) && statSync(p).isDirectory()

function fix(file, spec) {
  const abs = resolve(dirname(file), spec)
  if (HAS_EXT.test(spec) && isFile(abs)) return spec
  const ext = file.endsWith('.d.ts') ? '.d.ts' : '.js'
  if (isFile(abs + ext)) return spec + '.js'
  if (isDir(abs) && isFile(join(abs, 'index' + ext))) return spec.replace(/\/$/, '') + '/index.js'
  return null
}

let files = 0
let rewrites = 0
const errors = []
for (const file of walkDist(dist)) {
  const src = readFileSync(file, 'utf8')
  const edits = []
  for (const m of moduleSpecifiers(file, src)) {
    if (!/^\.{1,2}(\/|$)/.test(m.spec)) continue
    const next = fix(file, m.spec)
    if (next === null) errors.push(`${file}: '${m.spec}' no existe`)
    else if (next !== m.spec) edits.push({ ...m, next })
  }
  if (!edits.length) continue
  let out = src
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.next + out.slice(e.end)
  writeFileSync(file, out)
  rewrites += edits.length
  files++
}
if (errors.length) {
  console.error('fix-dist-esm-imports: destinos inexistentes:\n  ' + errors.join('\n  '))
  process.exit(1)
}
console.log(`fix-dist-esm-imports: ${rewrites} import(s) reescritos en ${files} archivo(s)`)

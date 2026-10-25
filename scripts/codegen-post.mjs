#!/usr/bin/env node
// Post-proceso de `pnpm codegen` (tygo). tygo no sabe resolver las constantes de
// `time` y emite `export const X = 24 * any /* time.Hour */;`, que no compila en
// TS ("'any' only refers to a type"). Las reemplazamos por su valor en
// MILISEGUNDOS (los time.Duration de Go son nanosegundos; en TS usamos ms).
// Es determinista: el gate de CI corre tygo + este script y compara con git diff.
import { readFileSync, writeFileSync } from 'node:fs'

const MS = { Nanosecond: 1e-6, Microsecond: 1e-3, Millisecond: 1, Second: 1000, Minute: 60000, Hour: 3600000 }
const files = process.argv.slice(2)
if (files.length === 0) files.push('packages/sdk/src/generated/manifest-v3.ts', 'packages/sdk/src/generated/manifest.ts')

let total = 0
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const out = src.replace(/^(export const \w+ = [^\n]*?)any \/\* time\.(\w+) \*\/([^\n]*;)$/gm, (_m, pre, unit, post) => {
    if (!(unit in MS)) throw new Error(`${f}: unidad desconocida time.${unit}`)
    total++
    return `${pre}${MS[unit]} /* time.${unit} en ms */${post}`
  })
  if (out !== src) writeFileSync(f, out)
}
console.log(`codegen-post: ${total} constantes de time.* resueltas`)

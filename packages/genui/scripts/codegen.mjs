#!/usr/bin/env node
// Codegen de genui/v2 (ADR 0001 del SDK, §2.7): el JSON Schema es la fuente única.
//   schema/genui-v2.schema.json -> src/generated/genui-v2.ts          (tipos TS)
//                               -> src/generated/genui-v2-schema.ts   (esquema embebido + tablas por bloque)
// Determinista: el gate de CI corre este script y falla con `git diff`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from 'json-schema-to-typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const schemaPath = resolve(root, 'schema/genui-v2.schema.json')
const outDir = resolve(root, 'src/generated')
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
mkdirSync(outDir, { recursive: true })

const banner = '/* eslint-disable */\n// GENERADO por packages/genui/scripts/codegen.mjs desde schema/genui-v2.schema.json. No editar a mano: corre `pnpm --filter @asteby/metacore-genui codegen`.\n'

const ts = await compile(structuredClone(schema), 'GenUIV2', {
  bannerComment: '',
  additionalProperties: false,
  unreachableDefinitions: true,
  declareExternallyReferenced: true,
  style: { singleQuote: true, semi: false },
})
writeFileSync(resolve(outDir, 'genui-v2.ts'), banner + ts)

// Tablas derivadas: campos permitidos y requeridos por tipo de bloque.
const blocks = {}
for (const [name, def] of Object.entries(schema.$defs)) {
  if (!name.startsWith('block_')) continue
  blocks[name.slice(6)] = {
    allowed: Object.keys(def.properties),
    required: def.required,
  }
}
const body =
  banner +
  `export const GENUI_V2_SCHEMA = ${JSON.stringify(schema, null, 2)} as const\n\n` +
  `/** Campos permitidos y requeridos por tipo de bloque (derivado del esquema). */\n` +
  `export const GENUI_V2_BLOCKS: Readonly<Record<string, { readonly allowed: readonly string[]; readonly required: readonly string[] }>> = ${JSON.stringify(blocks, null, 2)}\n`
writeFileSync(resolve(outDir, 'genui-v2-schema.ts'), body)
console.log(`genui codegen: ${Object.keys(blocks).length} bloques`)

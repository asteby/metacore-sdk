#!/usr/bin/env node
// Guard: no NEW `.data.data` envelope unwrapping in the SDK.
//
// Use `unwrapResponse` / `unwrapEnvelope` / `unwrapList` from
// `@asteby/metacore-lib/envelope` instead. Existing occurrences are a ratchet
// baseline (scripts/data-data-baseline.json: file -> allowed count). A file may
// never exceed its baseline and a file without baseline allows 0. As you migrate
// call sites run `node scripts/check-no-data-data.mjs --update` to lower it.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const baselinePath = join(root, 'scripts/data-data-baseline.json')
const RE = /\.data\??\.data\b/g

const files = execFileSync('git', ['ls-files', 'packages', 'templates', 'examples'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.|\.d\.ts$|\/generated\//.test(f))

const counts = {}
for (const f of files) {
  const n = (readFileSync(join(root, f), 'utf8').match(RE) ?? []).length
  if (n) counts[f] = n
}

if (process.argv.includes('--update')) {
  writeFileSync(baselinePath, JSON.stringify(counts, null, 2) + '\n')
  console.log(`baseline updated (${Object.keys(counts).length} files)`)
  process.exit(0)
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const bad = Object.entries(counts).filter(([f, n]) => n > (baseline[f] ?? 0))
if (bad.length) {
  console.error('New `.data.data` usage (use unwrapResponse/unwrapEnvelope/unwrapList from @asteby/metacore-lib/envelope):')
  for (const [f, n] of bad) console.error(`  ${f}: ${n} (allowed ${baseline[f] ?? 0})`)
  process.exit(1)
}
const stale = Object.keys(baseline).filter((f) => (counts[f] ?? 0) < baseline[f])
if (stale.length) console.log(`note: ${stale.length} file(s) are below baseline; run --update to ratchet down.`)
console.log('ok: no new .data.data')

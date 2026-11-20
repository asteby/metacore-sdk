#!/usr/bin/env node
// `npm pack` de cada paquete y import() en Node ESM de cada subpath de `exports`
// desde el tarball instalado (lo que recibiria un consumidor). Requiere build previo.
// Uso: node scripts/check-packed-esm.mjs lib sdk ui
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const names = process.argv.slice(2)
let failed = 0
for (const n of names) {
  const dir = join(root, 'packages', n)
  if (!existsSync(join(dir, 'dist'))) {
    console.log(`skip ${n}: sin dist`)
    continue
  }
  const pj = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const tmp = mkdtempSync(join(tmpdir(), `pack-${n}-`))
  const out = execFileSync('npm', ['pack', '--json', '--pack-destination', tmp], { cwd: dir, encoding: 'utf8' })
  const tgz = join(tmp, JSON.parse(out)[0].filename)
  const app = join(tmp, 'app')
  mkdirSync(app)
  writeFileSync(join(app, 'package.json'), '{"name":"probe","type":"module","private":true}')
  // Extrae el tarball a node_modules/<name>; las deps/peers se resuelven del monorepo.
  const target = join(app, 'node_modules', ...pj.name.split('/'))
  mkdirSync(target, { recursive: true })
  execFileSync('tar', ['-xzf', tgz, '-C', target, '--strip-components=1'])
  execFileSync('ln', ['-s', join(dir, 'node_modules'), join(target, 'node_modules')])
  const subs = Object.entries(pj.exports ?? { '.': pj.main })
    .filter(([k, v]) => !k.includes('*') && (typeof v === 'string' || v?.import || v?.default))
    .map(([k]) => (k === '.' ? pj.name : `${pj.name}/${k.slice(2)}`))
  for (const spec of subs) {
    try {
      execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(spec)})`], {
        cwd: app,
        stdio: 'pipe',
      })
      console.log(`ok   ${spec}`)
    } catch (e) {
      failed++
      console.error(`FAIL ${spec}: ${String(e.stderr).split('\n').find((l) => /Error/.test(l)) ?? e.message}`)
    }
  }
}
if (failed) process.exit(1)

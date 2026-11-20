/**
 * Tests for the metacore-tailwind-sources checker/writer.
 * Run: node --test packages/starter-config/test/tailwind-sources.test.js
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { METACORE_TAILWIND_SOURCE_PACKAGES } from '../tailwind-sources.js'

const bin = fileURLToPath(new URL('../bin/metacore-tailwind-sources.mjs', import.meta.url))

function app(css, deps) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tw-src-'))
  mkdirSync(path.join(dir, 'src/styles'), { recursive: true })
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: deps }))
  writeFileSync(path.join(dir, 'src/styles/index.css'), css)
  return dir
}
const run = (dir, cmd) => spawnSync('node', [bin, cmd], { cwd: dir, encoding: 'utf8' })

test('list covers the packages ops uses but hand-written @source omitted', () => {
  for (const n of ['genui', 'integrations', 'org-ai', 'maps', 'permissions'])
    assert.ok(METACORE_TAILWIND_SOURCE_PACKAGES.includes(`@asteby/metacore-${n}`), n)
})

test('check fails listing the missing SDK dependency', () => {
  const dir = app('@source "../../node_modules/@asteby/metacore-ui";', {
    '@asteby/metacore-ui': '1',
    '@asteby/metacore-genui': '1',
  })
  try {
    const r = run(dir, 'check')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /metacore-genui/)
    assert.doesNotMatch(r.stderr, /- @asteby\/metacore-ui\n/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('check passes when covered or when theme sources.css is imported', () => {
  const deps = { '@asteby/metacore-ui': '1', '@asteby/metacore-genui': '1' }
  const a = app(
    '@source "../../node_modules/@asteby/metacore-ui";\n@source "../../node_modules/@asteby/metacore-genui";',
    deps
  )
  const b = app("@import '@asteby/metacore-theme/sources.css';", deps)
  try {
    assert.equal(run(a, 'check').status, 0)
    assert.equal(run(b, 'check').status, 0)
  } finally {
    rmSync(a, { recursive: true, force: true })
    rmSync(b, { recursive: true, force: true })
  }
})

test('write emits app-relative @source lines that then pass check via @import', () => {
  const dir = app("@import './metacore-sources.css';", { '@asteby/metacore-genui': '1' })
  try {
    assert.equal(run(dir, 'write').status, 0)
    const out = readFileSync(path.join(dir, 'src/styles/metacore-sources.css'), 'utf8')
    assert.match(out, /@source "\.\.\/\.\.\/node_modules\/@asteby\/metacore-genui";/)
    assert.equal(run(dir, 'check').status, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

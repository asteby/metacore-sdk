/**
 * Tests for hostProvided, the hand-rolled `shared` guard and the pwa stub alias.
 * Run: node --test packages/starter-config/test/federation-plugin.test.js
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  assertNoHandRolledFederationShared,
  detectHandRolledFederationShared,
  metacoreFederationAliases,
  metacoreFederationPlugin,
  metacoreFederationShared,
} from '../vite-preset.js'

test('hostProvided declares singleton + import:false; overrides can relax requiredVersion', () => {
  const cfg = metacoreFederationShared({
    host: 'metacore_demo',
    exposes: { './register': './src/register.tsx' },
    hostProvided: ['@asteby/metacore-ui', '@asteby/metacore-runtime-react'],
    overrides: { '@asteby/metacore-runtime-react': { requiredVersion: false } },
    extras: ['sonner'],
  })
  assert.deepEqual(cfg.shared['@asteby/metacore-ui'], { singleton: true, import: false })
  assert.deepEqual(cfg.shared['@asteby/metacore-runtime-react'], {
    singleton: true,
    import: false,
    requiredVersion: false,
  })
  assert.deepEqual(cfg.shared.sonner, { singleton: true })
  // The canonical remote host-only router share is kept.
  assert.equal(cfg.shared['@tanstack/react-router'].import, false)
})

test('detects a hand-written shared map', () => {
  const hand = `import { federation } from '@module-federation/vite'
const shared = { react: { singleton: true } }
export default { plugins: [federation({ name: 'x', shared })] }`
  assert.match(detectHandRolledFederationShared(hand), /metacoreFederationShared/)
  assert.throws(() => assertNoHandRolledFederationShared(hand, 'v.ts'), /v\.ts.*hand-written/)
})

test('accepts configs that use the helper', () => {
  const ok = `import { federation } from '@module-federation/vite'
import { metacoreFederationShared } from '@asteby/metacore-starter-config/vite'
export default { plugins: [federation(metacoreFederationShared({ host: 'x' }))] }`
  assert.equal(detectHandRolledFederationShared(ok), null)
  assert.equal(detectHandRolledFederationShared('export default {}'), null)
})

test('plugin provides the pwa stub alias and the stub file exists', () => {
  const p = metacoreFederationPlugin()
  const cfg = p.config()
  const target = cfg.resolve.alias['virtual:pwa-register/react']
  assert.equal(target, metacoreFederationAliases['virtual:pwa-register/react'])
  assert.ok(existsSync(target))
})

test('plugin fails the build for a hand-rolled config, warns in warn mode, skips in off mode', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fed-guard-'))
  try {
    const file = path.join(dir, 'vite.config.ts')
    writeFileSync(file, `const shared = { react: { singleton: true } }`)
    const logs = []
    const config = { configFile: file, logger: { warn: (m) => logs.push(m) } }
    assert.throws(() => metacoreFederationPlugin().configResolved(config), /hand-written/)
    metacoreFederationPlugin({ handRolledShared: 'warn' }).configResolved(config)
    assert.equal(logs.length, 1)
    metacoreFederationPlugin({ handRolledShared: 'off' }).configResolved(config)
    assert.equal(logs.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

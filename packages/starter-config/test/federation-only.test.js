/**
 * Tests for the `only` option of metacoreFederationShared: reproduces the exact
 * `shared` maps of real addons (asteby-hq/addons, origin/main) and the guard.
 * Run: node --test packages/starter-config/test/federation-only.test.js
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertNoHandRolledFederationShared,
  assertMetacoreFederationShared,
  metacoreFederationPlugin,
  metacoreFederationShared,
  METACORE_FEDERATION_SINGLETONS,
} from '../vite-preset.js'

const exposes = { './register': './src/register.tsx' }
const gen = (opts) => metacoreFederationShared({ host: 'metacore_x', exposes, ...opts }).shared
const ROUTER = '@tanstack/react-router'
const noImport = { [ROUTER]: { import: undefined } }

test('only reproduces packages/pos/frontend exactly (requiredVersion:false, import:false)', () => {
  const original = {
    react: { singleton: true, requiredVersion: false },
    'react-dom': { singleton: true, requiredVersion: false },
    'react/jsx-runtime': { singleton: true, requiredVersion: false },
    sonner: { singleton: true, requiredVersion: false },
    '@asteby/metacore-ui': { singleton: true, requiredVersion: false, import: false },
    '@asteby/metacore-runtime-react': { singleton: true, requiredVersion: false, import: false },
    [ROUTER]: { singleton: true },
  }
  const got = gen({
    only: ['react', 'react-dom', 'react/jsx-runtime', ROUTER],
    hostProvided: ['@asteby/metacore-ui', '@asteby/metacore-runtime-react'],
    extras: ['sonner'],
    overrides: {
      react: { requiredVersion: false },
      'react-dom': { requiredVersion: false },
      'react/jsx-runtime': { requiredVersion: false },
      sonner: { requiredVersion: false },
      '@asteby/metacore-ui': { requiredVersion: false },
      '@asteby/metacore-runtime-react': { requiredVersion: false },
      ...noImport,
    },
  })
  assert.deepEqual(got, original)
})

test('only reproduces packages/warehouse/frontend exactly', () => {
  const original = {
    react: { singleton: true },
    'react-dom': { singleton: true },
    'react/jsx-runtime': { singleton: true },
    sonner: { singleton: true },
    '@asteby/metacore-ui': { singleton: true, import: false },
    '@asteby/metacore-runtime-react': { singleton: true },
    [ROUTER]: { singleton: true },
  }
  const got = gen({
    only: ['react', 'react-dom', 'react/jsx-runtime', '@asteby/metacore-runtime-react', ROUTER],
    hostProvided: ['@asteby/metacore-ui'],
    extras: ['sonner'],
    overrides: noImport,
  })
  assert.deepEqual(got, original)
})

test('only reproduces integrations/link-inbox/frontend exactly (no router)', () => {
  const original = {
    react: { singleton: true },
    'react-dom': { singleton: true },
    'react/jsx-runtime': { singleton: true },
    'react-i18next': { singleton: true },
    i18next: { singleton: true },
    'lucide-react': { singleton: true },
    sonner: { singleton: true },
    '@tanstack/react-query': { singleton: true },
    '@asteby/metacore-ui': { singleton: true },
    '@asteby/metacore-runtime-react': { singleton: true },
    '@asteby/metacore-sdk': { singleton: true },
    '@asteby/metacore-app-providers': { singleton: true },
    '@asteby/metacore-theme': { singleton: true },
    '@asteby/metacore-auth': { singleton: true },
  }
  const got = gen({
    only: METACORE_FEDERATION_SINGLETONS.filter((n) => n !== ROUTER),
    extras: ['lucide-react', 'sonner'],
  })
  assert.deepEqual(got, original)
})

test('only reproduces packages/storefront_content/frontend exactly (react only)', () => {
  const original = {
    react: { singleton: true },
    'react-dom': { singleton: true },
    'react/jsx-runtime': { singleton: true },
  }
  assert.deepEqual(gen({ only: ['react', 'react-dom', 'react/jsx-runtime'] }), original)
})

test('only: an unknown name throws a clear error', () => {
  assert.throws(
    () => gen({ only: ['react', 'sonner', 'nope'] }),
    /unknown `only` entries "sonner", "nope".*extras/
  )
})

test('only keeps the host-only router import:false on a remote, and omits it on a host', () => {
  assert.deepEqual(gen({ only: [ROUTER] }), { [ROUTER]: { singleton: true, import: false } })
  assert.deepEqual(
    metacoreFederationShared({ host: 'metacore_ops', only: [ROUTER] }).shared,
    { [ROUTER]: { singleton: true } }
  )
})

test('precedence: hostProvided/overrides/extra apply on top of only', () => {
  const s = gen({
    only: ['react'],
    hostProvided: ['@asteby/metacore-ui'],
    extra: { lodash: { singleton: true, requiredVersion: '^4' } },
    overrides: { react: { requiredVersion: '^19' } },
  })
  assert.deepEqual(s, {
    react: { singleton: true, requiredVersion: '^19' },
    '@asteby/metacore-ui': { singleton: true, import: false },
    lodash: { singleton: true, requiredVersion: '^4' },
  })
})

test('a mandatory singleton declared with singleton:false is still rejected under only', () => {
  assert.throws(() => gen({ only: ['react'], overrides: { react: { singleton: false } } }), /react/)
  assert.throws(() => assertMetacoreFederationShared({ react: { singleton: false } }, { partial: true }), /react/)
  assert.doesNotThrow(() => assertMetacoreFederationShared({ react: { singleton: true } }, { partial: true }))
  // Without `only` the full list is still mandatory.
  assert.throws(() => assertMetacoreFederationShared({ react: { singleton: true } }), /react-dom/)
})

test('without only the helper is unchanged (full list)', () => {
  const s = gen({})
  for (const n of METACORE_FEDERATION_SINGLETONS) assert.ok(s[n], n)
})

test('guard: a config generated with only passes; a hand-rolled map still fails', () => {
  const generated = `
import { federation } from '@module-federation/vite'
import { metacoreFederationShared } from '@asteby/metacore-starter-config/vite'
federation(metacoreFederationShared({ host: 'metacore_pos', exposes: {}, only: ['react'] }))`
  assert.doesNotThrow(() => assertNoHandRolledFederationShared(generated))
  const hand = `
import { federation } from '@module-federation/vite'
const shared = { react: { singleton: true } }
federation({ name: 'x', shared })`
  assert.throws(() => assertNoHandRolledFederationShared(hand), /hand-written/)
  assert.equal(typeof metacoreFederationPlugin, 'function')
})

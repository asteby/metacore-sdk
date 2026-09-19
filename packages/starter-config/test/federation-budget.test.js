/**
 * Unit tests for federation shared + dist budget helpers.
 * Run: node --test packages/starter-config/test/federation-budget.test.js
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  METACORE_FEDERATION_SINGLETONS,
  METACORE_FRONTEND_MAX_BYTES,
  METACORE_REMOTE_ENTRY_MAX_BYTES,
  assertFederationDistBudgets,
  assertMetacoreFederationShared,
  metacoreFederationShared,
} from '../vite-preset.js'

test('metacoreFederationShared includes every mandatory singleton', () => {
  const cfg = metacoreFederationShared({ host: 'metacore_demo' })
  for (const name of METACORE_FEDERATION_SINGLETONS) {
    assert.equal(cfg.shared[name]?.singleton, true, name)
  }
  assert.ok(cfg.shared['@tanstack/react-query']?.singleton)
})

test('assertMetacoreFederationShared rejects singleton:false override', () => {
  assert.throws(
    () =>
      metacoreFederationShared({
        host: 'metacore_demo',
        overrides: { react: { singleton: false } },
      }),
    /react.*singleton: true/
  )
})

test('assertFederationDistBudgets accepts thin remoteEntry', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fed-budget-'))
  try {
    writeFileSync(path.join(dir, 'remoteEntry.js'), 'export default 1\n')
    writeFileSync(path.join(dir, 'chunk.js'), 'x'.repeat(1024))
    const r = assertFederationDistBudgets(dir)
    assert.ok(r.remoteEntry > 0)
    assert.ok(r.total >= r.remoteEntry)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('assertFederationDistBudgets rejects oversized remoteEntry', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fed-budget-'))
  try {
    writeFileSync(
      path.join(dir, 'remoteEntry.js'),
      'x'.repeat(METACORE_REMOTE_ENTRY_MAX_BYTES + 1)
    )
    assert.throws(() => assertFederationDistBudgets(dir), /remoteEntry/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('assertFederationDistBudgets rejects oversized frontend total', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fed-budget-'))
  try {
    mkdirSync(path.join(dir, 'assets'))
    writeFileSync(path.join(dir, 'remoteEntry.js'), 'ok')
    writeFileSync(
      path.join(dir, 'assets', 'big.js'),
      'x'.repeat(METACORE_FRONTEND_MAX_BYTES)
    )
    assert.throws(() => assertFederationDistBudgets(dir), /frontend budget exceeded/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('assertMetacoreFederationShared rejects missing singleton', () => {
  assert.throws(
    () => assertMetacoreFederationShared({ react: { singleton: true } }),
    /react-dom/
  )
})

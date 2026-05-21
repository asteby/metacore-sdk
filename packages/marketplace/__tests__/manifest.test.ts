import { describe, expect, it } from 'vitest'
import {
  capabilityId,
  diffPermissions,
  diffRequiresConsent,
  normalizeManifest,
} from '../src/client/manifest'
import type { ManifestV2, ManifestV3, RawManifest } from '../src/client/types'

const v2Raw: ManifestV2 = {
  apiVersion: '2',
  key: 'fiscal_mexico',
  name: 'Fiscal MX',
  version: '1.0.0',
  capabilities: [
    { kind: 'db:read', target: 'users', reason: 'authors' },
    { kind: 'http:fetch', target: 'api.factura.com' },
  ],
}

const v3Raw: ManifestV3 = {
  apiVersion: '3',
  key: 'fiscal_mexico',
  name: 'Fiscal MX',
  version: '2.0.0',
  capabilities: [
    { kind: 'db:read', target: 'users', reason: 'authors' },
    { kind: 'http:fetch', target: 'api.factura.com', reason: 'Stamp CFDI' },
    { kind: 'event:emit', target: 'fiscal.stamped' },
  ],
  permissions: [
    { kind: 'http:fetch', target: 'api.factura.com', reason: 'Stamp CFDI' },
  ],
  consents: [{ key: 'telemetry', label: 'Send anonymized stats', default: false }],
}

describe('normalizeManifest', () => {
  it('flattens v2 capabilities into the unified permissions list', () => {
    const m = normalizeManifest(v2Raw)
    expect(m.apiVersion).toBe('2')
    expect(m.permissions).toHaveLength(2)
    expect(m.permissions.map(capabilityId).sort()).toEqual([
      'db:read|users',
      'http:fetch|api.factura.com',
    ])
    expect(m.consents).toEqual([])
  })

  it('merges v3 capabilities + permissions, prefers v3 permission copy on conflict', () => {
    const m = normalizeManifest(v3Raw)
    expect(m.apiVersion).toBe('3')
    expect(m.permissions).toHaveLength(3)
    const http = m.permissions.find((p) => p.kind === 'http:fetch')
    expect(http?.reason).toBe('Stamp CFDI')
    expect(m.consents).toHaveLength(1)
  })

  it('preserves raw shape on the normalized struct', () => {
    const m = normalizeManifest(v3Raw)
    expect(m.raw).toBe(v3Raw)
  })

  it('is idempotent — re-normalizing produces an equivalent shape', () => {
    const once = normalizeManifest(v3Raw)
    const twice = normalizeManifest(once.raw as RawManifest)
    expect(twice.permissions).toEqual(once.permissions)
    expect(twice.consents).toEqual(once.consents)
  })
})

describe('diffPermissions', () => {
  it('treats every permission as added when current is null', () => {
    const next = normalizeManifest(v3Raw)
    const diff = diffPermissions(null, next)
    expect(diff.every((r) => r.change === 'added')).toBe(true)
    expect(diff).toHaveLength(3)
  })

  it('detects added + modified + removed across v2 -> v3 upgrade', () => {
    const current = normalizeManifest(v2Raw)
    const next = normalizeManifest(v3Raw)
    const diff = diffPermissions(current, next)
    const byChange = Object.fromEntries(
      diff.map((r) => [r.id, r.change] as const),
    )
    // db:read|users — unchanged
    expect(byChange['db:read|users']).toBe('unchanged')
    // http:fetch|api.factura.com — reason changed in v3
    expect(byChange['http:fetch|api.factura.com']).toBe('modified')
    // event:emit|fiscal.stamped — new in v3
    expect(byChange['event:emit|fiscal.stamped']).toBe('added')
  })

  it('flags consent required when diff has additions or modifications', () => {
    const current = normalizeManifest(v2Raw)
    const next = normalizeManifest(v3Raw)
    expect(diffRequiresConsent(diffPermissions(current, next))).toBe(true)
  })

  it('does not flag consent required when only removals or unchanged rows exist', () => {
    const current = normalizeManifest(v3Raw)
    const next = normalizeManifest({
      ...v3Raw,
      version: '2.1.0',
      // Drop one cap entirely
      capabilities: v3Raw.capabilities?.filter((c) => c.kind !== 'event:emit'),
      permissions: v3Raw.permissions,
    })
    const diff = diffPermissions(current, next)
    expect(diff.some((r) => r.change === 'removed')).toBe(true)
    expect(diffRequiresConsent(diff)).toBe(false)
  })
})

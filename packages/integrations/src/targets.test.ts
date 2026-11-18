import { describe, expect, it } from 'vitest'
import fixture from '../test/fixtures/targets.json'
import {
  ACTION_KINDS,
  EXAMPLE_TARGETS,
  createMemoryIntegrationsApi,
  incompleteActions,
  inferSchema,
  needsAdvanced,
  newAction,
  parseActions,
  parseIngestTargets,
  targetColumnsToMappingRows,
  type ActionBlock,
  type IngestTarget,
} from './index'

/** Parse, expect ok and return the blocks. */
function ok(input: unknown): ActionBlock[] {
  const r = parseActions(input)
  if (!r.ok) throw new Error(r.error)
  return r.actions
}

describe('IngestTarget (kernel fixture)', () => {
  it('parses the kernel fixture, keeping the exact snake_case shape', () => {
    const r = parseIngestTargets(fixture)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const t: IngestTarget = r.targets[0]!
    expect(t).toEqual(fixture[0])
    expect(t.model).toBe('inventory.items')
    expect(t.match_candidates).toEqual([['sku'], ['warehouse', 'external_id']])
    expect(t.permissions).toEqual({ create: true, update: true, delete: false })
    expect(t.scope).toEqual({ branch: true, entity: false })
    expect(t.guard_candidates).toEqual(['status'])
    expect(t.actions_available?.[0]).toMatchObject({ key: 'reserve', permission: 'inventory.items.action:reserve', requires_state: ['active'] })
    expect(t.stage?.transitions).toContainEqual({ from: 'active', to: 'archived' })
    expect(t.restorable).toBe(true)
    expect(t.ingest_cursor).toBe('source_updated_at')
  })

  it('accepts a pre-v0.272 target (no actions_available/stage) and a null stage', () => {
    const { actions_available: _a, stage: _s, restorable: _r, ingest_cursor: _c, ...old } = fixture[0]!
    expect(parseIngestTargets([old]).ok).toBe(true)
    expect(parseIngestTargets([{ ...fixture[0], stage: null }]).ok).toBe(true)
  })

  it('rejects malformed targets', () => {
    expect(parseIngestTargets({}).ok).toBe(false)
    expect(parseIngestTargets([{ ...fixture[0], model: '' }]).ok).toBe(false)
    expect(parseIngestTargets([{ ...fixture[0], permissions: { create: true } }]).ok).toBe(false)
    expect(parseIngestTargets([{ ...fixture[0], match_candidates: ['sku'] }]).ok).toBe(false)
    expect(parseIngestTargets([{ ...fixture[0], stage: { field: 'status' } }]).ok).toBe(false)
  })

  it('memory api serves the fixture through listTargets', async () => {
    expect(EXAMPLE_TARGETS).toEqual(fixture)
    const api = createMemoryIntegrationsApi()
    expect(await api.listTargets?.()).toEqual(fixture)
    expect(api.calls).toContain('listTargets')
    expect(await createMemoryIntegrationsApi({ targets: [] }).listTargets?.()).toEqual([])
    // the deprecated method keeps working
    expect(await api.listModels?.()).toEqual(['customers', 'orders'])
  })

  it('targetColumnsToMappingRows lists the writable columns', () => {
    const t = EXAMPLE_TARGETS[0]!
    expect(targetColumnsToMappingRows(t).map((r) => r.target)).toEqual(['sku', 'warehouse', 'quantity', 'status'])
    expect(targetColumnsToMappingRows(t, { requiredOnly: true })).toEqual([{ target: 'sku', kind: 'field', value: '' }])
  })

  it('inferSchema derives a payload schema from a sample', () => {
    const s = inferSchema({ id: '00000000-0000-4000-8000-000000000001', n: 2, p: 1.5, ok: true, at: '2026-01-15T10:30:00Z', c: { email: 'a@b.co' }, l: [{ x: 1 }] })
    expect(s.properties?.id).toMatchObject({ type: 'string', format: 'uuid' })
    expect(s.properties?.n?.type).toBe('integer')
    expect(s.properties?.p?.type).toBe('number')
    expect(s.properties?.at?.format).toBe('date-time')
    expect(s.properties?.c?.properties?.email?.format).toBe('email')
    expect(s.properties?.l?.items?.properties?.x?.type).toBe('integer')
  })
})

describe('action blocks v0.3 round-trip (OPS Block field names)', () => {
  const guard = { field: 'source_updated_at', path: 'payload.updated_at', op: 'gte' }
  const blocks: Record<string, unknown> = {
    'record.create': {
      do: 'record.create',
      model: 'inventory.items',
      match: ['sku'],
      mapping: { sku: '{{payload.sku}}', quantity: '{{payload.qty}}' },
      idempotency_field: 'ingest_key',
      defaults: { status: 'active' },
      guard,
      when: { path: 'payload.kind', eq: 'new' },
    },
    'record.update': {
      do: 'record.update',
      model: 'inventory.items',
      match: ['sku'],
      mapping: { sku: '{{payload.sku}}', quantity: '{{payload.qty}}' },
      guard: { ...guard, op: 'gt' },
    },
    'record.upsert': {
      do: 'record.upsert',
      model: 'inventory.items',
      match: ['sku'],
      mapping: { sku: '{{payload.sku}}' },
      defaults: { status: 'active' },
      guard,
    },
    'record.delete': { do: 'record.delete', model: 'inventory.items', match: ['sku'], mapping: { sku: '{{payload.sku}}' }, mode: 'soft', max_rows: 5, guard },
    'record.action': {
      do: 'record.action',
      model: 'inventory.items',
      match: ['sku'],
      mapping: { sku: '{{payload.sku}}' },
      action: 'reserve',
      params: { quantity: '{{payload.qty}}', reason: 'ingest', nested: { n: 1 } },
      on_ineligible: 'fail',
      max_rows: 2,
      when: { path: 'payload.status', in: ['a', 'b', 3] },
    },
    'record.transition': {
      do: 'record.transition',
      model: 'inventory.items',
      match: ['sku'],
      mapping: { sku: '{{payload.sku}}' },
      to: 'archived',
      when: { path: 'payload.gone', ne: false },
    },
    'record.restore': {
      do: 'record.restore',
      model: 'inventory.items',
      match: ['sku'],
      mapping: { sku: '{{payload.sku}}' },
      max_rows: 1,
      when: { path: 'payload.sku', exists: true },
    },
  }

  for (const [kind, block] of Object.entries(blocks)) {
    it(`${kind} survives parse + JSON round-trip exactly`, () => {
      const parsed = ok([block])
      expect(parsed[0]).toEqual(block)
      expect(ok(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed)
      expect(needsAdvanced(parsed[0]!)).toBe(true)
    })
  }

  it('minimal blocks omit optional fields', () => {
    expect(ok([{ do: 'record.delete', model: 'm', match: ['k'], mapping: { k: '{{payload.k}}' } }])[0]).toEqual({
      do: 'record.delete',
      model: 'm',
      match: ['k'],
      mapping: { k: '{{payload.k}}' },
    })
    const c = ok([{ do: 'record.create', model: 'm', mapping: { a: '1' }, idempotency_field: 'rk' }])[0]!
    expect('match' in c).toBe(false)
  })

  it('keeps the four classic blocks (and notify.when eq) visual', () => {
    const classic = [
      { do: 'record.upsert', model: 'customers', match: ['external_ref'], mapping: { name: '{{payload.nombre}}' } },
      { do: 'event.emit', name: 'customers.customer.imported', payload: { id: '{{result.id}}' } },
      { do: 'notify', template: 'cliente_importado', when: { path: 'result.created', eq: true } },
      { do: 'command.run', command: 'inventory.recount', args: { a: 'b' } },
    ]
    const parsed = ok(classic)
    expect(parsed).toEqual(classic)
    expect(parsed.some(needsAdvanced)).toBe(false)
  })

  it('marks as advanced what the visual editor cannot show', () => {
    expect(needsAdvanced(ok([{ do: 'notify', template: 't', when: { path: 'p', ne: 1 } }])[0]!)).toBe(true)
    expect(needsAdvanced(ok([{ do: 'event.emit', name: 'a.b.c', payload: {}, when: { path: 'p', eq: 1 } }])[0]!)).toBe(true)
    expect(needsAdvanced(ok([{ do: 'record.upsert', model: 'm', match: ['k'], mapping: {}, guard: { field: 'f', path: 'payload.x', op: 'gt' } }])[0]!)).toBe(true)
  })

  it('rejects record.delete with mode hard (OPS hard_delete_disabled) and unknown modes', () => {
    const del = { do: 'record.delete', model: 'm', match: ['k'], mapping: { k: '{{payload.k}}' } }
    const hard = parseActions([{ ...del, mode: 'hard' }])
    expect(hard.ok).toBe(false)
    expect(!hard.ok && hard.error).toContain('hard_delete_disabled')
    expect(parseActions([{ ...del, mode: 'purge' }]).ok).toBe(false)
    expect(parseActions([{ ...del, mode: 'soft' }]).ok).toBe(true)
    expect(parseActions([{ ...del, max_rows: 0 }]).ok).toBe(false)
    expect(parseActions([{ ...del, max_rows: 101 }]).ok).toBe(false)
  })

  it('validates guard, when and state-block rules like the kernel', () => {
    const upsert = { do: 'record.upsert', model: 'm', match: ['k'], mapping: { k: 'x' } }
    expect(parseActions([{ ...upsert, guard: { field: 'f', path: 'payload.p', op: 'lt' } }]).ok).toBe(false)
    expect(parseActions([{ ...upsert, guard: { field: 'f', path: 'payload.p' } }]).ok).toBe(false)
    const state = { do: 'record.restore', model: 'm', match: ['k'], mapping: { k: 'x' } }
    expect(parseActions([{ ...state, guard }]).ok).toBe(false)
    expect(parseActions([{ ...state, defaults: {} }]).ok).toBe(false)
    expect(parseActions([{ do: 'record.action', model: 'm', match: ['k'], mapping: {}, action: 'a', on_ineligible: 'skip' }]).ok).toBe(false)
    expect(parseActions([{ ...upsert, max_rows: 3 }]).ok).toBe(false)
    expect(parseActions([{ ...upsert, idempotency_field: 'rk' }]).ok).toBe(false)
    for (const when of [
      { path: 'p' },
      { path: 'p', eq: 1, ne: 2 },
      { path: 'p', in: [] },
      { path: 'p', in: [{}] },
      { path: 'p', in: Array.from({ length: 51 }, (_, i) => i) },
      { path: 'p', exists: 'yes' },
      { path: '', eq: 1 },
      { path: 'p', eq: { a: 1 } },
    ]) {
      expect(parseActions([{ ...upsert, when }]).ok).toBe(false)
    }
    expect(parseActions([{ do: 'record.create', model: 'm', mapping: {} }]).ok).toBe(false)
  })

  it('newAction builds every kind and incompleteActions flags the empty ones', () => {
    for (const k of ACTION_KINDS) expect(newAction(k).do).toBe(k)
    expect(incompleteActions(ACTION_KINDS.map(newAction))).toEqual(ACTION_KINDS.map((_, i) => i))
    const filled: ActionBlock[] = [
      { do: 'record.create', model: 'm', idempotency_field: 'rk', mapping: { a: '1' } },
      { do: 'record.action', model: 'm', match: ['k'], mapping: {}, action: 'reserve' },
      { do: 'record.transition', model: 'm', match: ['k'], mapping: {}, to: 'archived' },
    ]
    expect(incompleteActions(filled)).toEqual([])
  })
})

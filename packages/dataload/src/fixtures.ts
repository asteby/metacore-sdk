import type { DataloadPlan, DataloadRun, MediaBackupStatus } from './types'

export const plan: DataloadPlan = {
  org: 'o1',
  entity: 'product',
  profile: 'catalogo',
  profileVersion: '1',
  profileHash: 'ph',
  source: 'catalogo.csv',
  inputHash: 'ih',
  planHash: 'plh',
  counts: { create: 1, update: 1, unchanged: 1, invalid: 1 },
  ignoredColumns: 2,
  mediaUrls: 3,
  rows: [
    { row: 1, key: 'SKU-1', action: 'create', record: { name: 'Uno', price: 10 }, diffs: [], issues: [] },
    { row: 2, key: 'SKU-2', action: 'update', diffs: [{ field: 'name', old: 'Dos', new: 'DOS' }], issues: [] },
    { row: 3, key: 'SKU-3', action: 'unchanged', diffs: [], issues: [] },
    { row: 4, action: 'invalid', diffs: [], issues: [{ row: 4, column: 'price', message: 'no es un número' }] },
  ],
}

export const run = (over: Partial<DataloadRun> = {}): DataloadRun => ({
  id: 'r1',
  key: 'k',
  org: 'o1',
  mode: 'apply',
  state: 'running',
  profile: 'catalogo',
  profileVersion: '1',
  profileHash: 'ph',
  source: 'catalogo.csv',
  inputHash: 'ih',
  progress: { total: 2, done: 1, created: 1, updated: 0, unchanged: 1, invalid: 1, duplicates: 0, mediaQueued: 3 },
  issues: [],
  createdAt: '2026-10-18T10:00:00Z',
  startedAt: '0001-01-01T00:00:00Z',
  finishedAt: '0001-01-01T00:00:00Z',
  ...over,
})

export const media: MediaBackupStatus = {
  queue: { pending: 0, running: 0, done: 5, dead: 1 },
  manifest: { total: 5, ok: 5, missing: 0, corrupt: 0, bytes: 3 * 1024 * 1024 },
  dead: [{ id: 'j1', key: 'SKU-1', field: 'images', index: 0, url: 'https://origen.test/a.jpg', state: 'dead', attempts: 5, lastError: 'HTTP 404', nextAttempt: '0001-01-01T00:00:00Z', updatedAt: '2026-10-18T10:00:00Z' }],
}

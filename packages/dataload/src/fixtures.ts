import type { DataloadApi } from './api'
import type { DataloadPlan, DataloadProfile, DataloadRun, MediaBackupStatus, ReviewEntry } from './types'

export const plan: DataloadPlan = {
  org: 'o1',
  entity: 'product',
  profile: 'catalogo',
  profileVersion: '1',
  profileHash: 'ph',
  source: 'catalogo.csv',
  inputHash: 'ih',
  planHash: 'plh',
  counts: { create: 1, update: 1, unchanged: 1, invalid: 1, review: 1 },
  ignoredColumns: 2,
  mediaUrls: 3,
  rows: [
    { row: 1, key: 'SKU-1', action: 'create', record: { name: 'Uno', price: 10 }, diffs: [], issues: [], review: [] },
    { row: 2, key: 'SKU-2', action: 'update', diffs: [{ field: 'name', old: 'Dos', new: 'DOS' }], issues: [], review: [] },
    { row: 3, key: 'SKU-3', action: 'unchanged', diffs: [], issues: [], review: [] },
    { row: 4, action: 'invalid', diffs: [], issues: [{ row: 4, column: 'price', message: 'no es un número' }], review: [] },
    {
      row: 5,
      key: 'SKU-5',
      action: 'review',
      outcome: 'update',
      hash: 'h5',
      diffs: [{ field: 'size', old: '10', new: '100' }],
      issues: [],
      review: [{ code: 'value_suspect', field: 'size', severity: 'revisar', detail: 'valor fuera de rango' }],
    },
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
  review: [],
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

export const profile: DataloadProfile = {
  name: 'catalogo',
  version: '1',
  entity: 'product',
  key: ['sku'],
  clean: ['trim'],
  fields: [
    { target: 'sku', from: ['SKU'], required: true },
    { target: 'name', from: ['Nombre', 'Name'] },
    { target: 'price', from: ['Precio'], type: 'number' },
    { target: 'images', from: ['Images'], media: true },
  ],
}

export const review = (over: Partial<ReviewEntry> = {}): ReviewEntry => ({
  org: 'o1',
  entity: 'product',
  key: 'SKU-5',
  profile: 'catalogo',
  profileVersion: '1',
  profileHash: 'ph',
  runId: 'r1',
  row: 5,
  hash: 'h5',
  record: { sku: 'SKU-5', size: '100' },
  items: [{ code: 'value_suspect', field: 'size', severity: 'revisar', detail: 'valor fuera de rango' }],
  outcome: 'update',
  state: 'pending',
  createdAt: '2026-10-18T10:00:00Z',
  updatedAt: '2026-10-18T10:00:00Z',
  ...over,
})

/** In-memory API for component tests; every method is a vi-free plain async function the test can wrap. */
export function baseApi(): DataloadApi {
  return {
    listProfiles: async () => [{ profile }],
    saveProfile: async (b) => b,
    dryRun: async () => ({ plan, run: run({ mode: 'dry_run', state: 'succeeded' }) }),
    execute: async () => run({ state: 'running' }),
    run: async () => run({ state: 'succeeded', progress: { ...run().progress, done: 2 } }),
    runPlan: async () => plan,
    runs: async () => [run({ state: 'succeeded' })],
    cancel: async () => run({ state: 'canceled' }),
    mediaStatus: async () => media,
    mediaManifest: async () => [],
    mediaVerify: async () => ({ checked: 5, ok: 5, missing: [], corrupt: [] }),
    mediaRetry: async () => 1,
    reviews: async () => [],
    decideReviews: async (ds) => ds.map((d) => review({ key: d.key, hash: d.hash, state: d.approve ? 'approved' : 'rejected', note: d.note })),
    applyApproved: async () => run({ mode: 'apply_reviewed', state: 'succeeded', progress: { ...run().progress, created: 0, updated: 1, unchanged: 0 } }),
    createUpload: async (b) => ({ id: 'up1', name: b.name, size: b.size, chunkSize: b.chunkSize ?? 8, received: [] }),
    upload: async (id) => ({ id, name: 'x', size: 0, chunkSize: 8, received: [] }),
    uploadPart: async () => undefined,
    completeUpload: async (id) => ({ id, name: 'x', size: 0, chunkSize: 8, received: [], sha256: 'abc' }),
    abortUpload: async () => undefined,
  }
}

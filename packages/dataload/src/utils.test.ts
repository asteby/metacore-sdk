import { describe, expect, it } from 'vitest'
import { plan, media } from './fixtures'
import {
  SourceFileError,
  canApply,
  filterRows,
  formatBytes,
  formatValue,
  inferFormat,
  isTerminal,
  mediaHealth,
  parseTime,
  progressPercent,
  readSourceFile,
  summarizePlan,
} from './utils'

const file = (name: string, text: string, size = text.length) => ({ name, size, text: async () => text })

describe('utils', () => {
  it('treats the kernel zero time as absent', () => {
    expect(parseTime('0001-01-01T00:00:00Z')).toBeNull()
    expect(parseTime(undefined)).toBeNull()
    expect(parseTime('2026-10-18T10:00:00Z')?.getUTCFullYear()).toBe(2026)
  })

  it('formats bytes and values', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
    expect(formatValue(null)).toBe('—')
    expect(formatValue({ a: 1 })).toBe('{"a":1}')
    expect(formatValue('x'.repeat(200), 10)).toHaveLength(10)
  })

  it('computes progress', () => {
    const p = { total: 4, done: 1, created: 0, updated: 0, unchanged: 0, invalid: 0, duplicates: 0, mediaQueued: 0 }
    expect(progressPercent(p)).toBe(25)
    expect(progressPercent({ ...p, total: 0 })).toBe(0)
    expect(progressPercent({ ...p, done: 9 })).toBe(100)
    expect(progressPercent({ ...p, total: 0 }, 'succeeded')).toBe(100)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('running')).toBe(false)
  })

  it('summarizes a plan and decides if it can apply', () => {
    const s = summarizePlan(plan)
    expect(s).toMatchObject({ create: 1, update: 1, unchanged: 1, invalid: 1, duplicate: 0, review: 1, applicable: 2, valid: 3, mediaUrls: 3 })
    expect(canApply(plan)).toBe(true)
    expect(canApply({ ...plan, counts: { invalid: 2 } })).toBe(false)
    expect(canApply(undefined)).toBe(false)
  })

  it('filters rows by action and text', () => {
    expect(filterRows(plan.rows, 'changes').map((r) => r.row)).toEqual([1, 2])
    expect(filterRows(plan.rows, 'all')).toHaveLength(5)
    expect(filterRows(plan.rows, 'review').map((r) => r.row)).toEqual([5])
    expect(filterRows(plan.rows, 'all', 'value_suspect').map((r) => r.row)).toEqual([5])
    expect(filterRows(plan.rows, 'all', 'fuera de rango').map((r) => r.row)).toEqual([5])
    expect(filterRows(plan.rows, 'invalid').map((r) => r.row)).toEqual([4])
    expect(filterRows(plan.rows, 'all', 'sku-3').map((r) => r.row)).toEqual([3])
    expect(filterRows(plan.rows, 'all', 'NAME').map((r) => r.row)).toEqual([2])
    expect(filterRows(plan.rows, 'all', 'número').map((r) => r.row)).toEqual([4])
  })

  it('reads the media backup health', () => {
    expect(mediaHealth(undefined)).toBe('empty')
    expect(mediaHealth(media)).toBe('attention')
    const clean = { ...media, queue: { ...media.queue, dead: 0 }, dead: [] }
    expect(mediaHealth(clean)).toBe('healthy')
    expect(mediaHealth({ ...clean, queue: { ...clean.queue, running: 1 } })).toBe('working')
    expect(mediaHealth({ ...clean, manifest: { ...clean.manifest, corrupt: 1 } })).toBe('attention')
  })

  it('reads source files', async () => {
    expect(inferFormat('a.CSV')).toBe('csv')
    expect(inferFormat('a.json')).toBe('json')
    expect(inferFormat('a.json', 'products')).toBe('bundle')
    expect(inferFormat('a.xlsx')).toBeNull()
    expect(await readSourceFile(file('a.csv', 'sku\n1'))).toEqual({ format: 'csv', name: 'a.csv', content: 'sku\n1' })
    expect(await readSourceFile(file('a.json', '{}'), { bundlePath: ' catalog.items ' })).toEqual({ format: 'bundle', name: 'a.json', content: '{}', path: 'catalog.items' })
    await expect(readSourceFile(file('a.xlsx', 'x'))).rejects.toMatchObject({ code: 'unsupported' })
    await expect(readSourceFile(file('a.csv', 'x', 99), { maxBytes: 10 })).rejects.toBeInstanceOf(SourceFileError)
    await expect(readSourceFile(file('a.csv', '  '))).rejects.toMatchObject({ code: 'empty' })
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { DataloadApi } from './api'
import { baseApi } from './fixtures'
import { UploadError, isRetryable, uploadSourceFile } from './upload'

const file = (text: string, name = 'big.csv') => new File([text], name, { type: 'text/csv' })
const noWait = async (_ms?: number) => undefined

function api(over: Partial<DataloadApi> = {}) {
  const b = baseApi()
  const parts: { index: number; text: string; sha256?: string }[] = []
  const a: DataloadApi = {
    ...b,
    createUpload: vi.fn(async (body) => ({ id: 'up1', name: body.name, size: body.size, chunkSize: 4, received: [] })),
    uploadPart: vi.fn(async (_id, index, chunk, o) => {
      parts.push({ index, text: await chunk.text(), sha256: o?.sha256 })
    }),
    completeUpload: vi.fn(b.completeUpload),
    abortUpload: vi.fn(b.abortUpload),
    upload: vi.fn(b.upload),
    ...over,
  }
  return { a, parts }
}

describe('uploadSourceFile', () => {
  it('sends the file in parts with progress and a sha256 per part', async () => {
    const { a, parts } = api()
    const progress = vi.fn()
    const src = await uploadSourceFile(a, file('sku\nA1\nB2'), { onProgress: progress, sleep: noWait })
    expect(src).toEqual({ format: 'csv', name: 'big.csv', uploadId: 'up1' })
    expect(parts.map((p) => p.text)).toEqual(['sku\n', 'A1\nB', '2'])
    expect(parts.every((p) => /^[0-9a-f]{64}$/.test(p.sha256 ?? ''))).toBe(true)
    expect(progress).toHaveBeenLastCalledWith({ loaded: 9, total: 9, part: 3, parts: 3 })
    expect(progress.mock.calls[0]?.[0]).toMatchObject({ loaded: 0, part: 0 })
    expect(a.completeUpload).toHaveBeenCalledWith('up1')
  })

  it('retries a part on 5xx and network errors with backoff, not on 4xx', async () => {
    const sleep = vi.fn(noWait)
    let calls = 0
    const { a } = api({
      uploadPart: vi.fn(async () => {
        calls++
        if (calls === 1) throw { response: { status: 503 } }
        if (calls === 2) throw new Error('network')
      }),
    })
    await uploadSourceFile(a, file('abcd'), { sleep, retryDelayMs: 100 })
    expect(calls).toBe(3)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200])

    const { a: b } = api({ uploadPart: vi.fn(async () => { throw { response: { status: 413 } } }) })
    const err = await uploadSourceFile(b, file('abcd'), { sleep }).catch((e) => e)
    expect(err).toBeInstanceOf(UploadError)
    expect(err).toMatchObject({ code: 'failed', uploadId: 'up1' })
    expect(b.uploadPart).toHaveBeenCalledTimes(1)
    expect(isRetryable({ response: { status: 429 } })).toBe(true)
    expect(isRetryable({ response: { status: 400 } })).toBe(false)
  })

  it('gives up after the retries and resumes skipping the parts the server has', async () => {
    const { a } = api({ uploadPart: vi.fn(async () => { throw { response: { status: 500 } } }) })
    const err = await uploadSourceFile(a, file('abcdefgh'), { retries: 2, sleep: noWait }).catch((e) => e)
    expect(err).toMatchObject({ code: 'failed', uploadId: 'up1' })
    expect(a.uploadPart).toHaveBeenCalledTimes(3)

    const { a: b, parts } = api({ upload: vi.fn(async (id) => ({ id, name: 'big.csv', size: 8, chunkSize: 4, received: [0] })) })
    const progress = vi.fn()
    await uploadSourceFile(b, file('abcdefgh'), { resumeId: 'up1', onProgress: progress, sleep: noWait })
    expect(b.createUpload).not.toHaveBeenCalled()
    expect(parts.map((p) => p.index)).toEqual([1])
    expect(progress.mock.calls[0]?.[0]).toMatchObject({ loaded: 4, part: 1, parts: 2 })
  })

  it('cancels: stops sending and discards the upload on the server', async () => {
    const ctrl = new AbortController()
    const { a, parts } = api({
      uploadPart: vi.fn(async (_id, index) => {
        parts.push({ index, text: '' })
        ctrl.abort()
      }),
    })
    const err = await uploadSourceFile(a, file('abcdefgh'), { signal: ctrl.signal, sleep: noWait }).catch((e) => e)
    expect(err).toMatchObject({ code: 'aborted' })
    expect(parts).toHaveLength(1)
    expect(a.abortUpload).toHaveBeenCalledWith('up1')
    expect(a.completeUpload).not.toHaveBeenCalled()
  })

  it('validates before touching the server', async () => {
    const { a } = api()
    await expect(uploadSourceFile(a, file('abc'), { maxBytes: 2 })).rejects.toMatchObject({ code: 'too_large' })
    await expect(uploadSourceFile(a, file(''), {})).rejects.toMatchObject({ code: 'empty' })
    await expect(uploadSourceFile(a, file('x', 'a.xlsx'), {})).rejects.toMatchObject({ code: 'unsupported' })
    expect(a.createUpload).not.toHaveBeenCalled()
    const src = await uploadSourceFile(a, file('{"items":[]}', 'a.json'), { bundlePath: ' items ', sleep: noWait })
    expect(src).toEqual({ format: 'bundle', name: 'a.json', uploadId: 'up1', path: 'items' })
  })

  it('never resumes an upload of a different file: it starts over instead of mixing parts', async () => {
    const { a, parts } = api({ upload: vi.fn(async (id) => ({ id, name: 'otro.csv', size: 4, chunkSize: 4, received: [0] })) })
    const src = await uploadSourceFile(a, file('abcdefgh'), { resumeId: 'viejo', sleep: noWait })
    expect(a.createUpload).toHaveBeenCalledTimes(1)
    expect(a.abortUpload).toHaveBeenCalledWith('viejo')
    expect(parts.map((p) => p.text)).toEqual(['abcd', 'efgh'])
    expect(src.uploadId).toBe('up1')
  })

  it('refuses a part size it would have to hold in memory beyond the cap', async () => {
    const big = { name: 'big.csv', size: 300 * 1024 * 1024, type: 'text/csv', slice: () => new Blob(['x']) }
    const { a } = api({ createUpload: vi.fn(async (body) => ({ id: 'up1', name: body.name, size: body.size, chunkSize: body.size, received: [] })) })
    const err = await uploadSourceFile(a, big, { sleep: noWait }).catch((e) => e)
    expect(err).toMatchObject({ code: 'failed' })
    expect(a.uploadPart).not.toHaveBeenCalled()
    expect(a.abortUpload).toHaveBeenCalledWith('up1')
  })
})

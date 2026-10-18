import { apiErrorStatus, type DataloadApi } from './api'
import type { UploadedSourceInput } from './types'
import { inferFormat } from './utils'

/** Requested size of each part; the server may lower it (`UploadSession.chunkSize`). */
export const DEFAULT_CHUNK_BYTES = 8 * 1024 * 1024
/** Default ceiling of a chunked upload. The host can raise or lower it; the server has the last word. */
export const DEFAULT_MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024

export interface UploadProgress {
  loaded: number
  total: number
  /** Parts already on the server / total parts. */
  part: number
  parts: number
}

export type UploadErrorCode = 'too_large' | 'unsupported' | 'empty' | 'aborted' | 'failed'

export class UploadError extends Error {
  constructor(
    public code: UploadErrorCode,
    /** Set when the server already has an upload that `resumeId` can continue. */
    public uploadId?: string,
    public override cause?: unknown,
  ) {
    super(code)
    this.name = 'UploadError'
  }
}

export interface ChunkedUploadOptions {
  chunkSize?: number
  maxBytes?: number
  /** Extra attempts per part on network errors, 408, 429 and 5xx. Default 3. */
  retries?: number
  /** Base of the exponential backoff between attempts. Default 500 ms. */
  retryDelayMs?: number
  signal?: AbortSignal
  onProgress?: (p: UploadProgress) => void
  /** JSON only: dotted path to the rows array (turns the source into `bundle`). */
  bundlePath?: string
  /** Continue an upload that failed: parts the server already has are skipped. */
  resumeId?: string
  /** Send the sha256 of each part so the server can reject a corrupted one. Default true when WebCrypto exists. */
  hashParts?: boolean
  /** Injectable wait (tests). */
  sleep?: (ms: number) => Promise<void>
}

type UploadFile = Pick<File, 'name' | 'size' | 'type' | 'slice'>

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Errors worth retrying: no response (network), timeout, rate limit, or server error. */
export function isRetryable(err: unknown): boolean {
  const s = apiErrorStatus(err)
  return s === undefined || s === 408 || s === 429 || s >= 500
}

async function sha256Hex(b: Blob): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return undefined
  const sum = await subtle.digest('SHA-256', await b.arrayBuffer())
  return Array.from(new Uint8Array(sum), (x) => x.toString(16).padStart(2, '0')).join('')
}

const isAbort = (signal: AbortSignal | undefined, err?: unknown) =>
  !!signal?.aborted || (err as { name?: string })?.name === 'AbortError' || (err as { name?: string })?.name === 'CanceledError'

/**
 * Uploads a file in parts (beyond the inline JSON limit) with progress, per-part
 * retries with backoff, resume (`resumeId`) and cancellation (`signal`, which also
 * discards the server-side upload). Returns the source to pass to dry-run / run.
 * It never keeps the file: parts are sliced from the browser `File` on demand.
 */
export async function uploadSourceFile(api: DataloadApi, file: UploadFile, opts: ChunkedUploadOptions = {}): Promise<UploadedSourceInput> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES
  if (file.size > maxBytes) throw new UploadError('too_large')
  if (file.size === 0) throw new UploadError('empty')
  const path = opts.bundlePath?.trim() || undefined
  const format = inferFormat(file.name, path)
  if (!format) throw new UploadError('unsupported')

  const sleep = opts.sleep ?? wait
  const retries = opts.retries ?? 3
  const base = opts.retryDelayMs ?? 500
  const hash = opts.hashParts ?? !!globalThis.crypto?.subtle
  const { signal } = opts

  let session
  try {
    session = opts.resumeId
      ? await api.upload(opts.resumeId)
      : await api.createUpload({ name: file.name, size: file.size, contentType: file.type || undefined, chunkSize: opts.chunkSize ?? DEFAULT_CHUNK_BYTES })
  } catch (e) {
    throw new UploadError(isAbort(signal, e) ? 'aborted' : 'failed', opts.resumeId, e)
  }
  const id = session.id
  const chunk = Math.max(1, session.chunkSize || opts.chunkSize || DEFAULT_CHUNK_BYTES)
  const parts = Math.max(1, Math.ceil(file.size / chunk))
  const have = new Set(session.received)
  const sizeOf = (i: number) => Math.min(chunk, file.size - i * chunk)
  let loaded = 0
  for (const i of have) if (i < parts) loaded += sizeOf(i)
  const report = () => opts.onProgress?.({ loaded, total: file.size, part: have.size, parts })
  report()

  const abort = async (e?: unknown): Promise<never> => {
    try {
      await api.abortUpload(id)
    } catch {
      // Best effort: the server expires abandoned uploads anyway.
    }
    throw new UploadError('aborted', undefined, e)
  }

  for (let i = 0; i < parts; i++) {
    if (have.has(i)) continue
    if (signal?.aborted) return abort()
    const blob = file.slice(i * chunk, i * chunk + sizeOf(i))
    const sum = hash ? await sha256Hex(blob) : undefined
    for (let attempt = 0; ; attempt++) {
      try {
        await api.uploadPart(id, i, blob, { ...(sum ? { sha256: sum } : {}), ...(signal ? { signal } : {}) })
        break
      } catch (e) {
        if (isAbort(signal, e)) return abort(e)
        if (attempt >= retries || !isRetryable(e)) throw new UploadError('failed', id, e)
        await sleep(base * 2 ** attempt)
        if (signal?.aborted) return abort()
      }
    }
    have.add(i)
    loaded += sizeOf(i)
    report()
  }

  if (signal?.aborted) return abort()
  try {
    await api.completeUpload(id)
  } catch (e) {
    if (isAbort(signal, e)) return abort(e)
    throw new UploadError('failed', id, e)
  }
  return { format, name: file.name, uploadId: id, ...(path ? { path } : {}) }
}

/**
 * WASM client — frontend mirror of `kernel/runtime/wasm` so addons that ship
 * a compiled module can be loaded and dispatched directly from the browser.
 *
 * Why mirror the backend runtime in the SDK:
 *
 *   1. POS / kitchen-display / signage addons want sub-50ms latency on local
 *      barcode scans, table updates and printer dispatch. Round-tripping every
 *      event through the kernel's HTTP webhook layer doubles the perceived
 *      latency and dies when the venue's wifi flickers. Loading the addon's
 *      `.wasm` once at boot and invoking exports in-process keeps it usable
 *      offline.
 *
 *   2. The kernel already publishes the addon `.wasm` (Backend.Entry) along
 *      with its `manifest.Backend.Exports` list — the frontend just needs the
 *      same ABI to call into it. Centralising that in the SDK avoids each
 *      app reinventing the integrity check + linear-memory marshalling.
 *
 * ABI contract (mirrors `kernel/runtime/wasm/abi.go` and the example
 * `examples/integrations/*\/backend/abi.go`):
 *
 *   exports:
 *     alloc(size: u32) -> u32 ptr             // pin and return a memory slot
 *     free(ptr: u32, size: u32)               // release a slot
 *     <handler>(arg: u64 packed) -> u64 packed // ptr<<32 | len
 *
 *   packed u64:
 *     hi32 = pointer into linear memory
 *     lo32 = byte length
 *
 *   The host (this module):
 *     1. JSON-encodes the payload as UTF-8 bytes.
 *     2. Calls `alloc(len)` to obtain a ptr.
 *     3. Writes the bytes into `memory.buffer` at ptr.
 *     4. Calls the export with `(ptr << 32n) | len`.
 *     5. Reads the returned (ptr2, len2), JSON-parses the slice,
 *        calls `free(ptr2, len2)` and `free(ptr, len)`.
 *
 * SRI: `loadAddonWasm` fetches the module and, when an `integrity` string is
 * supplied, validates a sha256/sha384/sha512 digest before instantiating —
 * matching the same SRI contract the federation loader uses for remoteEntry.js.
 * Mismatches throw `WasmIntegrityError` so callers can surface the failure
 * without confusing it with a network error.
 */

export type WasmAbiExports = {
  memory: WebAssembly.Memory
  alloc: (size: number) => number
  free: (ptr: number, size: number) => void
} & Record<string, WebAssembly.ExportValue>

export interface LoadAddonWasmOptions {
  /** Absolute or relative URL of the addon's `.wasm` bundle. */
  url: string
  /**
   * Optional SRI hash, e.g. `"sha384-base64..."` or `"sha256-...":
   * format is `<algo>-<base64>` matching the HTML SRI attribute syntax. When
   * provided, the fetched bytes are hashed and compared before instantiation.
   * Multiple space-separated hashes are accepted; ANY match passes.
   */
  integrity?: string
  /**
   * Imports object handed to `WebAssembly.instantiate`. For tinygo / wasm-bindgen
   * outputs supply the `env` / `wasi_snapshot_preview1` modules the toolchain
   * requires; the loader is intentionally agnostic. Defaults to `{}` which works
   * for self-contained tinygo modules with `-target=wasi`.
   */
  imports?: WebAssembly.Imports
  /**
   * Optional `fetch` override — handy in tests, when wiring an `Authorization`
   * header, or pointing at an alternative CDN. Defaults to the global `fetch`.
   */
  fetcher?: (url: string) => Promise<Response>
}

/**
 * Loaded addon module — pairs the instance with its typed ABI exports so
 * `callAddonExport` does not need to revalidate the symbol table on every call.
 */
export interface LoadedAddonWasm {
  instance: WebAssembly.Instance
  module: WebAssembly.Module
  exports: WasmAbiExports
}

/**
 * Thrown when the fetched `.wasm` bytes do not match the supplied SRI hash.
 * Carries the algorithm + the (truncated) expected/got digests so logs are
 * actionable without leaking the full bytes.
 */
export class WasmIntegrityError extends Error {
  readonly algorithm: string
  readonly expected: string
  readonly got: string
  constructor(algorithm: string, expected: string, got: string) {
    super(
      `metacore: wasm integrity mismatch — algo=${algorithm} ` +
        `expected=${truncate(expected)} got=${truncate(got)}`,
    )
    this.name = 'WasmIntegrityError'
    this.algorithm = algorithm
    this.expected = expected
    this.got = got
  }
}

/**
 * Thrown when the addon export is missing, has the wrong arity, or the loader
 * was handed an instance that does not satisfy the metacore ABI
 * (missing `alloc` / `free` / `memory`).
 */
export class WasmAbiError extends Error {
  constructor(message: string) {
    super(`metacore: wasm ABI error — ${message}`)
    this.name = 'WasmAbiError'
  }
}

/**
 * Fetch the addon's `.wasm`, verify SRI (when supplied), instantiate the module
 * and assert the metacore ABI is present. Subsequent calls for the same URL
 * are NOT memoised here — caller-side caching (e.g. via `Map<key, Promise>`)
 * is preferred because callers usually want one instance per addon, not per
 * URL string.
 */
export async function loadAddonWasm(
  opts: LoadAddonWasmOptions,
): Promise<LoadedAddonWasm> {
  const fetcher = opts.fetcher ?? globalThis.fetch.bind(globalThis)
  const resp = await fetcher(opts.url)
  if (!resp.ok) {
    throw new Error(
      `metacore: failed to fetch addon wasm at ${opts.url} (HTTP ${resp.status})`,
    )
  }
  const bytes = new Uint8Array(await resp.arrayBuffer())

  if (opts.integrity) {
    await verifyIntegrity(bytes, opts.integrity)
  }

  // We cannot use `instantiateStreaming` here because the SRI verification
  // requires the full byte buffer up front. The slower-but-correct path —
  // compile from bytes — is the right default; once browsers expose an SRI-
  // aware `instantiateStreaming`, switch over without breaking the API.
  const { instance, module } = await WebAssembly.instantiate(
    bytes,
    opts.imports ?? {},
  )

  const exports = instance.exports as WasmAbiExports
  if (!(exports.memory instanceof WebAssembly.Memory)) {
    throw new WasmAbiError('module does not export `memory`')
  }
  if (typeof exports.alloc !== 'function') {
    throw new WasmAbiError('module does not export `alloc(size:u32) -> u32`')
  }
  if (typeof exports.free !== 'function') {
    throw new WasmAbiError(
      'module does not export `free(ptr:u32, size:u32)`',
    )
  }

  return { instance, module, exports }
}

export interface CallAddonExportOptions {
  /**
   * Override JSON encoder/decoder. Useful for callers that have to stream
   * non-UTF8 payloads or want a faster JSON parser; defaults to native
   * `JSON.stringify` / `JSON.parse` with a `TextEncoder` / `TextDecoder`.
   */
  encode?: (payload: unknown) => Uint8Array
  decode?: (bytes: Uint8Array) => unknown
}

/**
 * Invoke `fnName` on the loaded module following the metacore ABI:
 *
 *   1. Serialise `payload` to JSON bytes (or use the provided encoder).
 *   2. Allocate a slot in linear memory via `alloc`.
 *   3. Write the bytes into `memory.buffer`.
 *   4. Call `fnName` with the packed (ptr<<32 | len) BigInt argument.
 *   5. Decode the returned packed (ptr, len), read the response slice, and
 *      `free` both slots before returning the parsed value.
 *
 * Errors are typed (`WasmAbiError`) when the export is missing or has the
 * wrong arity. Runtime errors raised by the addon propagate verbatim so the
 * caller can wrap them in app-level telemetry.
 *
 * Payloads of zero length skip the `alloc` step — the export receives `0n`
 * which the addon's `readInput` treats as empty input (see `abi.go`).
 */
export function callAddonExport(
  instance: WebAssembly.Instance,
  fnName: string,
  payload: unknown,
  opts: CallAddonExportOptions = {},
): unknown {
  const exports = instance.exports as WasmAbiExports
  const fn = exports[fnName]
  if (typeof fn !== 'function') {
    throw new WasmAbiError(`export \`${fnName}\` not found or not a function`)
  }
  if (!(exports.memory instanceof WebAssembly.Memory)) {
    throw new WasmAbiError('module does not export `memory`')
  }
  if (typeof exports.alloc !== 'function' || typeof exports.free !== 'function') {
    throw new WasmAbiError('module does not export `alloc` / `free`')
  }

  const encode = opts.encode ?? defaultEncode
  const decode = opts.decode ?? defaultDecode

  const bytes =
    payload === undefined || payload === null ? new Uint8Array(0) : encode(payload)

  let inPtr = 0
  if (bytes.byteLength > 0) {
    inPtr = exports.alloc(bytes.byteLength) >>> 0
    if (inPtr === 0) {
      throw new WasmAbiError('alloc returned NULL for input payload')
    }
    const view = new Uint8Array(exports.memory.buffer, inPtr, bytes.byteLength)
    view.set(bytes)
  }

  const arg = pack(inPtr, bytes.byteLength)

  try {
    // The fn signature is `(arg: bigint) -> bigint` — TypeScript types this
    // as `ExportValue` because WebAssembly typings do not narrow exported
    // functions. Cast at the call site and convert via `BigInt` to be tolerant
    // of i32-based ABIs that browsers expose as `number` instead of `bigint`.
    const ret = (fn as (a: bigint) => bigint | number)(arg)
    const retBig = typeof ret === 'bigint' ? ret : BigInt(ret)
    const { ptr: outPtr, len: outLen } = unpack(retBig)

    if (outLen === 0) {
      return undefined
    }
    const slice = new Uint8Array(
      exports.memory.buffer,
      outPtr,
      outLen,
    ).slice()
    const decoded = decode(slice)
    exports.free(outPtr, outLen)
    return decoded
  } finally {
    if (inPtr > 0) {
      exports.free(inPtr, bytes.byteLength)
    }
  }
}

/* ----------------------------------------------------------------------- */
/* Internals                                                                */
/* ----------------------------------------------------------------------- */

function pack(ptr: number, len: number): bigint {
  // `>>> 0` coerces to an unsigned 32-bit int before BigInt conversion so the
  // upper bit of `ptr` does not get sign-extended into the high half.
  return (BigInt(ptr >>> 0) << 32n) | BigInt(len >>> 0)
}

function unpack(packed: bigint): { ptr: number; len: number } {
  const ptr = Number((packed >> 32n) & 0xffffffffn)
  const len = Number(packed & 0xffffffffn)
  return { ptr, len }
}

const sharedEncoder = /* @__PURE__ */ new TextEncoder()
const sharedDecoder = /* @__PURE__ */ new TextDecoder()

function defaultEncode(payload: unknown): Uint8Array {
  return sharedEncoder.encode(JSON.stringify(payload))
}

function defaultDecode(bytes: Uint8Array): unknown {
  const text = sharedDecoder.decode(bytes)
  if (text.length === 0) return undefined
  return JSON.parse(text)
}

/**
 * Verify a `Uint8Array` against an SRI string like `"sha384-<base64>"`. Mirrors
 * the algorithm browsers run on `<script integrity="...">`. Multiple hashes
 * separated by whitespace are honoured — any match passes.
 *
 * Exported (named, not on the public API surface re-exports) for unit testing.
 */
export async function verifyIntegrity(
  bytes: Uint8Array,
  integrity: string,
): Promise<void> {
  // Strip whitespace and tokenise. Empty tokens are skipped, so accidental
  // double-spaces in a manifest do not cause a false negative.
  const tokens = integrity.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return // empty integrity → no-op (per SRI spec)

  const errors: WasmIntegrityError[] = []
  for (const token of tokens) {
    const dash = token.indexOf('-')
    if (dash <= 0) {
      errors.push(
        new WasmIntegrityError('unknown', token, '(malformed token)'),
      )
      continue
    }
    const algo = token.slice(0, dash).toLowerCase()
    const expectedB64 = token.slice(dash + 1)
    const algoName = sriAlgorithm(algo)
    if (!algoName) {
      errors.push(
        new WasmIntegrityError(algo, expectedB64, '(unsupported algorithm)'),
      )
      continue
    }
    const digest = await crypto.subtle.digest(
      algoName,
      // Underlying buffer may be a SharedArrayBuffer; coerce to an ArrayBuffer
      // view to satisfy the SubtleCrypto types across runtimes.
      bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? (bytes.buffer as ArrayBuffer)
        : bytes.slice().buffer,
    )
    const gotB64 = base64FromBuffer(new Uint8Array(digest))
    if (constantTimeEqualB64(gotB64, expectedB64)) {
      return
    }
    errors.push(new WasmIntegrityError(algo, expectedB64, gotB64))
  }

  // None of the tokens matched — throw the first error (preserves the
  // algorithm/digest pair the caller is most likely to debug against).
  throw errors[0] ?? new WasmIntegrityError('unknown', integrity, '(no match)')
}

function sriAlgorithm(token: string): 'SHA-256' | 'SHA-384' | 'SHA-512' | null {
  switch (token) {
    case 'sha256':
      return 'SHA-256'
    case 'sha384':
      return 'SHA-384'
    case 'sha512':
      return 'SHA-512'
    default:
      return null
  }
}

function base64FromBuffer(buf: Uint8Array): string {
  // btoa works on latin-1 strings; build the source incrementally to avoid the
  // `String.fromCharCode.apply` arg-length limit on large digests (digests are
  // small — 64 bytes for SHA-512 — but the pattern is the safe default).
  let bin = ''
  for (let i = 0; i < buf.byteLength; i++) {
    bin += String.fromCharCode(buf[i]!)
  }
  return btoa(bin)
}

function constantTimeEqualB64(a: string, b: string): boolean {
  // Equal-length, constant-time string compare. The base64 strings come from
  // a hash with a fixed output size for a given algorithm, so unequal length
  // is by definition a mismatch.
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function truncate(s: string, max = 32): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`
}

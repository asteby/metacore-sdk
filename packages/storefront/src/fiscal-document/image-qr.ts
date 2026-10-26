import { DEFAULT_MAX_BYTES } from './pdf.js'
import { IdentityDocumentError } from './errors.js'
import { decodeQrPixels, detectQrNative, makeCanvas, type CanvasLike } from './qr.js'

/** Longest side, in pixels, the image is scaled DOWN to before reading it (never up). */
export const DEFAULT_IMAGE_MAX_SIDE = 1600

type Drawable = { width: number; height: number }
type VideoLike = { videoWidth: number; videoHeight: number; readyState?: number }

/**
 * What `decodeImageQr` reads: a photo (`File`/`Blob`), a frame of the camera (`HTMLVideoElement`), a decoded
 * `ImageBitmap`, a canvas or raw pixels (`ImageData`).
 */
export type ImageQrSource = Blob | ImageData | ImageBitmap | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas

export type DecodeImageQrOptions = {
  /** Largest photo accepted, in bytes (the document spec's `max_bytes`). Default 5 MiB. */
  maxBytes?: number
  /** Longest side the image is scaled down to (default 1600). */
  maxSide?: number
  /** Your own decoder for the pixels (tests, or a server canvas). Returns the QR text or `null`. */
  decode?: (image: ImageData) => string | null | Promise<string | null>
  signal?: AbortSignal
}

const isBlob = (s: unknown): s is Blob => typeof Blob !== 'undefined' && s instanceof Blob
const isPixels = (s: unknown): s is ImageData =>
  typeof s === 'object' && s !== null && 'data' in s && 'width' in s && 'height' in s && !('getContext' in s) && !('videoWidth' in s)

function sizeOf(source: unknown): Drawable {
  const v = source as VideoLike & Drawable
  if (typeof v.videoWidth === 'number') return { width: v.videoWidth, height: v.videoHeight }
  return { width: v.width, height: v.height }
}

/**
 * Text of the QR code in a photo or camera frame (the document's validator URL), or `null` when there is none.
 * Pair it with `extractIdentityDocument('', spec, { qr })` to read what the QR carries (tax id and document id).
 *
 * Privacy: the image is read in memory and never leaves the device, is not stored and its metadata (EXIF, GPS) is
 * never read. A photo is scaled down to `maxSide` and decoded with the platform's `BarcodeDetector`, falling back to
 * the optional `jsqr` package (both loaded on demand, nothing in the main bundle). Anything that goes wrong while
 * decoding yields `null`; only an unusable file throws an `IdentityDocumentError` (`too_large`, `not_image`,
 * `unreadable`).
 */
export async function decodeImageQr(source: ImageQrSource, options: DecodeImageQrOptions = {}): Promise<string | null> {
  const { maxBytes = DEFAULT_MAX_BYTES, maxSide = DEFAULT_IMAGE_MAX_SIDE, decode, signal } = options
  if (isBlob(source)) {
    if (source.size > maxBytes) throw new IdentityDocumentError('too_large', 'The image is larger than allowed', { reason: 'bytes' })
    if (source.type && !source.type.startsWith('image/')) throw new IdentityDocumentError('not_image', 'The file is not an image')
  }
  if (signal?.aborted) throw new IdentityDocumentError('unreadable', 'Reading was cancelled', { reason: 'aborted' })

  let bitmap: ImageBitmap | null = null
  try {
    let drawable: unknown = source
    if (isBlob(source)) {
      const create = (globalThis as { createImageBitmap?: (b: Blob) => Promise<ImageBitmap> }).createImageBitmap
      if (!create) throw new IdentityDocumentError('unreadable', 'This browser cannot decode images', { reason: 'unsupported' })
      try {
        bitmap = await create(source)
      } catch (cause) {
        throw new IdentityDocumentError('not_image', 'The file could not be decoded as an image', { cause })
      }
      drawable = bitmap
    }
    if (signal?.aborted) throw new IdentityDocumentError('unreadable', 'Reading was cancelled', { reason: 'aborted' })

    // 1. The native detector reads the source as it is (camera frames: no copy, no canvas).
    if (!decode) {
      const native = await detectQrNative(drawable)
      if (native) return native
    }

    // 2. Pixels, scaled down to the limit.
    let pixels: ImageData | null = isPixels(drawable) ? drawable : null
    if (!pixels) {
      const { width, height } = sizeOf(drawable)
      if (!width || !height) return null
      const k = Math.min(1, maxSide / Math.max(width, height))
      const cw = Math.max(1, Math.round(width * k))
      const ch = Math.max(1, Math.round(height * k))
      const canvas: CanvasLike | null = makeCanvas(cw, ch)
      const ctx = canvas?.getContext('2d') as {
        drawImage(image: unknown, x: number, y: number, w: number, h: number): void
        getImageData(x: number, y: number, w: number, h: number): ImageData
      } | null
      if (!canvas || !ctx) return null
      ctx.drawImage(drawable, 0, 0, cw, ch)
      pixels = ctx.getImageData(0, 0, cw, ch)
    }
    if (decode) return ((await decode(pixels)) as string | null) ?? null
    return await decodeQrPixels(pixels)
  } catch (err) {
    if (err instanceof IdentityDocumentError) throw err
    return null
  } finally {
    bitmap?.close?.()
  }
}

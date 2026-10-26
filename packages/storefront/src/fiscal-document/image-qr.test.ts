import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOCK_FISCAL_ID_MX, MOCK_IDENTITY_DOCUMENT_MX_CSF as CSF } from '../mock/region.js'
import { catalogsFromRegion, decodeImageQr, extractIdentityDocument, isIdentityDocumentError } from './index.js'
import { QR_MATRIX_FISICA } from './__fixtures__/qr.js'
import { ID_CIF_FISICA, QR_URL_FISICA, RFC_FISICA } from './__fixtures__/csf.js'

// A real QR (module matrix of a synthetic validator URL) painted at `scale` pixels per module.
function qrPixels(scale: number) {
  const size = QR_MATRIX_FISICA.length * scale
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dark = QR_MATRIX_FISICA[Math.floor(y / scale)]![Math.floor(x / scale)] === '1'
      data.set([dark ? 0 : 255, dark ? 0 : 255, dark ? 0 : 255, 255], (y * size + x) * 4)
    }
  }
  return { data, width: size, height: size } as unknown as ImageData
}

const code = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return isIdentityDocumentError(e) ? e.code : 'other'
  }
  return 'none'
}

afterEach(() => vi.unstubAllGlobals())

describe('decodeImageQr', () => {
  it('reads a real QR from raw pixels with the optional jsqr package', async () => {
    expect(await decodeImageQr(qrPixels(4))).toBe(QR_URL_FISICA)
  })

  it('returns null when the image has no QR, and never throws for what it cannot decode', async () => {
    const blank = { data: new Uint8ClampedArray(64 * 64 * 4).fill(255), width: 64, height: 64 } as unknown as ImageData
    expect(await decodeImageQr(blank)).toBeNull()
    expect(await decodeImageQr(blank, { decode: () => Promise.reject(new Error('boom')) })).toBeNull()
  })

  it('reads a photo: decodes the file, scales it DOWN to the limit and closes the bitmap', async () => {
    const painted = qrPixels(4)
    const calls: Array<[number, number, number, number]> = []
    class FakeCanvas {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
      getContext() {
        return {
          drawImage: (_i: unknown, _x: number, _y: number, w: number, h: number) => calls.push([_x, _y, w, h]),
          getImageData: () => painted,
        }
      }
    }
    const close = vi.fn()
    vi.stubGlobal('OffscreenCanvas', FakeCanvas)
    vi.stubGlobal('createImageBitmap', async () => ({ width: 4000, height: 3000, close }))
    const photo = new Blob([new Uint8Array(1000)], { type: 'image/jpeg' })
    expect(await decodeImageQr(photo)).toBe(QR_URL_FISICA)
    expect(calls).toEqual([[0, 0, 1600, 1200]])
    expect(close).toHaveBeenCalledTimes(1)

    // A small image is not scaled up.
    calls.length = 0
    vi.stubGlobal('createImageBitmap', async () => ({ width: 800, height: 600, close }))
    await decodeImageQr(photo)
    expect(calls).toEqual([[0, 0, 800, 600]])
  })

  it('uses the native detector first and straight on the source (camera frames need no canvas)', async () => {
    const detect = vi.fn(async () => [{ rawValue: QR_URL_FISICA }])
    vi.stubGlobal('BarcodeDetector', class { detect = detect })
    const video = { videoWidth: 640, videoHeight: 480, readyState: 4 } as unknown as HTMLVideoElement
    expect(await decodeImageQr(video)).toBe(QR_URL_FISICA)
    expect(detect).toHaveBeenCalledWith(video)
  })

  it('falls back to the pixels when the native detector finds nothing or fails', async () => {
    vi.stubGlobal('BarcodeDetector', class { detect = async () => { throw new Error('nope') } })
    expect(await decodeImageQr(qrPixels(4))).toBe(QR_URL_FISICA)
  })

  it('refuses an unusable file with a typed error', async () => {
    const big = new Blob([new Uint8Array(2048)], { type: 'image/png' })
    expect(await code(decodeImageQr(big, { maxBytes: 1024 }))).toBe('too_large')
    expect(await code(decodeImageQr(new Blob(['%PDF-1.4'], { type: 'application/pdf' })))).toBe('not_image')
    vi.stubGlobal('createImageBitmap', async () => {
      throw new Error('corrupt')
    })
    expect(await code(decodeImageQr(new Blob([new Uint8Array(10)], { type: 'image/png' })))).toBe('not_image')
    const ctl = new AbortController()
    ctl.abort()
    expect(await code(decodeImageQr(qrPixels(4), { signal: ctl.signal }))).toBe('unreadable')
  })

  it('what the QR carries fills the tax id and the document id, and nothing else', async () => {
    const url = await decodeImageQr(qrPixels(4))
    const x = extractIdentityDocument('', CSF, { catalogs: catalogsFromRegion(MOCK_FISCAL_ID_MX), qr: url })
    expect(x.fields.tax_id).toBe(RFC_FISICA)
    expect(x.fields.document_id).toBe(ID_CIF_FISICA)
    expect(x.sources.tax_id).toBe('qr')
    expect(x.fields.legal_name).toBeUndefined()
    expect(x.fields.postal_code).toBeUndefined()
    expect(x.missing).toEqual(expect.arrayContaining(['legal_name', 'postal_code', 'tax_regime']))
  })
})

/**
 * Live QR reading with the device camera. Nothing is recorded or stored: the frames are read in memory by
 * `decodeImageQr` (loaded on demand, so a page that never opens the camera pays 0 bytes for it) and the stream is
 * stopped when the scanner closes, when the component unmounts or when the page is hidden.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export type CameraQrStatus =
  /** Not running. */
  | 'idle'
  /** Waiting for the permission or for the first frame. */
  | 'starting'
  | 'scanning'
  /** The buyer (or the browser) refused the camera. */
  | 'denied'
  /** No `getUserMedia` here (old browser, insecure page). */
  | 'unsupported'

export type UseCameraQrOptions = {
  /** Start (true) or stop (false) the camera. */
  active: boolean
  /** The QR text read. Called once; the camera stops right after. */
  onCode: (text: string) => void
  /** Milliseconds between two reading attempts (default 250). */
  intervalMs?: number
}

export type UseCameraQr = {
  videoRef: RefObject<HTMLVideoElement | null>
  status: CameraQrStatus
  /** Stops the stream now. */
  stop: () => void
}

type MediaDevicesLike = { getUserMedia(c: unknown): Promise<MediaStream> }

export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof (navigator as { mediaDevices?: MediaDevicesLike }).mediaDevices?.getUserMedia === 'function'
}

export function useCameraQr({ active, onCode, intervalMs = 250 }: UseCameraQrOptions): UseCameraQr {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [status, setStatus] = useState<CameraQrStatus>('idle')
  const streamRef = useRef<MediaStream | null>(null)
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  const stop = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop()
    streamRef.current = null
    const v = videoRef.current
    if (v) v.srcObject = null
    setStatus((s) => (s === 'denied' || s === 'unsupported' ? s : 'idle'))
  }, [])

  useEffect(() => {
    if (!active) return
    if (!cameraSupported()) {
      setStatus('unsupported')
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined
    let busy = false
    setStatus('starting')

    const onHidden = () => {
      if (document.visibilityState === 'hidden') stop()
    }
    document.addEventListener('visibilitychange', onHidden)

    ;(async () => {
      let stream: MediaStream
      try {
        stream = await (navigator as unknown as { mediaDevices: MediaDevicesLike }).mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      } catch {
        if (!cancelled) setStatus('denied')
        return
      }
      if (cancelled) {
        for (const t of stream.getTracks()) t.stop()
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        for (const t of stream.getTracks()) t.stop()
        streamRef.current = null
        return
      }
      video.srcObject = stream
      video.muted = true
      void video.play?.().catch(() => undefined)
      setStatus('scanning')
      const eng = await import('@asteby/storefront/fiscal-document')
      timer = setInterval(async () => {
        if (busy || cancelled || !videoRef.current || videoRef.current.readyState < 2) return
        busy = true
        try {
          const text = await eng.decodeImageQr(videoRef.current)
          if (text && !cancelled) {
            cancelled = true
            clearInterval(timer)
            stop()
            onCodeRef.current(text)
          }
        } catch {
          /* a frame that cannot be read is not an error: the next one may */
        } finally {
          busy = false
        }
      }, intervalMs)
    })()

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onHidden)
      for (const t of streamRef.current?.getTracks() ?? []) t.stop()
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [active, intervalMs, stop])

  return { videoRef, status, stop }
}

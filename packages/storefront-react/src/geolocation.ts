import { useCallback, useEffect, useRef, useState } from 'react'
import type { GeoPoint } from '@asteby/storefront'

export type GeolocationErrorCode = 'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'timeout'

/** Typed failure of `request()`. `message` is a ready-to-show es-MX text. */
export type GeolocationFailure = { code: GeolocationErrorCode; message: string }

/** State of the browser permission. `unknown` when the Permissions API is missing. */
export type GeolocationPermission = 'granted' | 'denied' | 'prompt' | 'unknown'

export type UseGeolocationOptions = {
  enableHighAccuracy?: boolean
  /** Give up after this long (default 10 s). */
  timeoutMs?: number
  /** Accept a cached position up to this old (default 5 min). */
  maximumAge?: number
}

export type UseGeolocationResult = {
  /** `false` on the server and until mounted, so SSR and hydration agree. */
  supported: boolean
  permission: GeolocationPermission
  status: 'idle' | 'locating' | 'success' | 'error'
  position: GeoPoint | null
  error: GeolocationFailure | null
  /**
   * Asks the browser for the position. Call it ONLY from a user gesture (a button's onClick): the hook never
   * asks by itself. Resolves to the point, or `null` on failure (see `error`).
   */
  request: () => Promise<GeoPoint | null>
  reset: () => void
}

const MESSAGES: Record<GeolocationErrorCode, string> = {
  unsupported: 'Tu navegador no permite obtener tu ubicación.',
  insecure: 'La ubicación solo está disponible en conexiones seguras (HTTPS).',
  denied: 'No tenemos permiso para usar tu ubicación. Puedes activarlo en el navegador o escribir tu código postal.',
  unavailable: 'No pudimos determinar tu ubicación. Escribe tu código postal.',
  timeout: 'Tardó demasiado en obtener tu ubicación. Intenta de nuevo o escribe tu código postal.',
}

const fail = (code: GeolocationErrorCode): GeolocationFailure => ({ code, message: MESSAGES[code] })

const hasGeolocation = () => typeof navigator !== 'undefined' && !!navigator.geolocation

/**
 * Browser geolocation that only runs under a user action. Reading the permission state (when the Permissions
 * API exists) does not prompt. The point stays in React state: it is never stored or sent anywhere here.
 */
export function useGeolocation(options: UseGeolocationOptions = {}): UseGeolocationResult {
  const { enableHighAccuracy = false, timeoutMs = 10_000, maximumAge = 300_000 } = options
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<GeolocationPermission>('unknown')
  const [status, setStatus] = useState<UseGeolocationResult['status']>('idle')
  const [position, setPosition] = useState<GeoPoint | null>(null)
  const [error, setError] = useState<GeolocationFailure | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    setSupported(hasGeolocation())
    let off = () => {}
    try {
      const perms = typeof navigator !== 'undefined' ? navigator.permissions : undefined
      void perms?.query({ name: 'geolocation' }).then((p) => {
        if (!alive.current) return
        const sync = () => setPermission(p.state)
        sync()
        p.addEventListener?.('change', sync)
        off = () => p.removeEventListener?.('change', sync)
      }, () => {})
    } catch {
      // Permissions API unavailable or rejects 'geolocation': stay `unknown`.
    }
    return () => {
      alive.current = false
      off()
    }
  }, [])

  const request = useCallback((): Promise<GeoPoint | null> => {
    const failWith = (code: GeolocationErrorCode) => {
      if (alive.current) {
        setStatus('error')
        setError(fail(code))
      }
      return null
    }
    if (!hasGeolocation()) return Promise.resolve(failWith('unsupported'))
    if (typeof window !== 'undefined' && window.isSecureContext === false) return Promise.resolve(failWith('insecure'))
    setStatus('locating')
    setError(null)
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const point = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          if (alive.current) {
            setPosition(point)
            setStatus('success')
            setPermission('granted')
          }
          resolve(point)
        },
        (err) => resolve(failWith(err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable')),
        { enableHighAccuracy, timeout: timeoutMs, maximumAge },
      )
    })
  }, [enableHighAccuracy, timeoutMs, maximumAge])

  const reset = useCallback(() => {
    setStatus('idle')
    setPosition(null)
    setError(null)
  }, [])

  return { supported, permission, status, position, error, request, reset }
}

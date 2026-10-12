import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { isMobileLikeClient } from './device'

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort?: () => void
  onresult:
    | ((ev: {
        resultIndex: number
        results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>
      }) => void)
    | null
  onerror: ((ev: { error?: string }) => void) | null
  onend: (() => void) | null
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

/** Phone / tablet / installed PWA — Web Speech + getUserMedia fight for the mic. */
export { isMobileLikeClient } from './device'

export function speechDictationSupported(): boolean {
  return !!getSpeechRecognition()
}

/**
 * Chrome Web Speech API dictation. Appends final transcripts via `onFinal`.
 * In `continuous` live mode, keeps listening until stop().
 *
 * Mobile: forces non-continuous + delayed restart (continuous rarely finalizes
 * on Android Chrome / PWA) and surfaces permission/network errors.
 */
export function useSpeechDictation({
  lang = 'es-ES',
  onFinal,
  onInterim,
  continuous = false,
  mascotName = 'Aby',
}: {
  lang?: string
  onFinal: (transcript: string) => void
  /** Live partial text while the user is still speaking. */
  onInterim?: (transcript: string) => void
  /** Keep mic open (live mode). Default false = one utterance then stop. */
  continuous?: boolean
  /** Org's mascot display name (branding.mascot_name), for the mic-denied toast. */
  mascotName?: string
}) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onFinalRef = useRef(onFinal)
  const onInterimRef = useRef(onInterim)
  const continuousRef = useRef(continuous)
  const wantListenRef = useRef(false)
  const sessionRef = useRef(0)
  const restartTimerRef = useRef<number | null>(null)
  const networkStreakRef = useRef(0)
  const lastNetworkToastAtRef = useRef(0)
  const restartDelayRef = useRef(80)
  onFinalRef.current = onFinal
  onInterimRef.current = onInterim
  continuousRef.current = continuous

  const clearRestartTimer = () => {
    if (restartTimerRef.current != null) {
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      wantListenRef.current = false
      clearRestartTimer()
      try {
        recognitionRef.current?.abort?.()
        recognitionRef.current?.stop()
      } catch {
        /* ignore */
      }
    }
  }, [])

  const stop = useCallback(() => {
    wantListenRef.current = false
    clearRestartTimer()
    sessionRef.current += 1
    networkStreakRef.current = 0
    restartDelayRef.current = isMobileLikeClient() ? 280 : 80
    try {
      recognitionRef.current?.abort?.()
      recognitionRef.current?.stop()
    } catch {
      /* ignore */
    }
    recognitionRef.current = null
    setListening(false)
    onInterimRef.current?.('')
  }, [])

  // Leaving live / muting must kill restart loops even if a prior start raced.
  useEffect(() => {
    if (!continuous && wantListenRef.current) {
      stop()
    }
  }, [continuous, stop])

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition()
    if (!Ctor) {
      toast.error('Este dispositivo no soporta dictado por voz. Prueba Chrome en Android.', {
        id: 'aby-speech-unsupported',
      })
      return
    }

    clearRestartTimer()
    const session = ++sessionRef.current
    wantListenRef.current = true
    networkStreakRef.current = 0
    restartDelayRef.current = isMobileLikeClient() ? 280 : 80

    const begin = () => {
      if (!wantListenRef.current || session !== sessionRef.current) return

      try {
        recognitionRef.current?.abort?.()
        recognitionRef.current?.stop()
      } catch {
        /* ignore */
      }

      const mobile = isMobileLikeClient()
      // Android/iOS: continuous almost never emits isFinal while open — use
      // one-shot + restart. Desktop Chrome handles continuous fine.
      const useContinuous = continuousRef.current && !mobile

      const rec = new Ctor()
      rec.lang = lang
      rec.continuous = useContinuous
      rec.interimResults = true

      rec.onresult = (ev) => {
        if (!wantListenRef.current || session !== sessionRef.current) return
        networkStreakRef.current = 0
        restartDelayRef.current = mobile ? 280 : 80
        let finalChunk = ''
        let interimChunk = ''
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i]
          const t = r[0]?.transcript || ''
          if (r.isFinal) finalChunk += t
          else interimChunk += t
        }
        if (interimChunk) onInterimRef.current?.(interimChunk.trim())
        if (finalChunk) {
          onInterimRef.current?.('')
          onFinalRef.current(finalChunk.trim())
        }
      }

      rec.onerror = (ev) => {
        if (session !== sessionRef.current) return
        const code = ev?.error || ''
        // Expected while restarting / after stop / quiet pauses.
        if (code === 'aborted' || code === 'no-speech') return
        if (code === 'not-allowed') {
          wantListenRef.current = false
          setListening(false)
          toast.error(`Activa el micrófono para ${mascotName} (ajustes del navegador o de la app).`, {
            id: 'aby-speech-denied',
          })
          return
        }
        if (code === 'service-not-allowed') {
          wantListenRef.current = false
          setListening(false)
          toast.error('Dictado bloqueado en este dispositivo.', {
            id: 'aby-speech-blocked',
          })
          return
        }
        if (code === 'network') {
          // Chrome fires "network" a lot on live restart even with good Wi‑Fi —
          // never spam toasts; back off and stop after a streak.
          networkStreakRef.current += 1
          restartDelayRef.current = Math.min(
            8_000,
            Math.max(restartDelayRef.current, 600) * 1.6,
          )
          const now = Date.now()
          if (
            networkStreakRef.current >= 3 &&
            now - lastNetworkToastAtRef.current > 60_000
          ) {
            lastNetworkToastAtRef.current = now
            toast.error('Sin red para el dictado de voz. Revisa la conexión.', {
              id: 'aby-speech-network',
            })
          }
          if (networkStreakRef.current >= 8) {
            wantListenRef.current = false
            setListening(false)
            toast.message('Dictado en pausa (red). Reactiva live para reintentar.', {
              id: 'aby-speech-network-paused',
            })
          }
          return
        }
      }

      rec.onend = () => {
        if (session !== sessionRef.current) return
        if (!wantListenRef.current || !continuousRef.current) {
          setListening(false)
          return
        }
        const delay = restartDelayRef.current
        clearRestartTimer()
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null
          if (!wantListenRef.current || session !== sessionRef.current) return
          begin()
        }, delay)
      }

      recognitionRef.current = rec
      try {
        rec.start()
        setListening(true)
      } catch {
        // InvalidStateError if already started — retry once shortly.
        clearRestartTimer()
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null
          if (!wantListenRef.current || session !== sessionRef.current) return
          try {
            rec.start()
            setListening(true)
          } catch {
            wantListenRef.current = false
            setListening(false)
            toast.error('No se pudo iniciar el micrófono', { id: 'aby-speech-start' })
          }
        }, 320)
      }
    }

    begin()
  }, [lang, mascotName])

  const toggle = useCallback(() => {
    if (listening && recognitionRef.current) {
      stop()
      return
    }
    start()
  }, [listening, start, stop])

  return {
    listening,
    toggle,
    start,
    stop,
    supported: speechDictationSupported(),
  }
}

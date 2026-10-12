/**
 * Browser TTS for Aby live mode. Prefers a Google/Chrome Spanish voice when
 * available (Chrome's speechSynthesis voices are Google-backed).
 *
 * Chrome often freezes mid-utterance (`paused` forever, no `onend`) — we keep a
 * resume tick + hard watchdog so live mode never stays stuck on "Aby hablando".
 */

type SpeakOpts = {
  lang?: string
  rate?: number
  onStart?: () => void
  onEnd?: () => void
}

let speaking = false
let resumeTimer: number | null = null
let watchdogTimer: number | null = null
let activeUtterance: SpeechSynthesisUtterance | null = null

function clearTimers() {
  if (typeof window === 'undefined') return
  if (resumeTimer != null) {
    window.clearInterval(resumeTimer)
    resumeTimer = null
  }
  if (watchdogTimer != null) {
    window.clearTimeout(watchdogTimer)
    watchdogTimer = null
  }
}

function finishSpeaking(opts?: SpeakOpts) {
  if (!speaking && !activeUtterance) {
    opts?.onEnd?.()
    return
  }
  speaking = false
  activeUtterance = null
  clearTimers()
  opts?.onEnd?.()
}

export function isSpeaking(): boolean {
  return speaking
}

export function speakText(text: string, opts?: SpeakOpts) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    opts?.onEnd?.()
    return
  }
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[`*_#>[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) {
    opts?.onEnd?.()
    return
  }

  window.speechSynthesis.cancel()
  clearTimers()
  speaking = false
  activeUtterance = null

  const rate = opts?.rate ?? 1.05
  const u = new SpeechSynthesisUtterance(plain.slice(0, 1200))
  u.lang = opts?.lang || 'es-MX'
  u.rate = rate

  const voices = window.speechSynthesis.getVoices()
  const preferred =
    voices.find((v) => /google/i.test(v.name) && /^es/i.test(v.lang)) ||
    voices.find((v) => /^es(-|_)?MX/i.test(v.lang)) ||
    voices.find((v) => /^es/i.test(v.lang))
  if (preferred) u.voice = preferred

  u.onstart = () => {
    speaking = true
    opts?.onStart?.()
  }
  const finish = () => finishSpeaking(opts)
  u.onend = finish
  u.onerror = finish

  activeUtterance = u
  // Chrome bug: utterance silently pauses; resume keeps audio moving.
  resumeTimer = window.setInterval(() => {
    try {
      if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
        window.speechSynthesis.resume()
      }
    } catch {
      /* ignore */
    }
  }, 250)

  // ~14 chars/s at rate 1 + cushion; hard cap 45s so live never freezes.
  const ms = Math.min(45_000, Math.max(4_000, (plain.length / 14) * 1000 * (1 / rate) + 2500))
  watchdogTimer = window.setTimeout(() => {
    try {
      window.speechSynthesis.cancel()
    } catch {
      /* ignore */
    }
    finish()
  }, ms)

  window.speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  speaking = false
  activeUtterance = null
  clearTimers()
}

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && !!window.speechSynthesis
}

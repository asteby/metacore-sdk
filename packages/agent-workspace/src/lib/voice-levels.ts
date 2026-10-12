/**
 * Mic amplitude → bar levels for Aby live waveform.
 * Uses a dedicated getUserMedia + AnalyserNode (parallel to Web Speech).
 * Desktop Chrome allows both; on mobile/PWA concurrent GUM steals the mic
 * from SpeechRecognition — skip hardware levels there.
 */

import { isMobileLikeClient } from './device'

const BAR_COUNT = 16

type Listener = (levels: number[]) => void

let listeners = new Set<Listener>()
let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let stream: MediaStream | null = null
let raf = 0
let started = false
let smooth = Array.from({ length: BAR_COUNT }, () => 0.12)

/** False on phones/tablets/PWA where getUserMedia breaks Web Speech. */
export function canUseMicWaveform(): boolean {
  return typeof window !== 'undefined' && !isMobileLikeClient()
}

function emit(levels: number[]) {
  for (const l of listeners) l(levels)
}

function tick() {
  if (!analyser) return
  const data = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(data)
  // Focus on voice band (~85–4000 Hz); bins scale with sampleRate.
  const n = data.length
  const start = Math.floor(n * 0.04)
  const end = Math.min(n, Math.floor(n * 0.45))
  const slice = data.subarray(start, end)
  const next: number[] = []
  const chunk = Math.max(1, Math.floor(slice.length / BAR_COUNT))
  for (let i = 0; i < BAR_COUNT; i++) {
    let sum = 0
    const a = i * chunk
    const b = Math.min(slice.length, a + chunk)
    for (let j = a; j < b; j++) sum += slice[j]
    const raw = (sum / (b - a || 1)) / 255
    // Soft gate + ease so silence isn't a flat line and peaks feel snappy.
    const gated = raw < 0.04 ? raw * 0.35 : Math.min(1, Math.pow(raw, 0.72) * 1.35)
    smooth[i] = smooth[i] * 0.55 + gated * 0.45
    next.push(Math.max(0.08, Math.min(1, smooth[i])))
  }
  emit(next)
  raf = requestAnimationFrame(tick)
}

async function ensureMic(): Promise<boolean> {
  if (!canUseMicWaveform()) return false
  if (started && analyser) return true
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return false
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    })
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return false
    audioCtx = new AC()
    if (audioCtx.state === 'suspended') await audioCtx.resume()
    const source = audioCtx.createMediaStreamSource(stream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.55
    source.connect(analyser)
    started = true
    raf = requestAnimationFrame(tick)
    return true
  } catch {
    stopVoiceLevels()
    return false
  }
}

export function stopVoiceLevels() {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  started = false
  analyser = null
  if (audioCtx) {
    void audioCtx.close().catch(() => {})
    audioCtx = null
  }
  if (stream) {
    for (const t of stream.getTracks()) t.stop()
    stream = null
  }
  smooth = Array.from({ length: BAR_COUNT }, () => 0.12)
  emit(Array.from({ length: BAR_COUNT }, () => 0.12))
}

/** Subscribe to live mic levels. Starts the mic on first subscriber (desktop only). */
export function subscribeVoiceLevels(listener: Listener): () => void {
  listeners.add(listener)
  if (!canUseMicWaveform()) {
    listener(Array.from({ length: BAR_COUNT }, () => 0.18))
    return () => {
      listeners.delete(listener)
    }
  }
  void ensureMic().then((ok) => {
    if (!ok) listener(Array.from({ length: BAR_COUNT }, () => 0.15))
  })
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stopVoiceLevels()
  }
}

export const VOICE_BAR_COUNT = BAR_COUNT

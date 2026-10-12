/** Peak sampling for WhatsApp-style voice-note waveforms. */

const DEFAULT_BARS = 40

/** Normalize raw levels (0..1) into bar heights 0.15..1 for nicer visuals. */
export function normalizePeaks(raw: number[], bars = DEFAULT_BARS): number[] {
  if (!raw.length) return Array.from({ length: bars }, () => 0.25)
  const step = raw.length / bars
  const out: number[] = []
  let max = 0.0001
  for (let i = 0; i < bars; i++) {
    const start = Math.floor(i * step)
    const end = Math.max(start + 1, Math.floor((i + 1) * step))
    let sum = 0
    for (let j = start; j < end && j < raw.length; j++) sum += raw[j]
    const v = sum / (end - start)
    max = Math.max(max, v)
    out.push(v)
  }
  return out.map((v) => Math.max(0.15, Math.min(1, v / max)))
}

/** Live mic peaks via AnalyserNode while MediaRecorder runs. */
export function createLivePeakSampler(
  stream: MediaStream,
  onPeak?: (level: number) => void,
): { stop: () => void; peaks: () => number[] } {
  const samples: number[] = []
  let raf = 0
  let ctx: AudioContext | null = null
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new Ctx()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.55
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)

    const tick = () => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / data.length)
      samples.push(rms)
      onPeak?.(rms)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  } catch {
    /* analyser unavailable — empty peaks */
  }

  return {
    peaks: () => normalizePeaks(samples.length ? samples : [0.2], DEFAULT_BARS),
    stop: () => {
      if (raf) cancelAnimationFrame(raf)
      void ctx?.close().catch(() => {})
    },
  }
}

/** Decode a remote/local audio URL into peaks (for messages without stored waveform). */
export async function peaksFromAudioUrl(
  url: string,
  bars = DEFAULT_BARS,
): Promise<{ peaks: number[]; duration: number }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('audio fetch failed')
  const buf = await res.arrayBuffer()
  return peaksFromArrayBuffer(buf, bars)
}

export async function peaksFromArrayBuffer(
  buf: ArrayBuffer,
  bars = DEFAULT_BARS,
): Promise<{ peaks: number[]; duration: number }> {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctx()
  try {
    const audio = await ctx.decodeAudioData(buf.slice(0))
    const channel = audio.getChannelData(0)
    const block = Math.max(1, Math.floor(channel.length / bars))
    const raw: number[] = []
    for (let i = 0; i < bars; i++) {
      const start = i * block
      let peak = 0
      for (let j = start; j < start + block && j < channel.length; j++) {
        peak = Math.max(peak, Math.abs(channel[j]))
      }
      raw.push(peak)
    }
    return { peaks: normalizePeaks(raw, bars), duration: audio.duration }
  } finally {
    void ctx.close().catch(() => {})
  }
}

/** Stable placeholder bars when peaks are still loading. */
export function placeholderPeaks(seed: string, bars = DEFAULT_BARS): number[] {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const out: number[] = []
  for (let i = 0; i < bars; i++) {
    h = (h * 1664525 + 1013904223) >>> 0
    out.push(0.2 + ((h % 80) / 100) * 0.7)
  }
  return out
}

export function formatVoiceDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds + 1e-3)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

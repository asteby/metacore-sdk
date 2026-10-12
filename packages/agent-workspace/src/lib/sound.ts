/** Soft notification chime (Web Audio). No external asset required. */
export function playNotificationSound(): void {
  if (typeof window === 'undefined') return
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.28)
    osc.onended = () => {
      void ctx.close()
    }
  } catch {
    /* autoplay / unsupported — ignore */
  }
}

function makeAudioCtx(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    const ctx = new Ctx()
    void ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

/** Ascending chime when Hub credits Pulse or Ember to this org. */
export function playSparksTopUpSound(): void {
  if (typeof window === 'undefined') return
  try {
    const ctx = makeAudioCtx()
    if (!ctx) return
    const now = ctx.currentTime
    const tones = [523.25, 659.25, 783.99]
    tones.forEach((freq, i) => {
      const t0 = now + i * 0.07
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, t0)
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.11, t0 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.24)
    })
    window.setTimeout(() => {
      void ctx.close().catch(() => {})
    }, 500)
  } catch {
    /* ignore */
  }
}

/**
 * WhatsApp-like looping ringtone for *incoming* calls.
 * Returns stop() — safe to call multiple times.
 */
export function startCallRingtone(): () => void {
  if (typeof window === 'undefined') return () => {}
  let stopped = false
  let ctx: AudioContext | null = null
  let timer: number | null = null

  const ringOnce = () => {
    if (stopped || !ctx) return
    try {
      const now = ctx.currentTime
      // Two rising chirps ≈ classic phone ring cadence.
      for (let i = 0; i < 2; i++) {
        const t0 = now + i * 0.22
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(520, t0)
        osc.frequency.linearRampToValueAtTime(780, t0 + 0.18)
        gain.gain.setValueAtTime(0.0001, t0)
        gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(t0)
        osc.stop(t0 + 0.22)
      }
    } catch {
      /* ignore */
    }
  }

  ctx = makeAudioCtx()
  if (!ctx) return () => {}
  ringOnce()
  timer = window.setInterval(ringOnce, 1800)

  return () => {
    if (stopped) return
    stopped = true
    if (timer != null) window.clearInterval(timer)
    timer = null
    if (ctx) {
      void ctx.close().catch(() => {})
      ctx = null
    }
  }
}

/**
 * Outgoing ringback (caller hears this while waiting for answer).
 * Softer dual-tone loop, distinct from the incoming ringtone.
 */
export function startCallRingback(): () => void {
  if (typeof window === 'undefined') return () => {}
  let stopped = false
  let ctx: AudioContext | null = null
  let timer: number | null = null

  const beepOnce = () => {
    if (stopped || !ctx) return
    try {
      const now = ctx.currentTime
      // Classic PSTN-ish ringback: ~440+480Hz pulse.
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(440, now)
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(480, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.07, now + 0.04)
      gain.gain.setValueAtTime(0.07, now + 0.85)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0)
      gain2.gain.setValueAtTime(0.0001, now)
      gain2.gain.exponentialRampToValueAtTime(0.05, now + 0.04)
      gain2.gain.setValueAtTime(0.05, now + 0.85)
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 1.0)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 1.05)
      osc2.start(now)
      osc2.stop(now + 1.05)
    } catch {
      /* ignore */
    }
  }

  ctx = makeAudioCtx()
  if (!ctx) return () => {}
  beepOnce()
  timer = window.setInterval(beepOnce, 2800)

  return () => {
    if (stopped) return
    stopped = true
    if (timer != null) window.clearInterval(timer)
    timer = null
    if (ctx) {
      void ctx.close().catch(() => {})
      ctx = null
    }
  }
}

/** Short “call connected” cue when the remote joins. */
export function playCallConnectedSound(): void {
  if (typeof window === 'undefined') return
  try {
    const ctx = makeAudioCtx()
    if (!ctx) return
    const now = ctx.currentTime
    const tones = [660, 880]
    tones.forEach((freq, i) => {
      const t0 = now + i * 0.09
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, t0)
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.1, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.18)
    })
    window.setTimeout(() => {
      void ctx.close().catch(() => {})
    }, 500)
  } catch {
    /* ignore */
  }
}

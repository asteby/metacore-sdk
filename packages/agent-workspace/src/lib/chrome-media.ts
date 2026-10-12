/**
 * Chrome media helpers for chat: Media Session (lock-screen / media hub
 * controls like Spotify) and Document Picture-in-Picture (floating always-on-top
 * call window while browsing other tabs).
 */

export type CallKind = 'audio' | 'video' | 'screen'

export function supportsDocumentPiP(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window
}

export function supportsMediaSession(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator
}

/** Open a Document PiP window and move `node` into it. Returns the PiP window. */
export async function openDocumentPiP(
  node: HTMLElement,
  opts?: { width?: number; height?: number },
): Promise<Window | null> {
  const dpi = (
    window as unknown as {
      documentPictureInPicture?: {
        requestWindow: (o?: {
          width?: number
          height?: number
        }) => Promise<Window>
      }
    }
  ).documentPictureInPicture
  if (!dpi?.requestWindow) return null

  const pip = await dpi.requestWindow({
    width: opts?.width ?? 360,
    height: opts?.height ?? 300,
  })

  // Critical layout FIRST — async <link> stylesheets leave a black scrolled void
  // until they load; the call shell also clones with position:absolute / min-h
  // which overflows the tiny PiP viewport. Force a contained flex column.
  const base = pip.document.createElement('style')
  base.textContent = `
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      overflow: hidden !important;
      background: #1e1f22 !important;
      color: #f4f4f5;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    }
    *, *::before, *::after { box-sizing: border-box; }
    video {
      background: #000;
      max-width: 100%;
      max-height: 100%;
      object-fit: cover;
    }
    [data-call-pip-root] {
      position: relative !important;
      inset: auto !important;
      left: auto !important;
      top: auto !important;
      right: auto !important;
      bottom: auto !important;
      transform: none !important;
      width: 100% !important;
      max-width: none !important;
      height: 100% !important;
      max-height: 100% !important;
      margin: 0 !important;
      border-radius: 0 !important;
      overflow: hidden !important;
      display: flex !important;
      flex-direction: column !important;
      box-shadow: none !important;
      border: none !important;
    }
    /* Header + dock: fixed height; stage fills leftover */
    [data-call-pip-root] > :nth-child(1),
    [data-call-pip-root] > :nth-child(3) {
      flex: 0 0 auto !important;
      min-height: 0 !important;
    }
    [data-call-pip-root] > :nth-child(2) {
      flex: 1 1 auto !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: hidden !important;
      position: relative !important;
      height: auto !important;
    }
    /* Kill Tailwind min-heights / aspect that blow past the PiP box */
    [data-call-pip-root] [class*="min-h-"],
    [data-call-pip-root] [class*="aspect-"] {
      min-height: 0 !important;
      aspect-ratio: auto !important;
    }
    [data-call-pip-root] .grid {
      height: 100% !important;
      max-height: 100% !important;
      overflow: hidden !important;
    }
    /* Local self-view: keep inside stage, don't spill over dock */
    [data-call-pip-root] [data-call-video="local"] {
      max-height: 100% !important;
    }
    [data-call-pip-root] .absolute.bottom-2.right-2 {
      bottom: 0.35rem !important;
      right: 0.35rem !important;
      height: 3.25rem !important;
      width: 2.75rem !important;
      max-height: 40% !important;
    }
  `
  pip.document.head.appendChild(base)

  // Copy stylesheets so Tailwind utilities on the clone still resolve.
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const href = (sheet as CSSStyleSheet).href
      if (href) {
        const link = pip.document.createElement('link')
        link.rel = 'stylesheet'
        link.href = href
        pip.document.head.appendChild(link)
      } else if ((sheet as CSSStyleSheet).cssRules) {
        const style = pip.document.createElement('style')
        style.textContent = Array.from((sheet as CSSStyleSheet).cssRules)
          .map((r) => r.cssText)
          .join('\n')
        pip.document.head.appendChild(style)
      }
    } catch {
      /* cross-origin sheets ignored */
    }
  }

  node.setAttribute('data-call-pip-root', '1')
  node.style.cssText = [
    'position:relative',
    'inset:auto',
    'left:auto',
    'top:auto',
    'right:auto',
    'bottom:auto',
    'transform:none',
    'width:100%',
    'max-width:none',
    'height:100%',
    'max-height:100%',
    'margin:0',
    'border-radius:0',
    'overflow:hidden',
    'display:flex',
    'flex-direction:column',
  ].join(';')

  pip.document.body.appendChild(node)
  return pip
}

export type CallPiPModel = {
  title: string
  name: string
  status: string
  kind: CallKind
  muted: boolean
  showCam?: boolean
  camOff?: boolean
  letter?: string
}

/**
 * Dedicated dark Document PiP for calls — no React/Tailwind clone.
 * Cloning the in-app shell pulled light-theme CSS and broke layout.
 */
export async function openCallDocumentPiP(
  model: CallPiPModel,
  opts?: { width?: number; height?: number },
): Promise<Window | null> {
  const dpi = (
    window as unknown as {
      documentPictureInPicture?: {
        requestWindow: (o?: { width?: number; height?: number }) => Promise<Window>
      }
    }
  ).documentPictureInPicture
  if (!dpi?.requestWindow) return null

  const isAudio = model.kind === 'audio'
  const pip = await dpi.requestWindow({
    width: opts?.width ?? (isAudio ? 320 : 360),
    height: opts?.height ?? (isAudio ? 300 : 320),
  })

  const style = pip.document.createElement('style')
  style.textContent = `
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      overflow: hidden; background: #141416; color: #f4f4f5;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    }
    * { box-sizing: border-box; }
    #root {
      display: flex; flex-direction: column; width: 100%; height: 100%;
      background: #1a1b1e;
    }
    header {
      flex: 0 0 auto; padding: 10px 12px 0; font-size: 12px; color: #a1a1aa;
    }
    #stage {
      flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 8px; padding: 8px 12px;
      position: relative; overflow: hidden;
    }
    #avatar {
      width: 88px; height: 88px; border-radius: 999px;
      background: #166534; color: #fff; display: flex; align-items: center;
      justify-content: center; font-size: 36px; font-weight: 600;
      border: 2px solid #22c55e;
    }
    #name { font-size: 16px; font-weight: 600; text-align: center; }
    #status { font-size: 13px; color: #4ade80; text-align: center; min-height: 1.2em; }
    #videos {
      position: absolute; inset: 0; display: none; background: #000;
    }
    #videos.on { display: block; }
    #videos video {
      width: 100%; height: 100%; object-fit: cover; background: #000;
    }
    #local-wrap {
      position: absolute; right: 8px; bottom: 8px; width: 72px; height: 96px;
      border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,.2);
      display: none; background: #000;
    }
    #local-wrap.on { display: block; }
    #local-wrap video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
    dock, #dock {
      flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
      gap: 10px; padding: 12px 10px 14px;
    }
    button.action {
      width: 44px; height: 44px; border-radius: 999px; border: 0; cursor: pointer;
      background: rgba(255,255,255,.12); color: #f4f4f5;
      display: inline-flex; align-items: center; justify-content: center;
    }
    button.action:hover { background: rgba(255,255,255,.2); }
    button.action.on { background: #dc2626; color: #fff; }
    button.hangup { background: #dc2626; color: #fff; width: 52px; height: 52px; }
    button.hangup:hover { background: #b91c1c; }
    button svg { width: 20px; height: 20px; fill: none; stroke: currentColor;
      stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .audio-only #videos, .audio-only #local-wrap { display: none !important; }
  `
  pip.document.head.appendChild(style)

  const letter = (model.letter || model.name || '?').trim().charAt(0).toUpperCase() || '?'
  const root = pip.document.createElement('div')
  root.id = 'root'
  if (isAudio) root.classList.add('audio-only')
  root.innerHTML = `
    <header data-pip-title>${escapeHtml(model.title)}</header>
    <div id="stage">
      <div id="videos"><video data-pip-remote-video playsinline autoplay muted></video></div>
      <div id="avatar">${escapeHtml(letter)}</div>
      <div id="name" data-pip-name>${escapeHtml(model.name)}</div>
      <div id="status" data-pip-status>${escapeHtml(model.status)}</div>
      <div id="local-wrap"><video data-pip-local-video playsinline autoplay muted></video></div>
    </div>
    <div id="dock">
      <button type="button" class="action${model.muted ? ' on' : ''}" data-call-action="mute" title="Mic">
        <svg viewBox="0 0 24 24" data-pip-mic-icon>${model.muted ? MIC_OFF_PATH : MIC_PATH}</svg>
      </button>
      ${
        model.showCam
          ? `<button type="button" class="action${model.camOff ? ' on' : ''}" data-call-action="cam" title="Cámara">
        <svg viewBox="0 0 24 24">${model.camOff ? CAM_OFF_PATH : CAM_PATH}</svg>
      </button>`
          : ''
      }
      <button type="button" class="action" data-call-action="restore" title="Ampliar">
        <svg viewBox="0 0 24 24">${EXPAND_PATH}</svg>
      </button>
      <button type="button" class="action hangup" data-call-action="hangup" title="Colgar">
        <svg viewBox="0 0 24 24">${HANGUP_PATH}</svg>
      </button>
    </div>
  `
  pip.document.body.appendChild(root)
  return pip
}

const MIC_PATH =
  '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>'
const MIC_OFF_PATH =
  '<line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 4"/><path d="M12 19v3"/><path d="M8.59 8.58A3 3 0 0 0 9 10v2a3 3 0 0 0 5.12 2.12"/>'
const CAM_PATH =
  '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>'
const CAM_OFF_PATH =
  '<path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196"/><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/><line x1="2" x2="22" y1="2" y2="22"/>'
const EXPAND_PATH =
  '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/>'
const HANGUP_PATH =
  '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>'

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Update labels / mute state inside an open call PiP window. */
export function syncCallDocumentPiP(
  pip: Window,
  model: Partial<CallPiPModel> & { muted?: boolean; camOff?: boolean },
) {
  try {
    const doc = pip.document
    if (model.title != null) {
      const el = doc.querySelector('[data-pip-title]')
      if (el) el.textContent = model.title
    }
    if (model.name != null) {
      const el = doc.querySelector('[data-pip-name]')
      if (el) el.textContent = model.name
    }
    if (model.status != null) {
      const el = doc.querySelector('[data-pip-status]')
      if (el) el.textContent = model.status
    }
    if (typeof model.muted === 'boolean') {
      const btn = doc.querySelector('[data-call-action="mute"]') as HTMLElement | null
      const icon = doc.querySelector('[data-pip-mic-icon]')
      if (btn) btn.classList.toggle('on', model.muted)
      if (icon) icon.innerHTML = model.muted ? MIC_OFF_PATH : MIC_PATH
    }
    if (typeof model.camOff === 'boolean') {
      const btn = doc.querySelector('[data-call-action="cam"]') as HTMLElement | null
      if (btn) {
        btn.classList.toggle('on', model.camOff)
        const svg = btn.querySelector('svg')
        if (svg) svg.innerHTML = model.camOff ? CAM_OFF_PATH : CAM_PATH
      }
    }
  } catch {
    /* pip tearing down */
  }
}

/** Bind local/remote media into the dedicated call PiP. */
export function bindCallDocumentPiPMedia(
  pip: Window,
  opts: {
    kind: CallKind
    localStream: MediaStream | null
    remotes: { stream: MediaStream }[]
  },
) {
  try {
    const doc = pip.document
    const videos = doc.getElementById('videos')
    const localWrap = doc.getElementById('local-wrap')
    const remoteVideo = doc.querySelector('[data-pip-remote-video]') as HTMLVideoElement | null
    const localVideo = doc.querySelector('[data-pip-local-video]') as HTMLVideoElement | null

    const remoteWithVideo = opts.remotes.find((r) =>
      r.stream.getVideoTracks().some((t) => t.readyState !== 'ended'),
    )
    if (opts.kind !== 'audio' && remoteVideo && remoteWithVideo) {
      videos?.classList.add('on')
      remoteVideo.srcObject = remoteWithVideo.stream
      remoteVideo.muted = true
      void remoteVideo.play().catch(() => {})
    } else {
      videos?.classList.remove('on')
    }

    const localHasVideo =
      opts.kind !== 'audio' &&
      !!opts.localStream?.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled)
    if (localVideo && localHasVideo && opts.localStream) {
      localWrap?.classList.add('on')
      localVideo.srcObject = opts.localStream
      localVideo.muted = true
      void localVideo.play().catch(() => {})
    } else {
      localWrap?.classList.remove('on')
    }

    doc.querySelectorAll('audio[data-pip-remote]').forEach((n) => n.remove())
    for (const remote of opts.remotes) {
      if (!remote.stream.getAudioTracks().length) continue
      const audio = doc.createElement('audio')
      audio.autoplay = true
      audio.setAttribute('data-pip-remote', '1')
      audio.srcObject = remote.stream
      doc.body.appendChild(audio)
      void audio.play().catch(() => {})
    }
  } catch {
    /* pip tearing down */
  }
}

export function setCallMediaSession(opts: {
  title: string
  artist?: string
  artwork?: string
  onHangup?: () => void
  onMuteToggle?: () => void
}) {
  if (!supportsMediaSession()) return
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: opts.title,
      artist: opts.artist || 'Asteby Chat',
      album: 'Llamada',
      artwork: opts.artwork
        ? [{ src: opts.artwork, sizes: '96x96', type: 'image/png' }]
        : [],
    })
    navigator.mediaSession.playbackState = 'playing'
    navigator.mediaSession.setActionHandler('pause', () => opts.onMuteToggle?.())
    navigator.mediaSession.setActionHandler('play', () => opts.onMuteToggle?.())
    navigator.mediaSession.setActionHandler('stop', () => opts.onHangup?.())
    // Chrome media hub / some OS shells expose "next/previous" — map hangup.
    try {
      navigator.mediaSession.setActionHandler('previoustrack', null)
      navigator.mediaSession.setActionHandler('nexttrack', () => opts.onHangup?.())
    } catch {
      /* optional */
    }
  } catch {
    /* Media Session not fully available */
  }
}

export function clearCallMediaSession() {
  if (!supportsMediaSession()) return
  try {
    navigator.mediaSession.metadata = null
    navigator.mediaSession.playbackState = 'none'
    for (const action of [
      'play',
      'pause',
      'stop',
      'previoustrack',
      'nexttrack',
    ] as MediaSessionAction[]) {
      try {
        navigator.mediaSession.setActionHandler(action, null)
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/** Keep a silent looping AudioContext oscillator so Chrome treats the tab as "playing media". */
export function createMediaKeepalive(): { stop: () => void } {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return { stop: () => {} }
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    gain.gain.value = 0.0001 // near-silent — enough for media session
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    void ctx.resume()
    return {
      stop: () => {
        try {
          osc.stop()
          void ctx.close()
        } catch {
          /* ignore */
        }
      },
    }
  } catch {
    return { stop: () => {} }
  }
}

function mediaErrName(err: unknown): string {
  if (err && typeof err === 'object' && 'name' in err) {
    return String((err as { name?: string }).name || '')
  }
  return ''
}

/** User dismissed the picker / denied permission — don't retry. */
export function isMediaUserCancel(err: unknown): boolean {
  const n = mediaErrName(err)
  return n === 'NotAllowedError' || n === 'AbortError'
}

/** Human-readable media / call start errors. */
export function mediaCallErrorMessage(err: unknown, kind: CallKind): string {
  const n = mediaErrName(err)
  if (n === 'NotAllowedError' || n === 'AbortError') {
    if (kind === 'screen') return 'Compartir pantalla cancelado o bloqueado'
    if (kind === 'video') return 'Permiso de cámara/micrófono denegado'
    return 'Permiso de micrófono denegado'
  }
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError') {
    if (kind === 'video') return 'No se encontró cámara o micrófono'
    return 'No se encontró micrófono'
  }
  if (n === 'NotReadableError' || n === 'TrackStartError') {
    return 'El dispositivo está en uso por otra aplicación'
  }
  if (n === 'NotSupportedError') {
    return kind === 'screen'
      ? 'Compartir pantalla no está soportado en este navegador'
      : 'Captura multimedia no soportada'
  }
  const apiMsg = (err as { response?: { data?: { message?: string } } })?.response?.data
    ?.message
  if (apiMsg) return apiMsg
  if (err instanceof Error && err.message) return err.message
  return 'No se pudo iniciar la llamada'
}

/**
 * Acquire local media for a call.
 * Must run in the same user-gesture turn as the click (before any long await),
 * or getDisplayMedia / camera prompts will fail with NotAllowedError.
 */
export async function getCallStream(kind: CallKind): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Este navegador no soporta llamadas multimedia')
  }

  if (kind === 'screen') {
    if (!navigator.mediaDevices.getDisplayMedia) {
      throw new Error('Compartir pantalla no está disponible en este navegador')
    }
    // Cap resolution/FPS for weak links (Zoom/Meet-style defaults).
    const screenVideo: MediaTrackConstraints = {
      frameRate: { max: 12, ideal: 10 },
      width: { max: 1280, ideal: 1280 },
      height: { max: 720, ideal: 720 },
    }
    let display: MediaStream
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: screenVideo,
        audio: true,
      })
    } catch (err) {
      if (isMediaUserCancel(err)) throw err
      display = await navigator.mediaDevices.getDisplayMedia({
        video: screenVideo,
        audio: false,
      })
    }
    for (const t of display.getVideoTracks()) {
      try {
        t.contentHint = 'detail'
      } catch {
        /* ignore */
      }
    }
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
      mic.getAudioTracks().forEach((t) => {
        if (!display.getAudioTracks().some((x) => x.id === t.id)) {
          display.addTrack(t)
        }
      })
    } catch {
      /* screen-only ok */
    }
    return display
  }

  if (kind === 'video') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: 'user',
          width: { ideal: 640, max: 960 },
          height: { ideal: 360, max: 540 },
          frameRate: { ideal: 24, max: 30 },
        },
      })
      for (const t of stream.getVideoTracks()) {
        try {
          t.contentHint = 'motion'
        } catch {
          /* ignore */
        }
      }
      return stream
    } catch (err) {
      if (isMediaUserCancel(err)) throw err
      return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    }
  }

  return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
}

/** Cap outgoing video bitrate/FPS after the PC is up (bad networks). */
export async function tuneOutgoingVideo(
  pc: RTCPeerConnection,
  kind: CallKind,
  opts?: { degraded?: boolean },
): Promise<void> {
  const degraded = !!opts?.degraded
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== 'video') continue
    try {
      const params = sender.getParameters()
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}]
      }
      const enc = params.encodings[0]
      if (kind === 'screen') {
        enc.maxBitrate = degraded ? 350_000 : 900_000
        enc.maxFramerate = degraded ? 5 : 10
        enc.priority = 'medium'
        ;(enc as RTCRtpEncodingParameters & { degradationPreference?: string }).degradationPreference =
          'maintain-resolution'
      } else {
        enc.maxBitrate = degraded ? 250_000 : 650_000
        enc.maxFramerate = degraded ? 12 : 24
        enc.priority = 'high'
        ;(enc as RTCRtpEncodingParameters & { degradationPreference?: string }).degradationPreference =
          'maintain-framerate'
      }
      await sender.setParameters(params)
    } catch {
      /* setParameters unsupported / mid-renegotiation */
    }
  }
}

export type AbyPiPPhase = 'idle' | 'listening' | 'thinking' | 'speaking'

export type AbyPiPModel = {
  phase: AbyPiPPhase
  label: string
  hint: string
  /** Full spoken / heard text for the PiP body. */
  utterance?: string
  /** Recent thought trail chips. */
  thoughts?: string[]
  /** User muted their mic while live stays on. */
  micMuted?: boolean
  /** Pending proposal — show Aceptar/Rechazar in the PiP. */
  proposal?: { id: string; ids?: string[]; title: string; deciding?: boolean } | null
}

const ABY_PIP_PHASE: Record<
  AbyPiPPhase,
  { avatar: string; glow: string; bar: string; ring: string; badge: string; aura: string }
> = {
  listening: {
    avatar: 'linear-gradient(145deg,#34d399,#059669 55%,#0f766e)',
    glow: '#34d399',
    bar: 'linear-gradient(to top,#059669,#a7f3d0)',
    ring: 'rgba(16,185,129,0.55)',
    badge: 'rgba(6,78,59,0.92)',
    aura: 'listening',
  },
  thinking: {
    avatar: 'linear-gradient(145deg,#a78bfa,#7c3aed 55%,#4c1d95)',
    glow: '#c4b5fd',
    bar: 'linear-gradient(to top,#7c3aed,#e9d5ff)',
    ring: 'rgba(168,85,247,0.5)',
    badge: 'rgba(76,29,149,0.92)',
    aura: 'thinking',
  },
  speaking: {
    avatar: 'linear-gradient(145deg,#38bdf8,#0ea5e9 45%,#22c55e)',
    glow: '#7dd3fc',
    bar: 'linear-gradient(to top,#0284c7,#86efac)',
    ring: 'rgba(14,165,233,0.5)',
    badge: 'rgba(12,74,110,0.92)',
    aura: 'speaking',
  },
  idle: {
    avatar: 'linear-gradient(145deg,#4ade80,#16a34a 55%,#0f766e)',
    glow: '#86efac',
    bar: 'linear-gradient(to top,#16a34a,#bbf7d0)',
    ring: 'rgba(34,197,94,0.45)',
    badge: 'rgba(20,83,45,0.92)',
    aura: 'idle',
  },
}

function abyBotSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`
}

function abyPhaseMiniSvg(phase: AbyPiPPhase): string {
  const c =
    'xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"'
  if (phase === 'listening') {
    return `<svg ${c}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>`
  }
  if (phase === 'speaking') {
    return `<svg ${c}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`
  }
  if (phase === 'thinking') {
    return `<svg ${c}><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg>`
  }
  return `<svg ${c}><circle cx="12" cy="12" r="3"/></svg>`
}

/**
 * Document Picture-in-Picture for Aby live — Jarvis-like HUD with Ops greens,
 * spoken text, thought trail, and a shifting gradient (not clipped by chrome).
 */
export async function openAbyDocumentPiP(
  model: AbyPiPModel,
  opts?: { width?: number; height?: number },
): Promise<Window | null> {
  const dpi = (
    window as unknown as {
      documentPictureInPicture?: {
        requestWindow: (o?: { width?: number; height?: number }) => Promise<Window>
      }
    }
  ).documentPictureInPicture
  if (!dpi?.requestWindow) return null

  const pip = await dpi.requestWindow({
    width: opts?.width ?? 420,
    height: opts?.height ?? 320,
  })

  const style = pip.document.createElement('style')
  style.textContent = `
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      overflow: hidden; background: #0a0f0c; color: #ecfdf5;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      user-select: none;
    }
    * { box-sizing: border-box; }
    #root {
      position: relative;
      display: flex; flex-direction: column; gap: 8px;
      width: 100%; height: 100%;
      padding: 12px 14px 10px;
      overflow: hidden;
      border: 1px solid rgba(52,211,153,0.22);
      background: #0b1210;
      cursor: pointer;
    }
    #aura {
      position: absolute; inset: 0; z-index: 0; pointer-events: none;
      background:
        radial-gradient(ellipse 90% 70% at 15% 20%, rgba(16,185,129,0.35), transparent 55%),
        radial-gradient(ellipse 80% 60% at 90% 80%, rgba(14,165,233,0.22), transparent 50%),
        radial-gradient(ellipse 70% 50% at 70% 10%, rgba(168,85,247,0.12), transparent 45%),
        linear-gradient(145deg, #0b1411 0%, #0a1620 45%, #0d1a14 100%);
      background-size: 140% 140%, 140% 140%, 140% 140%, 100% 100%;
      animation: auraShift 10s ease-in-out infinite alternate;
      opacity: 1;
      transition: filter 0.6s ease;
    }
    #root[data-aura="listening"] #aura { filter: hue-rotate(0deg) saturate(1.15); }
    #root[data-aura="speaking"] #aura { filter: hue-rotate(-18deg) saturate(1.2); }
    #root[data-aura="thinking"] #aura { filter: hue-rotate(55deg) saturate(1.1); }
    #root[data-aura="idle"] #aura { filter: hue-rotate(-8deg) saturate(1); }
    @keyframes auraShift {
      0% { background-position: 0% 20%, 100% 80%, 60% 0%, 0 0; }
      100% { background-position: 30% 60%, 60% 20%, 20% 40%, 0 0; }
    }
    #scan {
      position: absolute; left: 0; right: 0; height: 28%;
      background: linear-gradient(to bottom, transparent, rgba(52,211,153,0.07), transparent);
      animation: scan 4.5s linear infinite; pointer-events: none; z-index: 1;
    }
    @keyframes scan {
      0% { top: -20%; }
      100% { top: 100%; }
    }
    #content {
      position: relative; z-index: 2;
      display: flex; flex-direction: column; gap: 8px;
      height: 100%; min-height: 0;
    }
    #top {
      display: flex; align-items: flex-start; gap: 11px; flex: 0 0 auto;
    }
    #avatar-wrap { position: relative; flex: 0 0 auto; }
    #glow {
      position: absolute; inset: -5px; border-radius: 999px;
      opacity: 0.55; filter: blur(9px); animation: pulse 1.5s ease-in-out infinite;
    }
    #avatar {
      position: relative; width: 48px; height: 48px; border-radius: 999px;
      display: flex; align-items: center; justify-content: center;
      color: #fff; box-shadow: 0 0 0 1px rgba(255,255,255,0.14), 0 0 18px rgba(16,185,129,0.25);
    }
    #meta { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    #brand-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
    #title {
      font-size: 14px; font-weight: 750; letter-spacing: 0.04em;
      text-transform: uppercase; color: #ecfdf5;
    }
    #phase {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 10px; font-weight: 650; padding: 2px 8px; border-radius: 999px;
      color: #fff; letter-spacing: 0.02em;
      border: 1px solid rgba(255,255,255,0.12);
    }
    #phase svg { opacity: 0.95; }
    #body {
      flex: 1 1 auto; min-height: 0;
      font-size: 13px; line-height: 1.45; color: #f0fdf4; font-weight: 500;
      overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain;
      word-break: break-word; white-space: pre-wrap;
      text-shadow: 0 1px 8px rgba(0,0,0,0.35);
      padding-right: 2px;
      scrollbar-width: thin;
      scrollbar-color: rgba(52,211,153,0.35) transparent;
    }
    #body::-webkit-scrollbar { width: 4px; }
    #body::-webkit-scrollbar-thumb {
      background: rgba(52,211,153,0.35); border-radius: 999px;
    }
    #thoughts {
      display: flex; flex-wrap: wrap; gap: 4px; min-height: 0;
      max-height: 2.4em; overflow: hidden;
    }
    #thoughts:empty { display: none; }
    .chip {
      font-size: 9.5px; line-height: 1.2; padding: 2px 7px; border-radius: 999px;
      color: #a7f3d0; background: rgba(6,78,59,0.45);
      border: 1px solid rgba(52,211,153,0.25);
      max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #proposal {
      display: none; flex-direction: column; gap: 8px;
      flex: 0 0 auto; padding: 8px 10px;
      border-radius: 12px;
      background: rgba(6, 24, 18, 0.72);
      border: 1px solid rgba(52,211,153,0.28);
      pointer-events: auto;
    }
    #proposal[data-show="1"] { display: flex; }
    #proposal-title {
      font-size: 12px; font-weight: 650; color: #ecfdf5;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #proposal-actions { display: flex; gap: 8px; }
    #proposal-actions button {
      flex: 1 1 0; height: 34px; border-radius: 10px; cursor: pointer;
      font-size: 12px; font-weight: 700; letter-spacing: 0.01em;
      border: 1px solid transparent; color: #ecfdf5;
    }
    #proposal-actions button:disabled { opacity: 0.55; cursor: wait; }
    #approve {
      background: linear-gradient(180deg, #34d399, #059669);
      border-color: rgba(167,243,208,0.35);
    }
    #reject {
      background: rgba(15, 23, 20, 0.85);
      border-color: rgba(148,163,184,0.35);
      color: #e2e8f0;
    }
    #bottom {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      flex: 0 0 auto; padding-top: 2px;
    }
    #bars {
      display: flex; align-items: flex-end; gap: 2.5px; height: 18px; flex: 1 1 auto;
      max-width: 36%;
    }
    #bars span {
      flex: 1 1 0; max-width: 3px; border-radius: 999px; min-height: 16%;
      transition: height 75ms linear; opacity: 0.95;
    }
    #actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
    #mute {
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 999px; cursor: pointer;
      border: 1px solid rgba(52,211,153,0.35); background: rgba(6,78,59,0.55);
      color: #ecfdf5; pointer-events: auto;
    }
    #mute[data-muted="1"] {
      border-color: rgba(248,113,113,0.55); background: rgba(127,29,29,0.7); color: #fecaca;
    }
    #cta { font-size: 9.5px; color: rgba(167,243,208,0.45); letter-spacing: 0.03em; }
    #cta[data-hide="1"] { display: none; }
    @keyframes pulse {
      0%, 100% { opacity: 0.35; transform: scale(0.96); }
      50% { opacity: 0.8; transform: scale(1.08); }
    }
  `
  pip.document.head.appendChild(style)

  const root = pip.document.createElement('div')
  root.id = 'root'
  root.dataset.abyAction = 'restore'
  root.innerHTML = `
    <div id="aura"></div>
    <div id="scan"></div>
    <div id="content">
      <div id="top">
        <div id="avatar-wrap">
          <div id="glow"></div>
          <div id="avatar"></div>
        </div>
        <div id="meta">
          <div id="brand-row">
            <span id="title">Aby</span>
            <span id="phase"></span>
          </div>
        </div>
      </div>
      <div id="body"></div>
      <div id="thoughts"></div>
      <div id="proposal">
        <div id="proposal-title"></div>
        <div id="proposal-actions">
          <button type="button" id="approve" data-aby-action="approve">Aceptar</button>
          <button type="button" id="reject" data-aby-action="reject">Rechazar</button>
        </div>
      </div>
      <div id="bottom">
        <div id="bars" aria-hidden="true"></div>
        <div id="actions">
          <button type="button" id="mute" data-aby-action="mute" title="Micrófono" aria-label="Micrófono">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
          </button>
          <div id="cta">Volver</div>
        </div>
      </div>
    </div>
  `
  const bars = root.querySelector('#bars')!
  for (let i = 0; i < 16; i++) {
    bars.appendChild(pip.document.createElement('span'))
  }
  pip.document.body.appendChild(root)

  let t = 0
  let raf = 0
  const tick = () => {
    try {
      if (pip.closed) return
      const phase = (root.dataset.phase || 'idle') as AbyPiPPhase
      const amp =
        phase === 'speaking' ? 0.9 : phase === 'listening' ? 0.88 : phase === 'thinking' ? 0.42 : 0.26
      t += phase === 'listening' || phase === 'speaking' ? 0.15 : 0.07
      bars.querySelectorAll('span').forEach((el, i) => {
        const wave =
          0.26 + Math.sin(t + i * 0.5) * 0.36 + Math.sin(t * 1.65 + i * 0.9) * 0.14
        ;(el as HTMLElement).style.height =
          `${Math.round(Math.min(1, Math.max(0.1, wave * amp)) * 100)}%`
      })
      raf = pip.requestAnimationFrame(tick)
    } catch {
      /* pip closed */
    }
  }
  raf = pip.requestAnimationFrame(tick)
  pip.addEventListener('pagehide', () => {
    try {
      pip.cancelAnimationFrame(raf)
    } catch {
      /* ignore */
    }
  })

  syncAbyDocumentPiP(pip, model)
  return pip
}

export function syncAbyDocumentPiP(pip: Window, model: AbyPiPModel): void {
  try {
    if (pip.closed) return
    const doc = pip.document
    const root = doc.getElementById('root')
    const body = doc.getElementById('body')
    const phaseEl = doc.getElementById('phase')
    const thoughtsEl = doc.getElementById('thoughts')
    const glow = doc.getElementById('glow')
    const avatar = doc.getElementById('avatar')
    const bars = doc.getElementById('bars')
    const mute = doc.getElementById('mute')
    const proposalEl = doc.getElementById('proposal')
    const proposalTitle = doc.getElementById('proposal-title')
    const approveBtn = doc.getElementById('approve') as HTMLButtonElement | null
    const rejectBtn = doc.getElementById('reject') as HTMLButtonElement | null
    const cta = doc.getElementById('cta')
    if (!root || !body || !phaseEl || !thoughtsEl || !glow || !avatar || !bars) return

    const theme = ABY_PIP_PHASE[model.phase] || ABY_PIP_PHASE.idle
    const label = model.label?.trim() || abyPiPLabel(model.phase)
    const utterance = (model.utterance || '').trim()
    const hint = (model.hint || '').trim()
    const muted = !!model.micMuted
    const proposal = model.proposal?.id ? model.proposal : null

    root.dataset.phase = model.phase
    root.dataset.aura = theme.aura
    root.dataset.micMuted = muted ? '1' : '0'
    root.style.borderColor = muted ? 'rgba(248,113,113,0.45)' : theme.ring

    phaseEl.innerHTML = `${abyPhaseMiniSvg(model.phase)}<span>${label}</span>`
    phaseEl.style.background = theme.badge

    let main = utterance
    if (!main) {
      if (proposal) {
        main = muted ? 'Mic apagado' : hint || label
      } else if (muted) {
        main = 'Mic apagado'
      } else if (model.phase === 'speaking') {
        main = hint && !/^cuando termine/i.test(hint) ? hint : 'Aby hablando…'
      } else if (model.phase === 'listening') {
        main = hint || 'Te escucho'
      } else if (model.phase === 'thinking') {
        main = hint || 'Pensando…'
      } else {
        main = hint || 'Live'
      }
    }
    body.textContent = main

    const thoughts = (model.thoughts || [])
      .map((s) => s.replace(/^[a-z0-9_-]+\|/i, '').trim())
      .filter(Boolean)
      .slice(-2)
    thoughtsEl.innerHTML = thoughts
      .map((s) => `<span class="chip">${escapeAbyPiP(s)}</span>`)
      .join('')

    if (proposalEl && proposalTitle && approveBtn && rejectBtn) {
      if (proposal) {
        proposalEl.dataset.show = '1'
        proposalTitle.textContent = proposal.title
        const busy = !!proposal.deciding
        approveBtn.disabled = busy
        rejectBtn.disabled = busy
        const n = proposal.ids?.length || 1
        approveBtn.textContent = busy ? '…' : n > 1 ? `Aceptar (${n})` : 'Aceptar'
        rejectBtn.textContent = busy ? '…' : 'Rechazar'
      } else {
        proposalEl.dataset.show = '0'
      }
    }
    if (cta) cta.dataset.hide = proposal ? '1' : '0'

    glow.style.background = theme.glow
    avatar.style.background = theme.avatar
    avatar.innerHTML = abyBotSvg()
    bars.querySelectorAll('span').forEach((el) => {
      ;(el as HTMLElement).style.background = theme.bar
      if (muted) (el as HTMLElement).style.opacity = '0.2'
      else (el as HTMLElement).style.opacity = '0.95'
    })
    if (mute) {
      mute.dataset.muted = muted ? '1' : '0'
      mute.title = muted ? 'Encender micrófono' : 'Apagar micrófono'
      mute.innerHTML = muted
        ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 0"/><path d="M12 2a3 3 0 0 0-3 3v7c0 .192.168.2.5.71"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`
        : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`
    }
  } catch {
    /* pip tearing down */
  }
}

function escapeAbyPiP(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function abyPiPLabel(phase: AbyPiPPhase): string {
  if (phase === 'speaking') return 'Hablando'
  if (phase === 'thinking') return 'Pensando'
  if (phase === 'listening') return 'Te escucho'
  return 'Live'
}

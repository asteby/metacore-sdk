import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Mic,
  MicOff,
  PhoneOff,
  PictureInPicture2,
  Video,
  VideoOff,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { cn } from '@asteby/metacore-ui'
import {
  type CallKind,
  bindCallDocumentPiPMedia,
  openCallDocumentPiP,
  supportsDocumentPiP,
  syncCallDocumentPiP,
} from '../../lib/chrome-media'

/**
 * Call shell: WhatsApp-style voice card (centered), Discord-ish video tiles.
 * Minimize → Document PiP (dedicated dark HTML) or in-app chip fallback.
 */
export function CallOverlay({
  title,
  subtitle,
  kind,
  localStream,
  remotes,
  muted,
  camOff,
  linkHint,
  onToggleMute,
  onToggleCam,
  onHangup,
}: {
  title: string
  subtitle?: string
  kind: CallKind
  localStream: MediaStream | null
  remotes: Record<string, { stream: MediaStream; name?: string; rev?: number; muted?: boolean }>
  muted: boolean
  camOff: boolean
  linkHint?: string | null
  onToggleMute: () => void
  onToggleCam: () => void
  onHangup: () => void
}) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLDivElement>(null)
  const remoteVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({})
  const remoteAudioRefs = useRef<Record<string, HTMLAudioElement | null>>({})
  const pipWinRef = useRef<Window | null>(null)
  const endingRef = useRef(false)
  const [pipOpen, setPipOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [chipPos, setChipPos] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    origX: number
    origY: number
    target: 'shell' | 'chip'
  } | null>(null)
  const remotesSig = Object.entries(remotes)
    .map(
      ([id, r]) =>
        `${id}:${r.rev || 0}:${r.stream
          .getTracks()
          .map((t) => `${t.id}:${t.kind}:${t.readyState}:${t.enabled}:${t.muted}`)
          .join(',')}`,
    )
    .join('|')

  const chipVisible = minimized && !pipOpen
  const shellHidden = minimized || pipOpen

  const bindRemoteMedia = useCallback(() => {
    for (const [id, remote] of Object.entries(remotes)) {
      const v = remoteVideoRefs.current[id]
      if (v) {
        const hasVideo = remote.stream.getVideoTracks().some((t) => t.readyState !== 'ended')
        if (hasVideo || v.srcObject !== remote.stream) {
          v.srcObject = remote.stream
          v.muted = true
          void v.play().catch(() => {})
        }
      }
      const a = remoteAudioRefs.current[id]
      if (a) {
        if (a.srcObject !== remote.stream) a.srcObject = remote.stream
        a.muted = false
        a.volume = 1
        void a.play().catch(() => {})
      }
    }
  }, [remotes])

  const closePip = useCallback(() => {
    try {
      pipWinRef.current?.close()
    } catch {
      /* ignore */
    }
    pipWinRef.current = null
    setPipOpen(false)
  }, [])

  const restoreFromPip = useCallback(() => {
    closePip()
    setMinimized(false)
    try {
      window.focus()
    } catch {
      /* ignore */
    }
  }, [closePip])

  const expand = useCallback(() => {
    closePip()
    setMinimized(false)
  }, [closePip])

  const hangup = useCallback(() => {
    endingRef.current = true
    closePip()
    setMinimized(false)
    onHangup()
    endingRef.current = false
  }, [closePip, onHangup])

  useEffect(() => {
    return () => {
      endingRef.current = true
      closePip()
    }
  }, [closePip])

  const remoteList = Object.entries(remotes)
  const isGroup = remoteList.length >= 2

  useEffect(() => {
    const el = localVideoRef.current
    if (!el) return
    el.srcObject = localStream
    void el.play().catch(() => {})
  }, [localStream, isGroup, chipVisible])

  useEffect(() => {
    bindRemoteMedia()
  }, [remotes, remotesSig, bindRemoteMedia])

  const openPip = useCallback(async () => {
    if (!supportsDocumentPiP()) {
      closePip()
      setMinimized(true)
      return
    }
    try {
      closePip()
      setMinimized(false)
      const name =
        Object.values(remotes)[0]?.name ||
        title
      const pip = await openCallDocumentPiP(
        {
          title: kind === 'audio' ? 'Llamada de voz' : kind === 'screen' ? 'Pantalla' : 'Videollamada',
          name,
          status: 'Conectando…',
          kind,
          muted,
          showCam: kind === 'video',
          camOff,
          letter: name,
        },
        {
          width: kind === 'audio' ? 320 : Object.keys(remotes).length >= 2 ? 400 : 360,
          height: kind === 'audio' ? 300 : kind === 'screen' ? 340 : 320,
        },
      )
      if (!pip) {
        setMinimized(true)
        return
      }
      pipWinRef.current = pip
      setPipOpen(true)
      bindCallDocumentPiPMedia(pip, {
        kind,
        localStream,
        remotes: Object.values(remotes),
      })
      const onPipClick = (e: Event) => {
        const t = (e.target as HTMLElement | null)?.closest?.('[data-call-action]') as
          | HTMLElement
          | null
        if (!t) return
        const action = t.dataset.callAction
        if (action === 'hangup') hangup()
        if (action === 'mute') onToggleMute()
        if (action === 'cam') onToggleCam()
        if (action === 'restore') restoreFromPip()
      }
      pip.document.addEventListener('click', onPipClick)
      pip.addEventListener('pagehide', () => {
        pip.document.removeEventListener('click', onPipClick)
        pipWinRef.current = null
        setPipOpen(false)
        if (!endingRef.current) {
          setMinimized(true)
          try {
            window.focus()
          } catch {
            /* ignore */
          }
        }
      })
    } catch (err) {
      console.error(err)
      setMinimized(true)
    }
  }, [
    closePip,
    hangup,
    localStream,
    remotes,
    onToggleMute,
    onToggleCam,
    restoreFromPip,
    kind,
    title,
    muted,
    camOff,
  ])

  const minimizeCall = useCallback(() => {
    if (supportsDocumentPiP()) void openPip()
    else {
      closePip()
      setMinimized(true)
    }
  }, [openPip, closePip])

  const chipDragMovedRef = useRef(false)

  const onDragPointerDown = useCallback(
    (e: ReactPointerEvent, target: 'shell' | 'chip') => {
      const hit = e.target as HTMLElement
      // Mute / hangup / cam stay clickable; expand + body can start a drag.
      if (hit.closest('[data-no-drag], input, video, a')) return
      if (target === 'shell' && hit.closest('button')) return
      const el = target === 'chip' ? chipRef.current : shellRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cur =
        target === 'chip'
          ? (chipPos ?? { x: rect.left, y: rect.top })
          : (pos ?? { x: rect.left, y: rect.top })
      chipDragMovedRef.current = false
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: cur.x,
        origY: cur.y,
        target,
      }
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    },
    [pos, chipPos],
  )

  const onDragPointerMove = useCallback((e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!chipDragMovedRef.current && Math.hypot(dx, dy) < 6) return
    chipDragMovedRef.current = true
    e.preventDefault()
    const el = d.target === 'chip' ? chipRef.current : shellRef.current
    const w = el?.offsetWidth ?? (d.target === 'chip' ? 280 : 420)
    const h = el?.offsetHeight ?? (d.target === 'chip' ? 48 : 320)
    const nx = Math.max(8, Math.min(window.innerWidth - w - 8, d.origX + dx))
    const ny = Math.max(8, Math.min(window.innerHeight - h - 8, d.origY + dy))
    if (d.target === 'chip') setChipPos({ x: nx, y: ny })
    else setPos({ x: nx, y: ny })
  }, [])

  const onDragPointerUp = useCallback((e: ReactPointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
  }, [])

  const participantCount = remoteList.length + 1
  const localHasLiveVideo = !!localStream
    ?.getVideoTracks()
    .some((t) => t.readyState === 'live' && t.enabled)
  const showLocalVideo =
    kind === 'screen' ? localHasLiveVideo : kind !== 'audio' && !camOff
  const isAudio = kind === 'audio'

  const remoteMuted =
    remoteList.length > 0 && remoteList.every(([, r]) => !!r.muted)
  const anyRemoteMuted = remoteList.some(([, r]) => !!r.muted)

  // Prefer live signaling/ICE / mute hints over a misleading “En llamada”.
  const hasLiveRemoteMedia = remoteList.some(([, r]) =>
    r.stream.getTracks().some((t) => t.readyState === 'live'),
  )
  const statusText = (() => {
    // Still dialing / connecting — never “Sin audio…” (that only confused people).
    if (!hasLiveRemoteMedia) {
      if (linkHint?.includes('Servidor') || subtitle === 'Servidor reconectando…') {
        return 'Servidor reconectando…'
      }
      if (remoteList.length === 0) {
        if (
          subtitle === 'Conectando…' ||
          subtitle === 'Reconectando…' ||
          subtitle === 'Esperando a que se una…'
        ) {
          return subtitle
        }
        return 'Llamando…'
      }
      if (subtitle === 'Reconectando…' || subtitle?.includes('reintentando')) return subtitle
      return subtitle?.startsWith('Conectando') ? subtitle : 'Conectando…'
    }
    if (linkHint) return linkHint
    if (subtitle === 'Servidor reconectando…') return subtitle
    if (muted && remoteMuted) return 'Ambos silenciados'
    if (remoteMuted) return 'El otro está silenciado'
    if (anyRemoteMuted && remoteList.length > 1) return 'Alguien está silenciado'
    if (muted) return 'Tú silenciado · en llamada'
    if (remoteList.length > 1) return `En llamada · ${participantCount}`
    return 'En llamada'
  })()

  // Keep dedicated Document PiP in sync (status / mute / streams).
  useEffect(() => {
    const pip = pipWinRef.current
    if (!pip || pip.closed || !pipOpen) return
    const name = remoteList[0]?.[1]?.name || title
    syncCallDocumentPiP(pip, {
      name,
      status: statusText,
      muted,
      camOff,
    })
    bindCallDocumentPiPMedia(pip, {
      kind,
      localStream,
      remotes: remoteList.map(([, r]) => r),
    })
  }, [
    pipOpen,
    remotesSig,
    muted,
    camOff,
    localStream,
    kind,
    title,
    statusText,
    remoteList,
  ])

  const displayName =
    remoteList.length === 1
      ? remoteList[0][1].name || title
      : remoteList.length > 1
        ? `${remoteList.length} participantes`
        : title

  const shellWidth = isAudio
    ? 'max-w-[min(92vw,20rem)]'
    : remoteList.length === 0
      ? 'max-w-[320px]'
      : isGroup
        ? 'max-w-[min(92vw,56rem)]'
        : 'max-w-[min(92vw,28rem)]'

  const gridCols =
    remoteList.length <= 1
      ? 'grid-cols-1'
      : remoteList.length <= 4
        ? 'grid-cols-2'
        : 'grid-cols-2 sm:grid-cols-3'

  const dockBtn =
    'inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-zinc-100 transition-colors hover:bg-white/20 disabled:opacity-40'

  // WhatsApp-style: floating card truly centered in the viewport
  // (above AI FAB z-100 — not glued low near composer / notes).
  const shellDefaultPos = isAudio
    ? 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
    : 'fixed left-1/2 top-24 -translate-x-1/2'
  const chipDefaultPos = 'left-3 right-auto top-20 sm:left-auto sm:right-4'

  return (
    <div className='pointer-events-none fixed inset-0 z-[140]'>
      {remoteList.map(([id]) => (
        <audio
          key={`a-${id}`}
          ref={(el) => {
            remoteAudioRefs.current[id] = el
            if (el && remotes[id]) {
              el.srcObject = remotes[id].stream
              el.muted = false
              el.volume = 1
              const play = () => void el.play().catch(() => {})
              play()
              remotes[id].stream.getAudioTracks().forEach((t) => {
                t.addEventListener('unmute', play)
              })
            }
          }}
          autoPlay
          playsInline
          className='hidden'
        />
      ))}

      {isAudio && !shellHidden && (
        <div className='pointer-events-none absolute inset-0 bg-black/45' aria-hidden />
      )}

      {chipVisible && (
        <div
          ref={chipRef}
          data-call-chip='1'
          className={cn(
          'pointer-events-auto absolute flex cursor-grab touch-none items-center gap-2 rounded-full border border-white/10 bg-zinc-950/95 px-2 py-1.5 shadow-2xl backdrop-blur active:cursor-grabbing',
          !chipPos && chipDefaultPos,
        )}
        style={chipPos ? { left: chipPos.x, top: chipPos.y } : undefined}
          onPointerDown={(e) => onDragPointerDown(e, 'chip')}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          onPointerCancel={onDragPointerUp}
          title='Arrastrar mini llamada'
        >
          <button
            type='button'
            className='flex min-w-0 cursor-grab items-center gap-2 rounded-full px-2 py-1 text-left hover:bg-white/5 active:cursor-grabbing'
            onClick={() => {
              if (chipDragMovedRef.current) return
              expand()
            }}
            title='Arrastrar o tocar para ampliar'
          >
            <span className='relative flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-zinc-50'>
              {title.slice(0, 1).toUpperCase()}
              <span className='absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-zinc-950' />
            </span>
            <span className='min-w-0'>
              <span className='block truncate text-xs font-semibold text-zinc-50'>{title}</span>
              <span className='block text-[10px] text-primary'>
                {statusText}
              </span>
            </span>
          </button>
          <button
            type='button'
            data-no-drag
            className={cn(dockBtn, 'size-9', muted && 'bg-destructive/25 text-destructive')}
            title={muted ? 'Activar mic' : 'Silenciar'}
            onClick={onToggleMute}
          >
            {muted ? <MicOff className='size-4' /> : <Mic className='size-4' />}
          </button>
          <button
            type='button'
            data-no-drag
            className={cn(dockBtn, 'size-9')}
            title='Ampliar llamada'
            onClick={expand}
          >
            <Maximize2 className='size-4' />
          </button>
          <button
            type='button'
            data-no-drag
            className='inline-flex size-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90'
            title='Colgar'
            onClick={hangup}
          >
            <PhoneOff className='size-4' />
          </button>
        </div>
      )}

      <div
        ref={shellRef}
          className={cn(
            'pointer-events-auto w-[min(100%-1.5rem,100%)] overflow-hidden text-zinc-50 shadow-2xl',
            isAudio
              ? 'rounded-[1.75rem] border border-white/10 bg-zinc-950'
              : 'rounded-2xl border border-white/8 bg-zinc-950',
            shellWidth,
            shellHidden && 'hidden',
            pos ? 'fixed' : shellDefaultPos,
          )}
          style={pos ? { left: pos.x, top: pos.y, transform: 'none' } : undefined}
      >
        <div
          className={cn(
            'flex cursor-grab touch-none items-center gap-2 px-4 py-3 active:cursor-grabbing',
            isAudio ? 'bg-transparent' : 'border-b border-white/10 bg-zinc-900',
          )}
          onPointerDown={(e) => onDragPointerDown(e, 'shell')}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          onPointerCancel={onDragPointerUp}
          title='Arrastrar'
        >
          {!isAudio && <span className='size-2 shrink-0 rounded-full bg-primary' aria-hidden />}
          <span className='min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100'>
            {isAudio ? 'Llamada de voz' : title}
          </span>
          <span className='shrink-0 text-[11px] text-zinc-400'>
            {kind === 'screen' ? 'Pantalla' : kind === 'video' ? 'Video' : ''}
            {!isAudio && remoteList.length > 0 ? ` · ${participantCount}` : ''}
          </span>
        </div>

        <div
          className={cn(
            'relative overflow-hidden',
            isAudio
              ? 'bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 min-h-[280px]'
              : kind === 'screen'
                ? 'bg-zinc-900 min-h-[240px]'
                : 'bg-zinc-900 min-h-[220px]',
          )}
        >
          {isAudio ? (
            <div className='flex min-h-[280px] flex-col items-center justify-center gap-4 px-6 pb-4 pt-2'>
              {remoteList.length === 0 ? (
                <>
                  <div className='flex size-28 items-center justify-center rounded-full bg-zinc-800 text-4xl font-semibold text-zinc-50 ring-4 ring-primary/35'>
                    {title.slice(0, 1).toUpperCase()}
                  </div>
                  <div className='text-center'>
                    <p className='text-lg font-medium text-zinc-50'>{title}</p>
                    <p className='mt-1 text-sm text-primary'>
                      {statusText}
                    </p>
                    {anyRemoteMuted && !linkHint && (
                      <p className='mt-1 inline-flex items-center gap-1 text-xs text-amber-300'>
                        <MicOff className='size-3.5' />
                        {remoteMuted ? 'Micrófono remoto apagado' : 'Hay participantes en silencio'}
                      </p>
                    )}
                  </div>
                </>
              ) : isGroup ? (
                <>
                  <div className='flex -space-x-3'>
                    {remoteList.slice(0, 4).map(([id, remote]) => (
                      <div
                        key={id}
                        className='flex size-16 items-center justify-center rounded-full bg-zinc-800 text-lg font-semibold ring-2 ring-zinc-950'
                        title={remote.name || 'Participante'}
                      >
                        {(remote.name || '?').slice(0, 1).toUpperCase()}
                      </div>
                    ))}
                  </div>
                  <div className='text-center'>
                    <p className='text-lg font-medium text-zinc-50'>{displayName}</p>
                    <p className='mt-1 text-sm text-primary'>{statusText}</p>
                    {anyRemoteMuted && !linkHint && (
                      <p className='mt-1 inline-flex items-center gap-1 text-xs text-amber-300'>
                        <MicOff className='size-3.5' />
                        {remoteMuted ? 'Micrófono remoto apagado' : 'Hay participantes en silencio'}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className='flex size-28 items-center justify-center rounded-full bg-zinc-800 text-4xl font-semibold text-zinc-50 ring-4 ring-primary/35'>
                    {displayName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className='text-center'>
                    <p className='text-lg font-medium text-zinc-50'>{displayName}</p>
                    <p className='mt-1 text-sm text-primary'>{statusText}</p>
                    {anyRemoteMuted && !linkHint && (
                      <p className='mt-1 inline-flex items-center gap-1 text-xs text-amber-300'>
                        <MicOff className='size-3.5' />
                        Micrófono remoto apagado
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : remoteList.length === 0 ? (
            <div className='flex aspect-video flex-col items-center justify-center gap-3 px-4 py-8'>
              <div className='flex size-16 items-center justify-center rounded-full bg-zinc-800 text-2xl font-semibold text-zinc-50 ring-2 ring-primary/40'>
                {title.slice(0, 1).toUpperCase()}
              </div>
              <p className='text-sm font-medium'>{title}</p>
              <p className='text-[11px] text-zinc-400'>{statusText}</p>
            </div>
          ) : (
            <div className={cn('grid gap-1 p-1', gridCols, isGroup && 'sm:gap-1.5 sm:p-1.5')}>
              {remoteList.map(([id, remote]) => {
                const hasRemoteVideo = remote.stream
                  .getVideoTracks()
                  .some((t) => t.readyState === 'live' && t.enabled)
                return (
                  <div
                    key={`${id}-${remote.rev || 0}`}
                    className='relative aspect-video overflow-hidden rounded-xl bg-zinc-900'
                  >
                    <video
                      ref={(el) => {
                        remoteVideoRefs.current[id] = el
                        if (el) {
                          el.srcObject = remote.stream
                          el.muted = true
                          void el.play().catch(() => {})
                        }
                      }}
                      data-call-video={`remote-${id}`}
                      autoPlay
                      playsInline
                      muted
                      className={cn(
                        'h-full w-full bg-black',
                        kind === 'screen' ? 'object-contain' : 'object-cover',
                        !hasRemoteVideo && 'hidden',
                      )}
                    />
                    {!hasRemoteVideo && (
                      <div className='flex h-full min-h-[140px] flex-col items-center justify-center gap-2 text-zinc-100'>
                        <div className='flex size-14 items-center justify-center rounded-full bg-zinc-800 text-lg font-semibold'>
                          {(remote.name || title).slice(0, 1).toUpperCase()}
                        </div>
                        <p className='text-xs text-zinc-300'>{remote.name || 'Participante'}</p>
                      </div>
                    )}
                    <span className='absolute bottom-1.5 left-1.5 max-w-[90%] truncate rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-zinc-50'>
                      {remote.name || 'Participante'}
                      {remote.muted ? ' · silenciado' : ''}
                    </span>
                  </div>
                )
              })}
              {isGroup && (
                <div className='relative aspect-video overflow-hidden rounded-xl bg-zinc-900'>
                  <video
                    ref={localVideoRef}
                    data-call-video='local'
                    autoPlay
                    playsInline
                    muted
                    className={cn(
                      'h-full w-full bg-black',
                      kind === 'screen' ? 'object-contain' : 'object-cover',
                      !showLocalVideo && 'hidden',
                    )}
                  />
                  {!showLocalVideo && (
                    <div className='flex h-full min-h-[140px] flex-col items-center justify-center gap-2'>
                      <div className='flex size-14 items-center justify-center rounded-full bg-zinc-800 text-lg font-semibold'>
                        Tú
                      </div>
                    </div>
                  )}
                  <span className='absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-zinc-50'>
                    Tú{muted ? ' · mute' : ''}
                  </span>
                </div>
              )}
            </div>
          )}

          {!isAudio && !isGroup && (
            <div className='absolute bottom-2 right-2 h-[4.5rem] w-16 overflow-hidden rounded-lg border border-white/15 bg-zinc-900 shadow-lg'>
              <video
                ref={localVideoRef}
                data-call-video='local'
                autoPlay
                playsInline
                muted
                className={cn(
                  'h-full w-full bg-black',
                  kind === 'screen' ? 'object-contain' : 'object-cover',
                  !showLocalVideo && 'hidden',
                )}
              />
              {!showLocalVideo && (
                <div className='flex h-full items-center justify-center text-[10px] text-zinc-400'>
                  Tú
                </div>
              )}
            </div>
          )}
        </div>

        <div
          className={cn(
            'relative flex items-center justify-center gap-3 px-4',
            isAudio ? 'bg-transparent pb-5 pt-1' : 'border-t border-white/10 bg-zinc-950 py-2.5',
          )}
        >
          {!isAudio && (
            <div className='absolute left-3 hidden min-w-0 max-w-[30%] sm:block'>
              <p className='truncate text-[11px] text-zinc-400'>{statusText}</p>
            </div>
          )}
          <button
            type='button'
            className={cn(dockBtn, muted && 'bg-destructive text-destructive-foreground hover:bg-destructive/90')}
            data-call-action='mute'
            title={muted ? 'Activar mic' : 'Silenciar'}
            onClick={onToggleMute}
          >
            {muted ? <MicOff className='size-5' /> : <Mic className='size-5' />}
          </button>
          {kind === 'video' && (
            <button
              type='button'
              className={cn(dockBtn, camOff && 'bg-destructive text-destructive-foreground hover:bg-destructive/90')}
              data-call-action='cam'
              title={camOff ? 'Activar cámara' : 'Apagar cámara'}
              onClick={onToggleCam}
            >
              {camOff ? <VideoOff className='size-5' /> : <Video className='size-5' />}
            </button>
          )}
          <button
            type='button'
            className={dockBtn}
            title={supportsDocumentPiP() ? 'Ventana flotante (PiP)' : 'Mini llamada'}
            onClick={minimizeCall}
          >
            {supportsDocumentPiP() ? (
              <PictureInPicture2 className='size-5' />
            ) : (
              <Minimize2 className='size-5' />
            )}
          </button>
          <button
            type='button'
            className={cn(
              'inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90',
              isAudio ? 'size-14' : 'size-11',
            )}
            data-call-action='hangup'
            title='Colgar'
            onClick={hangup}
          >
            <PhoneOff className={isAudio ? 'size-6' : 'size-5'} />
          </button>
        </div>
      </div>
    </div>
  )
}

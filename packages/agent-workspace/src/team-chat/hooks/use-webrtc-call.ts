import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../host'
import { useWebSocketContext, type WSEvent } from '../../host'
import { useWorkspaceUser } from '../../host'
import {
  type CallKind,
  clearCallMediaSession,
  createMediaKeepalive,
  getCallStream,
  tuneOutgoingVideo,
  mediaCallErrorMessage,
  setCallMediaSession,
} from '../../lib/chrome-media'
import { toast } from 'sonner'
import { playCallConnectedSound, startCallRingback } from '../../lib/sound'

const CALL_RESUME_KEY = 'ops_chat_call_resume'
const CALL_HUNGUP_KEY = 'ops_chat_call_hungup'

type CallResumeBlob = {
  callId: string
  channelId: string
  kind: CallKind
  title: string
}

function readCallResume(): CallResumeBlob | null {
  try {
    const raw = sessionStorage.getItem(CALL_RESUME_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as CallResumeBlob
    if (!v?.callId || !v.channelId) return null
    return v
  } catch {
    return null
  }
}

function writeCallResume(v: CallResumeBlob) {
  try {
    sessionStorage.setItem(CALL_RESUME_KEY, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}

function clearCallResume() {
  try {
    sessionStorage.removeItem(CALL_RESUME_KEY)
  } catch {
    /* ignore */
  }
}

function markCallHungUp(callId: string) {
  if (!callId) return
  try {
    const raw = sessionStorage.getItem(CALL_HUNGUP_KEY)
    const arr: string[] = raw ? (JSON.parse(raw) as string[]) : []
    if (!arr.includes(callId)) arr.push(callId)
    sessionStorage.setItem(CALL_HUNGUP_KEY, JSON.stringify(arr.slice(-30)))
    clearCallResume()
  } catch {
    /* ignore */
  }
}

function wasCallHungUp(callId: string): boolean {
  try {
    const raw = sessionStorage.getItem(CALL_HUNGUP_KEY)
    if (!raw) return false
    return (JSON.parse(raw) as string[]).includes(callId)
  } catch {
    return false
  }
}

export type CallSession = {
  callId: string
  channelId: string
  kind: CallKind
  title: string
  subtitle?: string
  isHost: boolean
}

type PeerState = {
  pc: RTCPeerConnection
  stream?: MediaStream
  name?: string
}

type IceServer = RTCIceServer

async function loadIceServers(): Promise<IceServer[]> {
  try {
    const { data } = await api.get('/internal-chat/webrtc/ice')
    if (Array.isArray(data?.iceServers) && data.iceServers.length) {
      return data.iceServers as IceServer[]
    }
  } catch {
    /* fall through */
  }
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
}

function sdpPayload(desc: RTCSessionDescription | null): { type: string; sdp?: string } | null {
  if (!desc) return null
  return { type: desc.type, sdp: desc.sdp }
}

function normalizeSdp(raw: unknown): RTCSessionDescriptionInit | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as { type?: string; sdp?: string }
  if (!o.type || typeof o.type !== 'string') return null
  return { type: o.type as RTCSdpType, sdp: o.sdp }
}

/**
 * Mesh WebRTC call over the ops WS hub (CALL_* frames) + HTTP room APIs.
 */
export function useWebRTCCall() {
  const { sendMessage, subscribe, isConnected } = useWebSocketContext()
  const me = useWorkspaceUser()
  const [session, setSession] = useState<CallSession | null>(null)
  const [incoming, setIncoming] = useState<{
    callId: string
    channelId: string
    kind: CallKind
    fromName: string
    fromUserId: string
    /** ringing = fresh invite (play ringtone); active = rejoin after reload (no ring) */
    status?: 'ringing' | 'active'
  } | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remotes, setRemotes] = useState<
    Record<string, { stream: MediaStream; name?: string; rev?: number; muted?: boolean }>
  >({})
  const [muted, setMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [connecting, setConnecting] = useState(false)
  /** Worst live ICE label for UI — never show “En llamada” when the link is dead. */
  const [linkHint, setLinkHint] = useState<string | null>(null)

  const peersRef = useRef<Map<string, PeerState>>(new Map())
  const localRef = useRef<MediaStream | null>(null)
  const sessionRef = useRef<CallSession | null>(null)
  const iceRef = useRef<IceServer[]>([])
  const keepaliveRef = useRef<{ stop: () => void } | null>(null)
  const makingOfferRef = useRef<Set<string>>(new Set())
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  const pendingSignalsRef = useRef<
    {
      call_id?: string
      from_user_id?: string
      to_user_id?: string
      signal_type?: string
      sdp?: RTCSessionDescriptionInit
      candidate?: RTCIceCandidateInit
      muted?: boolean
    }[]
  >([])
  const peerIceRef = useRef<Map<string, string>>(new Map())
  const peerJoinedRef = useRef(false)
  const mutedRef = useRef(false)
  mutedRef.current = muted

  const refreshLinkHint = useCallback(() => {
    const states = [...peerIceRef.current.values()]
    if (!states.length) {
      setLinkHint(null)
      return
    }
    if (states.some((s) => s === 'failed')) {
      setLinkHint('Sin conexión con el otro — no es tu mic')
      return
    }
    if (states.some((s) => s === 'disconnected')) {
      setLinkHint('Conexión inestable… reintentando')
      return
    }
    if (states.every((s) => s === 'connected' || s === 'completed')) {
      setLinkHint(null)
      return
    }
    if (states.some((s) => s === 'checking' || s === 'new')) {
      setLinkHint('Conectando audio…')
      return
    }
    setLinkHint(null)
  }, [])
  const incomingRef = useRef(incoming)
  incomingRef.current = incoming

  sessionRef.current = session

  const signalViaWs = useCallback(
    (payload: Record<string, unknown>) => {
      const callId = payload.call_id as string
      const typ = String(payload.signal_type || '')
      // WS alone dies on every backend deploy/restart — offers vanish and the
      // UI sticks on “Conectando…”. Always harden SDP/mute/ICE over HTTP too:
      // a “connected” WS that drops frames silently left ICE stuck forever.
      if (isConnected) {
        try {
          sendMessage(
            JSON.stringify({
              type: 'CALL_SIGNAL',
              payload,
            }),
          )
        } catch {
          /* fall through */
        }
      }
      if (
        !isConnected ||
        typ === 'offer' ||
        typ === 'answer' ||
        typ === 'mute' ||
        typ === 'ice'
      ) {
        void api.post(`/internal-chat/calls/${callId}/signal`, payload).catch(() => {})
      }
    },
    [isConnected, sendMessage],
  )

  const flushPendingIce = useCallback(async (userId: string, pc: RTCPeerConnection) => {
    const pending = pendingIceRef.current.get(userId) || []
    pendingIceRef.current.delete(userId)
    for (const c of pending) {
      try {
        await pc.addIceCandidate(c)
      } catch {
        /* ignore */
      }
    }
  }, [])

  const cleanupPeer = useCallback((userId: string) => {
    const p = peersRef.current.get(userId)
    if (!p) return
    try {
      p.pc.close()
    } catch {
      /* ignore */
    }
    peersRef.current.delete(userId)
    pendingIceRef.current.delete(userId)
    makingOfferRef.current.delete(userId)
    peerIceRef.current.delete(userId)
    refreshLinkHint()
    setRemotes((prev) => {
      const next = { ...prev }
      delete next[userId]
      return next
    })
  }, [refreshLinkHint])

  const hangupLocal = useCallback(
    async (notify = true) => {
      const s = sessionRef.current
      // Explicit hangup (or remote END) → never offer “Unirse” to this room again.
      if (s?.callId) markCallHungUp(s.callId)
      for (const id of [...peersRef.current.keys()]) cleanupPeer(id)
      pendingIceRef.current.clear()
      makingOfferRef.current.clear()
      localRef.current?.getTracks().forEach((t) => t.stop())
      localRef.current = null
      setLocalStream(null)
      setRemotes({})
      keepaliveRef.current?.stop()
      keepaliveRef.current = null
      clearCallMediaSession()
      setSession(null)
      sessionRef.current = null
      setIncoming(null)
      pendingSignalsRef.current = []
      peerIceRef.current.clear()
      peerJoinedRef.current = false
      setLinkHint(null)
      setConnecting(false)
      setMuted(false)
      setCamOff(false)
      if (notify && s?.callId) {
        try {
          await api.post(`/internal-chat/calls/${s.callId}/end`)
        } catch {
          /* ignore */
        }
      }
    },
    [cleanupPeer],
  )

  const makeOffer = useCallback(
    async (remoteUserId: string, pc: RTCPeerConnection, opts?: { iceRestart?: boolean }) => {
      const s = sessionRef.current
      if (!s || makingOfferRef.current.has(remoteUserId)) return
      if (pc.signalingState !== 'stable') return
      try {
        makingOfferRef.current.add(remoteUserId)
        const offer = await pc.createOffer(opts?.iceRestart ? { iceRestart: true } : undefined)
        await pc.setLocalDescription(offer)
        signalViaWs({
          call_id: s.callId,
          channel_id: s.channelId,
          to_user_id: remoteUserId,
          signal_type: 'offer',
          sdp: sdpPayload(pc.localDescription),
        })
      } catch (err) {
        console.error('createOffer', err)
      } finally {
        makingOfferRef.current.delete(remoteUserId)
      }
    },
    [signalViaWs],
  )

  const isPolitePeer = useCallback(
    (remoteUserId: string) => (me?.id || '') > remoteUserId,
    [me?.id],
  )

  const ensurePeer = useCallback(
    (remoteUserId: string, opts?: { recreate?: boolean }) => {
      let existing = peersRef.current.get(remoteUserId)
      if (existing) {
        const st = existing.pc.connectionState
        const ice = existing.pc.iceConnectionState
        const dead =
          st === 'failed' ||
          st === 'closed' ||
          ice === 'failed' ||
          ice === 'closed' ||
          existing.pc.signalingState === 'closed'
        if (!opts?.recreate && !dead) return existing.pc
        // Rejoin / failed ICE: drop the stale PC so a fresh offer/answer can land.
        cleanupPeer(remoteUserId)
      }

      const pc = new RTCPeerConnection({
        iceServers: iceRef.current,
        // Don't pre-gather TURN before remote SDP — burns allocations that
        // time out (VPS coturn: peer usage=0) while Contestar is still pending.
        iceCandidatePoolSize: 0,
      })
      const local = localRef.current
      local?.getTracks().forEach((t) => pc.addTrack(t, local))

      // Video/screen: if this side has no outgoing video (e.g. screen callee),
      // still declare a recvonly video transceiver so the remote stream attaches.
      const kind = sessionRef.current?.kind
      const hasLocalVideo = !!local?.getVideoTracks().some((t) => t.readyState !== 'ended')
      if ((kind === 'video' || kind === 'screen') && !hasLocalVideo) {
        try {
          pc.addTransceiver('video', { direction: 'recvonly' })
        } catch {
          /* ignore */
        }
      }
      const hasLocalAudio = !!local?.getAudioTracks().some((t) => t.readyState !== 'ended')
      if (!hasLocalAudio) {
        try {
          pc.addTransceiver('audio', { direction: 'recvonly' })
        } catch {
          /* ignore */
        }
      }

      pc.onicecandidate = (ev) => {
        const s = sessionRef.current
        if (!s || !ev.candidate) return
        signalViaWs({
          call_id: s.callId,
          channel_id: s.channelId,
          to_user_id: remoteUserId,
          signal_type: 'ice',
          candidate: ev.candidate.toJSON(),
        })
      }

      pc.ontrack = (ev) => {
        // Merge into one MediaStream per peer. Always bump `rev` so the overlay
        // rebinds <video> — browsers often keep a black frame when a video track
        // arrives after audio on an already-attached stream.
        const bumpRemote = () => {
          setRemotes((prev) => {
            const prevEntry = prev[remoteUserId]
            const merged = prevEntry?.stream || new MediaStream()
            const incoming = ev.streams[0]
            const toAdd = incoming ? incoming.getTracks() : [ev.track]
            for (const t of toAdd) {
              if (!merged.getTracks().some((x) => x.id === t.id)) {
                merged.addTrack(t)
              }
            }
            if (!merged.getTracks().some((x) => x.id === ev.track.id)) {
              merged.addTrack(ev.track)
            }
            const st = peersRef.current.get(remoteUserId)
            if (st) st.stream = merged
            return {
              ...prev,
              [remoteUserId]: {
                stream: merged,
                name: prevEntry?.name,
                muted: prevEntry?.muted,
                rev: (prevEntry?.rev || 0) + 1,
              },
            }
          })
        }
        bumpRemote()
        // Display capture / camera often fire unmute after first frame — rebind then.
        ev.track.addEventListener('unmute', bumpRemote)
        ev.track.addEventListener('mute', bumpRemote)
        ev.track.addEventListener('ended', bumpRemote)
      }

      let iceFailToastAt = 0
      pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState
        peerIceRef.current.set(remoteUserId, st)
        refreshLinkHint()
        if (st === 'connected' || st === 'completed') {
          setSession((prev) =>
            prev &&
            (prev.subtitle === 'Conectando…' ||
              prev.subtitle === 'Llamando…' ||
              prev.subtitle === 'Esperando a que se una…' ||
              prev.subtitle?.includes('reintentando') ||
              prev.subtitle === 'Servidor reconectando…' ||
              prev.subtitle?.includes('Sin ') ||
              prev.subtitle?.includes('Conexión') ||
              prev.subtitle?.startsWith('Conectando'))
              ? { ...prev, subtitle: 'En llamada' }
              : prev,
          )
          return
        }
        if (st === 'failed' || st === 'disconnected') {
          console.warn('ICE', st, 'for', remoteUserId, '— restartIce + renegotiate')
          const kind = sessionRef.current?.kind || 'audio'
          if (kind === 'video' || kind === 'screen') {
            void tuneOutgoingVideo(pc, kind, { degraded: true })
          }
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  subtitle:
                    st === 'failed'
                      ? 'Sin conexión con el otro — reintentando…'
                      : 'Conexión inestable… reintentando',
                }
              : prev,
          )
          const now = Date.now()
          if (now - iceFailToastAt > 8000) {
            iceFailToastAt = now
            toast.error(
              st === 'failed'
                ? 'Sin conexión de llamada. Probá otra red o sin VPN.'
                : 'Conexión inestable… reintentando',
            )
          }
          try {
            pc.restartIce()
          } catch {
            /* ignore */
          }
          window.setTimeout(() => {
            if (!sessionRef.current) return
            if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
              return
            }
            if (st === 'failed') {
              // Hard fail: rebuild the peer entirely (rejoin case).
              ensurePeer(remoteUserId, { recreate: true })
              return
            }
            if (!isPolitePeer(remoteUserId) && pc.signalingState === 'stable') {
              void makeOffer(remoteUserId, pc)
            }
          }, 900)
        }
      }

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState
        if (st === 'connected') {
          setSession((prev) =>
            prev &&
            (prev.subtitle === 'Conectando…' ||
              prev.subtitle === 'Llamando…' ||
              prev.subtitle === 'Esperando a que se una…' ||
              prev.subtitle?.startsWith('Conectando') ||
              prev.subtitle?.includes('reintentando'))
              ? { ...prev, subtitle: 'En llamada' }
              : prev,
          )
          return
        }
        if (st !== 'failed') return
        setSession((prev) =>
          prev ? { ...prev, subtitle: 'Sin conexión con el otro — reintentando…' } : prev,
        )
        try {
          pc.restartIce()
        } catch {
          /* ignore */
        }
        window.setTimeout(() => {
          if (!sessionRef.current) return
          if (pc.connectionState === 'connected') return
          // Prefer full PC rebuild over offer-only — half-dead ICE stays
          // on “Conectando…” forever with just renegotiation.
          ensurePeer(remoteUserId, { recreate: true })
        }, 1200)
      }

      pc.onnegotiationneeded = () => {
        if (isPolitePeer(remoteUserId)) return
        void makeOffer(remoteUserId, pc)
      }

      peersRef.current.set(remoteUserId, { pc })

      const kindNow = sessionRef.current?.kind
      if (kindNow === 'video' || kindNow === 'screen') {
        void tuneOutgoingVideo(pc, kindNow)
      }

      if (!isPolitePeer(remoteUserId)) {
        void makeOffer(remoteUserId, pc)
      }
      // Late joiners learn our mute state.
      if (mutedRef.current) {
        const s = sessionRef.current
        if (s) {
          signalViaWs({
            call_id: s.callId,
            channel_id: s.channelId,
            to_user_id: remoteUserId,
            signal_type: 'mute',
            muted: true,
          })
        }
      }
      return pc
    },
    [cleanupPeer, isPolitePeer, makeOffer, signalViaWs, refreshLinkHint],
  )

  const handleSignal = useCallback(
    async (p: {
      call_id?: string
      from_user_id?: string
      to_user_id?: string
      signal_type?: string
      sdp?: RTCSessionDescriptionInit
      candidate?: RTCIceCandidateInit
      muted?: boolean
    }) => {
      const s = sessionRef.current
      if (!s || p.call_id !== s.callId || !p.from_user_id) return
      if (p.to_user_id && p.to_user_id !== me?.id) return
      if (p.from_user_id === me?.id) return

      if (p.signal_type === 'mute') {
        const uid = p.from_user_id
        setRemotes((prev) => {
          const cur = prev[uid]
          if (!cur) {
            return {
              ...prev,
              [uid]: { stream: new MediaStream(), name: undefined, muted: !!p.muted, rev: 1 },
            }
          }
          return { ...prev, [uid]: { ...cur, muted: !!p.muted } }
        })
        return
      }

      const pc = ensurePeer(p.from_user_id)
      try {
        if (p.signal_type === 'offer' && p.sdp) {
          const remoteSdp = normalizeSdp(p.sdp)
          if (!remoteSdp) return
          const collision =
            makingOfferRef.current.has(p.from_user_id) || pc.signalingState !== 'stable'
          if (collision) {
            if (!isPolitePeer(p.from_user_id)) return
            try {
              await pc.setLocalDescription({ type: 'rollback' })
            } catch {
              /* older browsers */
            }
          }
          await pc.setRemoteDescription(remoteSdp)
          await flushPendingIce(p.from_user_id, pc)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          signalViaWs({
            call_id: s.callId,
            channel_id: s.channelId,
            to_user_id: p.from_user_id,
            signal_type: 'answer',
            sdp: sdpPayload(pc.localDescription),
          })
        } else if (p.signal_type === 'answer' && p.sdp) {
          const remoteSdp = normalizeSdp(p.sdp)
          if (!remoteSdp) return
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(remoteSdp)
            await flushPendingIce(p.from_user_id, pc)
          }
        } else if (p.signal_type === 'ice' && p.candidate) {
          if (!pc.remoteDescription) {
            const q = pendingIceRef.current.get(p.from_user_id) || []
            q.push(p.candidate)
            pendingIceRef.current.set(p.from_user_id, q)
          } else {
            try {
              await pc.addIceCandidate(p.candidate)
            } catch {
              /* race */
            }
          }
        }
      } catch (err) {
        console.error('signal handle', err)
      }
    },
    [ensurePeer, flushPendingIce, isPolitePeer, me?.id, signalViaWs],
  )

  /** SDP/ICE often arrives while accept() is still getting the mic — queue until session exists. */
  const ingestSignal = useCallback(
    (p: Parameters<typeof handleSignal>[0]) => {
      const s = sessionRef.current
      if (!s) {
        const ringing = incomingRef.current?.callId
        if (p?.call_id && ringing && p.call_id === ringing) {
          pendingSignalsRef.current.push(p)
        }
        return
      }
      void handleSignal(p)
    },
    [handleSignal],
  )

  const flushPendingSignals = useCallback(async () => {
    const batch = pendingSignalsRef.current.splice(0)
    for (const p of batch) {
      await handleSignal(p)
    }
  }, [handleSignal])

  const kickOffers = useCallback(
    (opts?: { force?: boolean; iceRestart?: boolean }) => {
      for (const [id, st] of peersRef.current) {
        if (st.pc.signalingState !== 'stable') continue
        const noRemote = !st.pc.currentRemoteDescription
        const ice = st.pc.iceConnectionState
        const stuckIce = ice === 'new' || ice === 'checking' || ice === 'disconnected' || ice === 'failed'
        // Perfect negotiation: impolite normally offers. If still stuck (lost
        // CALL_JOIN / offer), either side may force a fresh offer.
        if (!opts?.force && isPolitePeer(id) && !noRemote) continue
        if (!opts?.force && isPolitePeer(id) && noRemote) {
          // Polite waits briefly for the remote offer; force path covers stuck calls.
          continue
        }
        if (noRemote || opts?.force || (opts?.iceRestart && stuckIce)) {
          void makeOffer(id, st.pc, { iceRestart: opts?.iceRestart || ice === 'failed' })
        }
      }
    },
    [isPolitePeer, makeOffer],
  )

  useEffect(() => {
    const unsubs = [
      subscribe('CALL_INVITE', (evt: WSEvent) => {
        const p = evt.payload as {
          call_id?: string
          channel_id?: string
          kind?: CallKind
          from_user_id?: string
          from_name?: string
        }
        if (!p?.call_id || p.from_user_id === me?.id) return
        if (sessionRef.current) return
        setIncoming({
          callId: p.call_id,
          channelId: p.channel_id || '',
          kind: p.kind || 'audio',
          fromName: (p.from_name || 'Usuario').trim(),
          fromUserId: p.from_user_id || '',
          status: 'ringing',
        })
      }),
      subscribe('CALL_JOIN', (evt: WSEvent) => {
        const p = evt.payload as {
          call_id?: string
          user_id?: string
          name?: string
          rejoin?: boolean
        }
        // Answered on another device/tab → stop ringing here.
        if (
          p.user_id &&
          p.user_id === me?.id &&
          incomingRef.current?.callId &&
          p.call_id === incomingRef.current.callId
        ) {
          setIncoming(null)
          pendingSignalsRef.current = pendingSignalsRef.current.filter(
            (x) => x.call_id !== p.call_id,
          )
          return
        }
        const s = sessionRef.current
        if (!s || p.call_id !== s.callId || !p.user_id || p.user_id === me?.id) return
        // Rebuild only when missing/dead or true rejoin-after-leave. Blind
        // recreate on every CALL_JOIN resets ICE mid-handshake (stuck
        // "Conectando…"), which recovery /join polls used to trigger.
        const existing = peersRef.current.get(p.user_id)
        const ice = existing?.pc.iceConnectionState
        const conn = existing?.pc.connectionState
        const dead =
          !existing ||
          ice === 'failed' ||
          ice === 'closed' ||
          conn === 'failed' ||
          conn === 'closed' ||
          existing.pc.signalingState === 'closed'
        ensurePeer(p.user_id, { recreate: !!p.rejoin || dead })
        peerJoinedRef.current = true
        // Host was still on “Llamando…” + ringback — peer answered; stop ringing UI.
        setSession((prev) =>
          prev &&
          (prev.subtitle === 'Llamando…' ||
            prev.subtitle === 'Servidor reconectando…' ||
            !prev.subtitle)
            ? { ...prev, subtitle: 'Conectando…' }
            : prev,
        )
        if (p.name) {
          setRemotes((prev) => {
            const cur = prev[p.user_id!]
            if (!cur) return prev
            return { ...prev, [p.user_id!]: { ...cur, name: p.name?.trim() || cur.name } }
          })
        }
        kickOffers({ force: true, iceRestart: !!p.rejoin || dead })
      }),
      subscribe('CALL_LEAVE', (evt: WSEvent) => {
        const p = evt.payload as { call_id?: string; user_id?: string }
        const s = sessionRef.current
        if (!s || p.call_id !== s.callId || !p.user_id || p.user_id === me?.id) return
        cleanupPeer(p.user_id)
      }),
      subscribe('CALL_SIGNAL', (evt: WSEvent) => {
        ingestSignal(evt.payload as Parameters<typeof handleSignal>[0])
      }),
      subscribe('CALL_END', (evt: WSEvent) => {
        const p = evt.payload as { call_id?: string }
        if (incomingRef.current?.callId === p.call_id) setIncoming(null)
        pendingSignalsRef.current = pendingSignalsRef.current.filter((x) => x.call_id !== p.call_id)
        const s = sessionRef.current
        if (!s || p.call_id !== s.callId) return
        void hangupLocal(false)
        toast.message('Llamada finalizada')
      }),
    ]
    return () => unsubs.forEach((u) => u())
  }, [subscribe, me?.id, ensurePeer, ingestSignal, hangupLocal, cleanupPeer, kickOffers])

  // Recover invites missed while WS was down / tab sleeping / after re-login.
  // Host join flips the room to "active" immediately — backend returns ringing+active.
  const pollIncoming = useCallback(async () => {
    if (sessionRef.current) return
    try {
      const { data } = await api.get('/internal-chat/calls/incoming')
      const call = data?.call as
        | {
            id?: string
            channel_id?: string
            kind?: CallKind
            status?: string
            from_user_id?: string
            from_name?: string
          }
        | undefined
      // No ringing call for this user (answered elsewhere, ended, or left).
      if (!call?.id) {
        if (incomingRef.current) {
          setIncoming(null)
          pendingSignalsRef.current = []
        }
        return
      }
      // We hung up this room (or it ended for us) — never show Unirse for it.
      if (wasCallHungUp(call.id)) {
        if (incomingRef.current?.callId === call.id) {
          setIncoming(null)
          pendingSignalsRef.current = []
        }
        return
      }
      // Reload resume in progress — auto-rejoin owns it; no banner.
      const resume = readCallResume()
      if (resume?.callId === call.id) return
      const callStatus: 'ringing' | 'active' =
        call.status === 'active' ? 'active' : 'ringing'
      const nextIncoming = {
        callId: call.id,
        channelId: call.channel_id || '',
        kind: (call.kind || 'audio') as CallKind,
        fromName: (call.from_name || 'Usuario').trim(),
        fromUserId: call.from_user_id || '',
        status: callStatus,
      }
      const cur = incomingRef.current
      if (cur) {
        if (cur.callId !== call.id) {
          // Newer invite replaced the previous one.
          setIncoming(nextIncoming)
          return
        }
        // Enrich deep-link / SW stub with real caller name / status.
        if (
          (!cur.fromUserId && call.from_user_id) ||
          cur.fromName === 'Llamada entrante' ||
          cur.fromName === 'Usuario' ||
          cur.status !== callStatus
        ) {
          setIncoming({
            ...nextIncoming,
            channelId: call.channel_id || cur.channelId,
            kind: (call.kind || cur.kind) as CallKind,
            fromName: (call.from_name || cur.fromName).trim(),
            fromUserId: call.from_user_id || cur.fromUserId,
          })
        }
        return
      }
      setIncoming(nextIncoming)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void pollIncoming()
    // Faster while disconnected/reconnecting so a relogin picks up live rooms.
    const ms = isConnected ? 4000 : 2500
    const t = window.setInterval(() => void pollIncoming(), ms)
    const onVis = () => {
      if (document.visibilityState === 'visible') void pollIncoming()
    }
    const onFocus = () => void pollIncoming()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onFocus)
    }
  }, [pollIncoming, isConnected])

  // WS just came back — poll immediately (invite may have been missed).
  // During an active call, surface deploys/restarts so the user knows why
  // signaling dropped instead of wondering why audio/peer updates stall.
  // Also re-join the room + renegotiate ICE (502/deploy kills in-memory peers).
  const wasConnected = useRef(isConnected)
  useEffect(() => {
    const sess = sessionRef.current
    const inCall = !!sess
    if (isConnected && !wasConnected.current) {
      void pollIncoming()
      if (inCall && sess) {
        toast.success('Señal de llamada recuperada — reenlazando audio…')
        setSession((prev) =>
          prev &&
          (prev.subtitle === 'Servidor reconectando…' || prev.subtitle === 'Conectando…')
            ? { ...prev, subtitle: 'Conectando…' }
            : prev,
        )
        void (async () => {
          try {
            iceRef.current = await loadIceServers()
            const join = await api.post(`/internal-chat/calls/${sess.callId}/join`)
            const parts = (join.data?.participants || []) as { user_id: string; name?: string }[]
            for (const p of parts) {
              if (p.user_id === me?.id) continue
              ensurePeer(p.user_id, { recreate: true })
              if (p.name) {
                setRemotes((prev) => {
                  const cur = prev[p.user_id]
                  if (!cur) return prev
                  return { ...prev, [p.user_id]: { ...cur, name: p.name } }
                })
              }
            }
            await flushPendingSignals()
            kickOffers()
            for (const [, st] of peersRef.current) {
              try {
                st.pc.restartIce()
              } catch {
                /* ignore */
              }
            }
            for (const ms of [300, 900, 2000, 4000]) {
              window.setTimeout(() => {
                if (!sessionRef.current) return
                kickOffers({ force: true, iceRestart: true })
              }, ms)
            }
          } catch (err) {
            console.warn('call rejoin after WS reconnect failed', err)
            toast.error('No se pudo reenlazar la llamada — cuelga y vuelve a marcar')
          }
        })()
      }
    } else if (!isConnected && wasConnected.current && inCall) {
      toast.warning('Servidor reiniciando o sin conexión — reintentando señal…', {
        duration: 8000,
        id: 'call-ws-down',
      })
      setSession((prev) =>
        prev ? { ...prev, subtitle: 'Servidor reconectando…' } : prev,
      )
    }
    wasConnected.current = isConnected
  }, [isConnected, pollIncoming, ensurePeer, flushPendingSignals, kickOffers, me?.id])

  // Push notification / ?join_call= deep-link → restore incoming banner.
  useEffect(() => {
    const applyIncoming = (p: {
      callId: string
      channelId?: string
      kind?: CallKind
      fromName?: string
      fromUserId?: string
    }) => {
      if (!p.callId || sessionRef.current) return
      if (incomingRef.current?.callId === p.callId) return
      setIncoming({
        callId: p.callId,
        channelId: p.channelId || '',
        kind: p.kind || 'audio',
        fromName: (p.fromName || 'Llamada entrante').trim(),
        fromUserId: p.fromUserId || '',
        status: 'ringing',
      })
    }

    const clearJoinParams = () => {
      try {
        const u = new URL(window.location.href)
        if (!u.searchParams.has('join_call')) return
        u.searchParams.delete('join_call')
        u.searchParams.delete('channel')
        u.searchParams.delete('kind')
        window.history.replaceState({}, '', `${u.pathname}${u.search}${u.hash}`)
      } catch {
        /* ignore */
      }
    }

    const fromLocation = () => {
      try {
        const u = new URL(window.location.href)
        const callId = u.searchParams.get('join_call')
        if (!callId) return null
        return {
          callId,
          channelId: u.searchParams.get('channel') || '',
          kind: (u.searchParams.get('kind') as CallKind) || 'audio',
        }
      } catch {
        return null
      }
    }

    let cancelled = false
    ;(async () => {
      await pollIncoming()
      if (cancelled) return
      if (sessionRef.current || incomingRef.current) {
        clearJoinParams()
        return
      }
      const deep = fromLocation()
      if (deep) {
        applyIncoming(deep)
        clearJoinParams()
        window.setTimeout(() => void pollIncoming(), 400)
      }
    })()

    const onSwMessage = (ev: MessageEvent) => {
      const data = ev.data as
        | { type?: string; payload?: Record<string, string> }
        | undefined
      if (!data || data.type !== 'ops_notification_open') return
      const p = data.payload || {}
      if (p.type === 'incoming_call' && p.call_id) {
        applyIncoming({
          callId: String(p.call_id),
          channelId: p.channel_id ? String(p.channel_id) : '',
          kind: (p.kind as CallKind) || 'audio',
        })
        void pollIncoming()
      }
    }
    navigator.serviceWorker?.addEventListener('message', onSwMessage)
    return () => {
      cancelled = true
      navigator.serviceWorker?.removeEventListener('message', onSwMessage)
    }
  }, [pollIncoming])

  const startCall = useCallback(
    async (opts: { channelId: string; kind: CallKind; title: string; subtitle?: string }) => {
      if (sessionRef.current) {
        toast.message('Ya hay una llamada activa')
        return
      }
      // Answering via call button on the same DM — kill ringtone before mic prompt.
      const earlyInv = incomingRef.current
      if (earlyInv?.channelId === opts.channelId) {
        setIncoming(null)
        incomingRef.current = null
        peerJoinedRef.current = true
      }
      setConnecting(true)
      try {
        // Media FIRST — getDisplayMedia / camera need the click's user gesture.
        // Awaiting ICE/API before this makes Chrome reject with NotAllowedError.
        const stream = await getCallStream(opts.kind)
        localRef.current = stream
        setLocalStream(stream)
        setCamOff(opts.kind === 'audio' || stream.getVideoTracks().length === 0)

        iceRef.current = await loadIceServers()

        let callId = ''
        let kind = opts.kind
        let rejoining = false
        let title = opts.title
        // Same chat is already ringing us → answer that room instead of opening a
        // second call (banner + overlay tangle / missed-call spam).
        const inv = earlyInv?.channelId === opts.channelId ? earlyInv : incomingRef.current
        if (inv?.callId && inv.channelId === opts.channelId) {
          callId = inv.callId
          kind = inv.kind || opts.kind
          title = inv.fromName || opts.title
          rejoining = true
          peerJoinedRef.current = true
          setIncoming(null)
        } else {
          if (incomingRef.current) setIncoming(null)
          try {
            const { data } = await api.post(`/internal-chat/channels/${opts.channelId}/calls`, {
              kind: opts.kind,
            })
            callId = data?.call?.id as string
          } catch (err: unknown) {
            // Active call already — join the room instead of failing (group / re-call).
            const ax = err as {
              response?: { status?: number; data?: { call?: { id?: string; kind?: CallKind } } }
            }
            if (ax.response?.status === 409 && ax.response.data?.call?.id) {
              callId = ax.response.data.call.id
              kind = (ax.response.data.call.kind as CallKind) || opts.kind
              rejoining = true
              peerJoinedRef.current = true
            } else {
              throw err
            }
          }
        }
        if (!callId) throw new Error('no call id')

        const sess: CallSession = {
          callId,
          channelId: opts.channelId,
          kind,
          title,
          subtitle: rejoining ? 'Conectando…' : opts.subtitle || 'Llamando…',
          isHost: !rejoining,
        }
        setSession(sess)
        sessionRef.current = sess
        keepaliveRef.current = createMediaKeepalive()
        setCallMediaSession({
          title,
          artist: opts.subtitle || 'Llamada',
          onHangup: () => void hangupLocal(true),
        })
        const join = await api.post(`/internal-chat/calls/${callId}/join`)
        const parts = (join.data?.participants || []) as { user_id: string; name?: string }[]
        for (const p of parts) {
          if (p.user_id === me?.id) continue
          ensurePeer(p.user_id, { recreate: rejoining })
          if (p.name) {
            setRemotes((prev) => {
              const cur = prev[p.user_id]
              if (!cur) return prev
              return { ...prev, [p.user_id]: { ...cur, name: p.name } }
            })
          }
        }
        if (inv?.fromUserId && inv.channelId === opts.channelId) {
          ensurePeer(inv.fromUserId, { recreate: true })
        }
        await flushPendingSignals()
        kickOffers({ force: true, iceRestart: rejoining })
        for (const ms of [400, 1200, 2500, 5000, 9000]) {
          window.setTimeout(() => {
            if (!sessionRef.current) return
            let needRestart = false
            for (const [, st] of peersRef.current) {
              const ice = st.pc.iceConnectionState
              if (ice === 'failed' || ice === 'disconnected') {
                needRestart = true
                try {
                  st.pc.restartIce()
                } catch {
                  /* ignore */
                }
              }
            }
            kickOffers({ force: true, iceRestart: needRestart })
          }, ms)
        }
      } catch (err: unknown) {
        console.error(err)
        toast.error(mediaCallErrorMessage(err, opts.kind))
        localRef.current?.getTracks().forEach((t) => t.stop())
        localRef.current = null
        setLocalStream(null)
        setSession(null)
        sessionRef.current = null
      } finally {
        setConnecting(false)
      }
    },
    [ensurePeer, hangupLocal, me?.id, flushPendingSignals, kickOffers],
  )

  /** Rejoin an existing room (reload without hangup) — uses call id, not create→409. */
  const joinCall = useCallback(
    async (opts: {
      callId: string
      channelId: string
      kind: CallKind
      title: string
      reconnecting?: boolean
    }) => {
      if (sessionRef.current) {
        toast.message('Ya hay una llamada activa')
        return
      }
      if (wasCallHungUp(opts.callId)) {
        clearCallResume()
        return
      }
      setConnecting(true)
      try {
        // Screen rooms: rejoiner only needs mic (host already sends display).
        const mediaKind = opts.kind === 'screen' ? 'audio' : opts.kind
        const stream = await getCallStream(mediaKind)
        localRef.current = stream
        setLocalStream(stream)
        setCamOff(
          opts.kind === 'screen' ||
            opts.kind === 'audio' ||
            stream.getVideoTracks().length === 0,
        )
        iceRef.current = await loadIceServers()

        const sess: CallSession = {
          callId: opts.callId,
          channelId: opts.channelId,
          kind: opts.kind,
          title: opts.title,
          subtitle: opts.reconnecting ? 'Reconectando…' : 'Conectando…',
          isHost: false,
        }
        setSession(sess)
        sessionRef.current = sess
        keepaliveRef.current = createMediaKeepalive()
        setCallMediaSession({
          title: opts.title,
          artist: 'Llamada',
          onHangup: () => void hangupLocal(true),
        })

        const join = await api.post(`/internal-chat/calls/${opts.callId}/join`)
        const parts = (join.data?.participants || []) as { user_id: string; name?: string }[]
        for (const p of parts) {
          if (p.user_id === me?.id) continue
          ensurePeer(p.user_id, { recreate: true })
          if (p.name) {
            setRemotes((prev) => {
              const cur = prev[p.user_id]
              if (!cur) return prev
              return { ...prev, [p.user_id]: { ...cur, name: p.name } }
            })
          }
        }
        await flushPendingSignals()
        kickOffers({ force: true, iceRestart: true })
        for (const ms of [400, 1200, 2500, 5000, 9000]) {
          window.setTimeout(() => {
            if (!sessionRef.current) return
            let needRestart = false
            for (const [, st] of peersRef.current) {
              const ice = st.pc.iceConnectionState
              if (ice === 'failed' || ice === 'disconnected') {
                needRestart = true
                try {
                  st.pc.restartIce()
                } catch {
                  /* ignore */
                }
              }
            }
            kickOffers({ force: true, iceRestart: needRestart })
          }, ms)
        }
      } catch (err: unknown) {
        console.error(err)
        toast.error(mediaCallErrorMessage(err, opts.kind === 'screen' ? 'video' : opts.kind))
        localRef.current?.getTracks().forEach((t) => t.stop())
        localRef.current = null
        setLocalStream(null)
        setSession(null)
        sessionRef.current = null
      } finally {
        setConnecting(false)
      }
    },
    [ensurePeer, hangupLocal, me?.id, flushPendingSignals, kickOffers],
  )

  const acceptIncoming = useCallback(async () => {
    const inv = incomingRef.current
    if (!inv) return
    // Drop banner + ringtone FIRST (before mic prompt). Waiting on getUserMedia
    // left the ring playing for seconds after Contestar.
    setIncoming(null)
    incomingRef.current = null
    setConnecting(true)
    peerJoinedRef.current = true
    try {
      // Screen share: callee only needs mic — host already sends display video.
      // Opening the camera here confuses UX and can leave camOff killing nothing useful.
      const wantKind = inv.kind === 'screen' ? 'audio' : inv.kind
      const stream = await getCallStream(wantKind)
      localRef.current = stream
      setLocalStream(stream)
      setCamOff(
        inv.kind === 'screen' || inv.kind === 'audio' || stream.getVideoTracks().length === 0,
      )
      iceRef.current = await loadIceServers()

      // Session first so early CALL_SIGNAL frames are accepted (not dropped).
      const sess: CallSession = {
        callId: inv.callId,
        channelId: inv.channelId,
        kind: inv.kind,
        title: inv.fromName,
        subtitle: 'Conectando…',
        isHost: false,
      }
      setSession(sess)
      sessionRef.current = sess
      keepaliveRef.current = createMediaKeepalive()
      setCallMediaSession({
        title: inv.fromName,
        artist: 'Llamada',
        onHangup: () => void hangupLocal(true),
      })

      const join = await api.post(`/internal-chat/calls/${inv.callId}/join`)
      const parts = (join.data?.participants || []) as { user_id: string; name?: string }[]
      for (const p of parts) {
        if (p.user_id === me?.id) continue
        ensurePeer(p.user_id, { recreate: true })
        peerJoinedRef.current = true
      }
      if (inv.fromUserId) ensurePeer(inv.fromUserId, { recreate: true })
      await flushPendingSignals()
      kickOffers({ force: true, iceRestart: true })
      // Renegotiate if still stuck — avoid iceRestart on every tick (that
      // thrashs a healthy checking → connected handshake after answer).
      for (const ms of [400, 1200, 2500, 5000, 9000]) {
        window.setTimeout(() => {
          if (!sessionRef.current) return
          let needRestart = false
          for (const [, st] of peersRef.current) {
            const ice = st.pc.iceConnectionState
            if (ice === 'failed' || ice === 'disconnected') {
              needRestart = true
              try {
                st.pc.restartIce()
              } catch {
                /* ignore */
              }
            }
          }
          kickOffers({ force: true, iceRestart: needRestart })
        }, ms)
      }
    } catch (err) {
      console.error(err)
      toast.error(mediaCallErrorMessage(err, inv.kind === 'screen' ? 'video' : inv.kind))
      localRef.current?.getTracks().forEach((t) => t.stop())
      localRef.current = null
      setLocalStream(null)
      setSession(null)
      sessionRef.current = null
      peerJoinedRef.current = false
    } finally {
      setConnecting(false)
    }
  }, [ensurePeer, hangupLocal, me?.id, flushPendingSignals, kickOffers])

  const declineIncoming = useCallback(() => {
    const inv = incomingRef.current
    setIncoming(null)
    if (inv?.callId) {
      markCallHungUp(inv.callId)
      void api.post(`/internal-chat/calls/${inv.callId}/end`).catch(() => {})
    }
  }, [])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m
      localRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = !next
      })
      const s = sessionRef.current
      if (s) {
        signalViaWs({
          call_id: s.callId,
          channel_id: s.channelId,
          signal_type: 'mute',
          muted: next,
        })
      }
      return next
    })
  }, [signalViaWs])

  const toggleCam = useCallback(() => {
    // Never disable getDisplayMedia tracks — that blanks the remote screen
    // while audio keeps working (exactly the “oigo pero no veo” bug).
    if (sessionRef.current?.kind === 'screen') return
    setCamOff((c) => {
      const next = !c
      localRef.current?.getVideoTracks().forEach((t) => {
        const surface = t.getSettings?.().displaySurface
        if (surface) return
        t.enabled = !next
      })
      return next
    })
  }, [])

  // When peers are up and the link is healthy, show “En llamada”.
  useEffect(() => {
    if (!session) return
    const n = Object.keys(remotes).length
    if (n === 0 || linkHint) return
    if (session.subtitle === 'En llamada') return
    setSession((s) => (s ? { ...s, subtitle: 'En llamada' } : s))
  }, [remotes, session, linkHint])

  // Outgoing ringback while waiting; connect chime when the peer joins.
  const hadRemoteRef = useRef(false)
  useEffect(() => {
    if (!session) {
      hadRemoteRef.current = false
      peerJoinedRef.current = false
      return
    }
    const n = Object.keys(remotes).length
    if (n > 0) {
      peerJoinedRef.current = true
      if (!hadRemoteRef.current) {
        hadRemoteRef.current = true
        playCallConnectedSound()
      }
      return
    }
    // Peer answered / joined mesh but media not up yet — stop ringback.
    if (
      peerJoinedRef.current ||
      peersRef.current.size > 0 ||
      session.subtitle === 'Conectando…' ||
      session.subtitle === 'Reconectando…' ||
      session.subtitle?.startsWith('Conectando')
    ) {
      return
    }
    hadRemoteRef.current = false
    // Only the caller hears ringback (not the rejoiner/callee).
    if (!session.isHost) return
    const stop = startCallRingback()
    return () => stop()
  }, [session?.callId, session?.isHost, session?.subtitle, remotes])

  // While stuck on Conectando/Llamando, refresh participants + force renegotiation.
  // Covers missed CALL_JOIN (video/screen often fail here) and polite-peer deadlocks.
  useEffect(() => {
    if (!session) return
    const stuck =
      session.subtitle === 'Conectando…' ||
      session.subtitle === 'Reconectando…' ||
      session.subtitle === 'Llamando…' ||
      session.subtitle === 'Servidor reconectando…' ||
      session.subtitle === 'Esperando a que se una…' ||
      !!session.subtitle?.startsWith('Conectando')
    if (!stuck) return
    let cancelled = false
    const tick = async () => {
      const s = sessionRef.current
      if (!s || cancelled) return
      try {
        const join = await api.post(`/internal-chat/calls/${s.callId}/join`)
        const parts = (join.data?.participants || []) as { user_id: string; name?: string }[]
        for (const p of parts) {
          if (p.user_id === me?.id) continue
          ensurePeer(p.user_id)
          peerJoinedRef.current = true
          if (p.name) {
            setRemotes((prev) => {
              const cur = prev[p.user_id]
              if (!cur) return prev
              return { ...prev, [p.user_id]: { ...cur, name: p.name } }
            })
          }
        }
        setSession((prev) =>
          prev && prev.subtitle === 'Llamando…'
            ? { ...prev, subtitle: 'Conectando…' }
            : prev,
        )
        // Also promote Reconectando when peers appear after reload.
        if (peersRef.current.size > 0) {
          setSession((prev) =>
            prev && (prev.subtitle === 'Llamando…' || prev.subtitle === 'Reconectando…')
              ? { ...prev, subtitle: prev.subtitle === 'Reconectando…' ? 'Reconectando…' : 'Conectando…' }
              : prev,
          )
        }
        kickOffers({
          force: true,
          iceRestart: [...peersRef.current.values()].some((st) => {
            const ice = st.pc.iceConnectionState
            return ice === 'failed' || ice === 'disconnected'
          }),
        })
      } catch {
        /* ignore */
      }
    }
    const t0 = window.setTimeout(() => void tick(), 700)
    const t1 = window.setTimeout(() => void tick(), 2200)
    const t2 = window.setTimeout(() => {
      if (cancelled || !sessionRef.current) return
      const still =
        sessionRef.current.subtitle === 'Conectando…' ||
        sessionRef.current.subtitle === 'Reconectando…' ||
        sessionRef.current.subtitle === 'Llamando…' ||
        sessionRef.current.subtitle === 'Esperando a que se una…' ||
        !!sessionRef.current.subtitle?.startsWith('Conectando')
      if (!still) return
      // Alone in the mesh: honest waiting copy (not endless “Conectando…”).
      if (peersRef.current.size === 0) {
        setSession((prev) =>
          prev && prev.subtitle !== 'Reconectando…'
            ? { ...prev, subtitle: 'Esperando a que se una…' }
            : prev,
        )
        void tick()
        return
      }
      // Peer present but media stuck — rebuild PCs once, then renegotiate.
      for (const uid of [...peersRef.current.keys()]) {
        const ice = peersRef.current.get(uid)?.pc.iceConnectionState
        if (ice !== 'connected' && ice !== 'completed') {
          ensurePeer(uid, { recreate: true })
        }
      }
      setSession((prev) =>
        prev
          ? {
              ...prev,
              subtitle:
                prev.kind === 'screen'
                  ? 'Conectando pantalla…'
                  : prev.kind === 'video'
                    ? 'Conectando video…'
                    : 'Conectando…',
            }
          : prev,
      )
      void tick()
    }, 5500)
    return () => {
      cancelled = true
      window.clearTimeout(t0)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [session?.callId, session?.subtitle, ensurePeer, kickOffers, me?.id])

  // Tab close / reload: leave mesh for others, but stash resume so a reload
  // without hangup auto-reconnects (Unirse only as fallback). Explicit hangup
  // clears this via markCallHungUp.
  useEffect(() => {
    const leaveBeacon = () => {
      const s = sessionRef.current
      if (!s?.callId) return
      if (wasCallHungUp(s.callId)) return
      writeCallResume({
        callId: s.callId,
        channelId: s.channelId,
        kind: s.kind,
        title: s.title,
      })
      try {
        const token = localStorage.getItem('auth_token') || ''
        void fetch(`/api/internal-chat/calls/${s.callId}/leave`, {
          method: 'POST',
          credentials: 'include',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: '{}',
        })
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('pagehide', leaveBeacon)
    return () => window.removeEventListener('pagehide', leaveBeacon)
  }, [])

  // Reload without hangup → silently rejoin as “Reconectando…”.
  const resumeAttempted = useRef(false)
  useEffect(() => {
    if (resumeAttempted.current) return
    resumeAttempted.current = true
    const r = readCallResume()
    if (!r || sessionRef.current) return
    if (wasCallHungUp(r.callId)) {
      clearCallResume()
      return
    }
    clearCallResume()
    void joinCall({ ...r, reconnecting: true }).catch(() => {})
  }, [joinCall])

  return {
    session,
    incoming,
    localStream,
    remotes,
    muted,
    camOff,
    connecting,
    linkHint,
    startCall,
    joinCall,
    acceptIncoming,
    declineIncoming,
    hangup: () => hangupLocal(true),
    toggleMute,
    toggleCam,
  }
}

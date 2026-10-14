import { useState, useRef, useEffect, useCallback, useId } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  X, Plus, Send, Cog,
  Mic, MicOff, Paperclip, FileSpreadsheet, Trash2, ArrowLeft, MessageSquarePlus,
  AudioLines, AlertTriangle, RotateCcw, Plug,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button, Skeleton } from '@asteby/metacore-ui'
import { Mascot, mascotStateFromAgent } from './mascot'
import { useMascotFaceStore } from '../lib/mascot-face-store'
import { ConfirmDialog } from '@asteby/metacore-ui'
import { api, getApiErrorMessage } from '../host'
import { cn } from '@asteby/metacore-ui'
import { getImageUrl } from '@asteby/metacore-starter-core'
import { useWebSocketContext, useWorkspaceHost } from '../host'
import { useSpeechDictation } from '../lib/speech-dictation'
import { speakText, stopSpeaking, ttsSupported, isSpeaking } from '../lib/speech-tts'
import { stopVoiceLevels } from '../lib/voice-levels'
import { useAbyLiveStore } from '../lib/aby-live-store'
import { useLiveThinkStage } from '../lib/aby-live-think-stage'
import { resolveIcon } from '../host'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { type AbyProposal } from './aby-proposal-card'
import type { AgentResult } from '@asteby/metacore-runtime-react'
import { AgentResults, agentResultsOf, type DecidePayload } from './agent-results'
import { ChatEmbedList, isChatEmbed } from '../team-chat/components/chat-embed-card'
import type { ChatAttachment } from '../team-chat/data/types'
import { AgentWorkspaceChrome } from './agent-workspace-chrome'
import {
  AGENT_CAPSULE,
  AGENT_CARD,
  AGENT_ENTER,
} from './agent-surfaces'
import { useRevealText } from './use-reveal-text'
import { scrubToolDump } from '../lib/aby-tool-dump'
import { useNavigate } from '@tanstack/react-router'
import { consumeAbyDraft, requestChatWidgetMinimize } from '../lib/aby-widget'
import { resolveAbyDraftTarget } from '../lib/aby-draft-target'
import { readLastAbySession, rememberAbySession } from '../lib/chat-context'
import { stripMarkdownLite } from '../lib/plain-text'
import { matchProposalDecision } from '../lib/aby-proposal-intent'
import {
  AbyNetworkDownError,
  isAbyStillProcessing,
  isAbyTransportError,
  pollAbyAssistantReply,
  type AbySendSuccess,
} from '../lib/aby-chat-recover'
import {
  abyErrorActionLabel,
  isClaudeProvider,
  abyTurnErrorFromMeta,
  abyTurnErrorOf,
  type AbyTurnError,
  type AbyTurnErrorAction,
} from '../lib/aby-chat-error'
import { toast } from 'sonner'
import { useWorkspacePlatformConfig } from '../host'
import { abyGuidance } from '../lib/aby-guidance'

type PendingFile = {
  url: string
  name: string
  mime_type: string
  size?: number
  preview?: string
}

type Message = {
  role: 'user' | 'ai' | 'activity'
  content: string
  tool?: string
  images?: { url: string; caption: string }[]
  attachments?: PendingFile[]
  proposals?: AbyProposal[]
  embeds?: ChatAttachment[]
  suggestedGuide?: { id: string; title: string; confidence: number }
  /** Arrived in this session (not history): typed in instead of dropped whole. */
  fresh?: boolean
  /** The turn failed: cause + recovery actions instead of a reply. */
  error?: AbyTurnError
  /** What to resend when the user retries a failed turn (same thread). */
  retry?: AbyRetry
}

/** A failed turn's payload; the server already stored the user row. */
type AbyRetry = {
  text: string
  files: PendingFile[]
  embeds: ChatAttachment[]
}

type AgentStep = {
  content: string
  tool?: string
  kind: 'thinking' | 'tool_call' | 'tool_result'
}

type SessionRow = {
  id: string
  title: string
  last_message: string
  updated_at: string
}

type Thread = {
  sessionId: string
  title: string
  messages: Message[]
  loading: boolean
  steps: AgentStep[]
}

function guessMimeFromUrl(url: string): string {
  const u = url.toLowerCase()
  if (/\.(png)(\?|$)/.test(u)) return 'image/png'
  if (/\.(jpe?g)(\?|$)/.test(u)) return 'image/jpeg'
  if (/\.(gif)(\?|$)/.test(u)) return 'image/gif'
  if (/\.(webp)(\?|$)/.test(u)) return 'image/webp'
  if (/\.(svg)(\?|$)/.test(u)) return 'image/svg+xml'
  return 'application/octet-stream'
}

function attachmentThumb(f: PendingFile): string | null {
  if (f.preview) return f.preview
  const mime = (f.mime_type || '').toLowerCase()
  const name = `${f.name || ''} ${f.url || ''}`.toLowerCase()
  if (
    mime.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(name) ||
    /\/storage\//.test(f.url)
  ) {
    return getImageUrl(f.url)
  }
  return null
}

type HistoryMeta = {
  embeds?: ChatAttachment[]
  proposals?: AbyProposal[]
  attachments?: ChatAttachment[]
  suggested_guide?: { id: string; title: string; confidence: number }
  turn_error?: unknown
}

type HistoryRow = {
  role: string
  content: string
  media_url?: string
  metadata?: HistoryMeta | string
}

/**
 * One persisted row as a chat message. A saved failed-turn notice
 * (`metadata.turn_error`) comes back as an error bubble whose «Reintentar»
 * resends the preceding user question, exactly like a live failure.
 */
function historyRowToMessage(r: HistoryRow, prev?: Message): Message {
  let meta: unknown = r.metadata
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta)
    } catch {
      meta = undefined
    }
  }
  const m = (meta && typeof meta === 'object' ? meta : undefined) as HistoryMeta | undefined
  if (r.role === 'user') {
    const atts = (m?.attachments || []) as ChatAttachment[]
    const fileAtts: PendingFile[] = atts
      .filter((a) => a.url && !isChatEmbed(a))
      .map((a) => ({
        url: a.url!,
        name: a.name || a.title || 'archivo',
        mime_type: a.mime_type || '',
        size: a.size,
      }))
    if (!fileAtts.length && r.media_url) {
      fileAtts.push({
        url: r.media_url,
        name: 'adjunto',
        mime_type: guessMimeFromUrl(r.media_url),
      })
    }
    return {
      role: 'user' as const,
      content: r.content,
      attachments: fileAtts.length ? fileAtts : undefined,
      embeds: atts.filter(isChatEmbed).length ? atts.filter(isChatEmbed) : m?.embeds,
    }
  }
  const turnError = abyTurnErrorFromMeta(m, r.content)
  if (turnError) {
    return {
      role: 'ai' as const,
      content: turnError.message,
      error: turnError,
      retry:
        prev?.role === 'user'
          ? { text: prev.content, files: prev.attachments || [], embeds: prev.embeds || [] }
          : undefined,
    }
  }
  return {
    role: 'ai' as const,
    content: r.content,
    embeds: m?.embeds,
    proposals: m?.proposals,
    suggestedGuide: m?.suggested_guide,
  }
}

function friendlyAbyError(err: unknown): string {
  const ax = err as {
    code?: string
    message?: string
    response?: { status?: number; data?: unknown }
  }
  if (err instanceof AbyNetworkDownError) {
    return 'Sin conexión a internet. Revisa tu red y reintenta.'
  }
  // Axios "Network Error" = no HTTP response (proxy timeout / connection reset).
  // Vision + tools often exceed Cloudflare's origin wait → user sees this blank.
  if (
    !ax.response &&
    (ax.code === 'ERR_NETWORK' ||
      ax.code === 'ECONNABORTED' ||
      /network error|timeout|exceeded/i.test(ax.message || ''))
  ) {
    return 'No se pudo recuperar la respuesta a tiempo. Reintenta; si el cambio ya se aplicó, revisa el listado.'
  }
  if (ax.response?.status === 502 || ax.response?.status === 504 || ax.response?.status === 524) {
    return 'El servidor tardó demasiado. Reintenta en unos segundos.'
  }
  const raw = getApiErrorMessage(err, '')
  const msg = raw.toLowerCase()
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('ocupado')) {
    return 'El asistente está ocupado (límite de uso). Espera unos segundos e inténtalo de nuevo.'
  }
  if (msg.includes('422') || msg.includes('imagen')) {
    return raw.includes('imagen') || raw.includes('foto')
      ? raw
      : 'No se pudo procesar el mensaje o la imagen. Reintenta o abre una conversación nueva.'
  }
  if (msg.includes('tool_use') || msg.includes('inconsistente')) {
    return 'El hilo quedó inconsistente. Abre una conversación nueva e inténtalo de nuevo.'
  }
  if (raw && !raw.startsWith('AI error:') && raw.length < 180) return raw
  return 'No se pudo completar la solicitud. Reintenta en unos segundos.'
}

export type AbyChatVariant = 'compact' | 'workspace'

/** Aby body — compact = inbox list+thread; workspace = Open WebUI-style sidebar. */
export function AbyChatPane({
  className,
  variant = 'compact',
  resumeSessionId,
}: {
  className?: string
  variant?: AbyChatVariant
  /** When set (e.g. maximize from embed), open this session instead of a blank chat. */
  resumeSessionId?: string
}) {
  const { mascot_name: mascotName, mascot_skin: mascotSkin } = useWorkspacePlatformConfig()
  const queryClient = useQueryClient()
  const { capabilities } = useWorkspaceHost()
  const usageCap = capabilities.usage
  const ReconnectDialog = capabilities.ProviderReconnectDialog
  const isWorkspace = variant === 'workspace'
  const [view, setView] = useState<'list' | 'thread'>(isWorkspace ? 'thread' : 'list')
  const [thread, setThread] = useState<Thread | null>(null)
  const [input, setInput] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [pendingEmbeds, setPendingEmbeds] = useState<ChatAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [decidingId, setDecidingId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [liveMode, setLiveMode] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [interimSpeech, setInterimSpeech] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const liveModeRef = useRef(false)
  const speakingRef = useRef(false)
  /** After TTS, keep mic closed briefly so Aby doesn't hear herself / barge-in. */
  const listenGateUntilRef = useRef(0)
  const sendMessageRef = useRef<(overrideText?: string) => Promise<void>>(async () => {})
  const { subscribe } = useWebSocketContext()

  liveModeRef.current = liveMode
  speakingRef.current = speaking

  const liveThinkStage = useLiveThinkStage(
    thread?.loading ? thread.steps : undefined,
    !!thread?.loading,
  )

  const micMuted = useAbyLiveStore((s) => s.micMuted)
  const setMicMuted = useAbyLiveStore((s) => s.setMicMuted)

  useEffect(() => {
    useAbyLiveStore.getState().setActive(liveMode)
    if (!liveMode) useAbyLiveStore.getState().reset()
  }, [liveMode])

  const decideProposalRef = useRef<(proposalIds: string[], approve: boolean) => Promise<void>>(
    async () => {},
  )
  const pendingProposalIdsRef = useRef<string[]>([])

  // Latest pending proposal(s) for live voice + Document PiP Aceptar/Rechazar.
  useEffect(() => {
    const ids: string[] = []
    let title = ''
    if (thread?.messages?.length) {
      for (let i = thread.messages.length - 1; i >= 0; i--) {
        const pending = (thread.messages[i]?.proposals || []).filter((x) => x.status === 'pending')
        if (pending.length) {
          for (const p of pending) ids.push(p.id)
          const first = pending[0]!
          const actionLabel =
            first.action === 'create' ? 'Crear' : first.action === 'delete' ? 'Eliminar' : 'Editar'
          title =
            ids.length > 1
              ? `Plan · ${ids.length} ${first.model_title || first.model || 'cambios'}`
              : `${actionLabel} · ${first.model_title || first.model || 'registro'}`
          break
        }
      }
    }
    pendingProposalIdsRef.current = ids
    const store = useAbyLiveStore.getState()
    if (!ids.length) {
      store.setPendingProposal(null)
      return
    }
    store.setPendingProposal({
      id: ids[0]!,
      ids,
      title,
      deciding: decidingId != null,
    })
  }, [thread?.messages, decidingId])

  useEffect(() => {
    const store = useAbyLiveStore.getState()
    store.setDecideHandler((ids, approve) => {
      void decideProposalRef.current(ids, approve)
    })
    return () => store.setDecideHandler(null)
  }, [])

  const { listening: aiListening, toggle: toggleAiDictation, start: startDictation, stop: stopDictation } =
    useSpeechDictation({
      continuous: liveMode && !micMuted,
      mascotName: mascotName || 'Aby',
      onInterim: (chunk) => setInterimSpeech(chunk),
      onFinal: (chunk) => {
        if (!chunk) return
        setInterimSpeech('')
        if (useAbyLiveStore.getState().micMuted) return
        // While Aby speaks (or cooldown), ignore transcripts — no interrupt to listen.
        if (speakingRef.current || isSpeaking() || Date.now() < listenGateUntilRef.current) {
          return
        }
        const pendingIds = pendingProposalIdsRef.current
        if (liveModeRef.current && pendingIds.length) {
          const decision = matchProposalDecision(chunk)
          if (decision === 'approve') {
            void decideProposalRef.current(pendingIds, true)
            return
          }
          if (decision === 'reject') {
            void decideProposalRef.current(pendingIds, false)
            return
          }
        }
        if (liveModeRef.current) {
          void sendMessageRef.current(chunk)
          return
        }
        setInput((prev) => (prev ? `${prev} ${chunk}` : chunk).trim())
      },
    })

  useEffect(() => {
    if (!liveMode) return
    const muted = micMuted
    const phase = speaking
      ? 'speaking'
      : thread?.loading
        ? 'thinking'
        : muted
          ? 'idle'
          : aiListening
            ? 'listening'
            : 'idle'
    const hint =
      phase === 'thinking'
        ? liveThinkStage?.hint || 'Pensando…'
        : phase === 'speaking'
          ? 'Hablando…'
          : muted
            ? 'Mic apagado'
            : phase === 'listening'
              ? interimSpeech || 'Te escucho'
              : 'Listo'
    useAbyLiveStore.getState().setPhase(phase, hint)
    if (phase === 'listening' && interimSpeech) {
      useAbyLiveStore.getState().setUtterance(interimSpeech)
    } else if (phase !== 'speaking') {
      if (phase === 'idle') useAbyLiveStore.getState().setUtterance('')
    }
  }, [
    liveMode,
    speaking,
    thread?.loading,
    liveThinkStage?.hint,
    aiListening,
    interimSpeech,
    micMuted,
  ])

  // List, header and the in-thread avatar share this face. A second pane
  // (the hidden widget) may also publish; the store keeps the busiest one.
  const mascotFaceId = useId()
  const mascotFace = mascotStateFromAgent({
    loading: !!thread?.loading,
    speaking: liveMode && speaking,
    listening: liveMode && aiListening && !speaking && !micMuted,
    stepIcon: liveThinkStage?.icon,
    stepKind: thread?.steps?.[thread.steps.length - 1]?.kind,
  })
  useEffect(() => {
    useMascotFaceStore.getState().setFace(mascotFaceId, mascotFace)
  }, [mascotFaceId, mascotFace])
  useEffect(() => {
    return () => useMascotFaceStore.getState().clearFace(mascotFaceId)
  }, [mascotFaceId])

  // Thought trail for PiP (recent agent steps).
  useEffect(() => {
    if (!liveMode) return
    const raw = (thread?.steps || [])
      .map((s) => {
        const c = s.content || ''
        return c.includes('|') ? c.split('|').slice(1).join('|') : c
      })
      .map((s) => s.trim())
      .filter(Boolean)
    if (liveThinkStage?.hint) raw.push(liveThinkStage.hint)
    useAbyLiveStore.getState().setThoughts(raw)
  }, [liveMode, thread?.steps, liveThinkStage?.hint])

  useEffect(() => {
    if (!liveMode) {
      stopSpeaking()
      stopDictation()
      stopVoiceLevels()
      setSpeaking(false)
      speakingRef.current = false
      setInterimSpeech('')
      setMicMuted(false)
      return
    }
    // Mobile: never hold getUserMedia while SpeechRecognition needs the mic.
    stopVoiceLevels()
    if (micMuted) {
      stopDictation()
      setInterimSpeech('')
      return
    }
    // Don't open mic if we're mid-TTS from a race.
    if (!speakingRef.current && !isSpeaking()) startDictation()
    return () => {
      stopDictation()
      stopSpeaking()
      stopVoiceLevels()
      setSpeaking(false)
      speakingRef.current = false
      setInterimSpeech('')
    }
  }, [liveMode, micMuted, startDictation, stopDictation, setMicMuted])

  const speakLive = useCallback((text: string) => {
    stopDictation()
    stopVoiceLevels()
    setInterimSpeech('')
    speakingRef.current = true
    setSpeaking(true)
    const plain = stripMarkdownLite(text).trim()
    useAbyLiveStore.getState().setUtterance(plain)
    speakText(plain, {
      onStart: () => {
        speakingRef.current = true
        setSpeaking(true)
        useAbyLiveStore.getState().setUtterance(plain)
      },
      onEnd: () => {
        speakingRef.current = false
        setSpeaking(false)
        useAbyLiveStore.getState().setUtterance('')
        // Mic stays off until TTS finishes + short gate (sí: no se interrumpe para escuchar).
        listenGateUntilRef.current = Date.now() + 650
        if (liveModeRef.current && !useAbyLiveStore.getState().micMuted) {
          window.setTimeout(() => {
            if (
              !liveModeRef.current ||
              speakingRef.current ||
              isSpeaking() ||
              useAbyLiveStore.getState().micMuted
            ) {
              return
            }
            startDictation()
          }, 650)
        }
      },
    })
  }, [startDictation, stopDictation])

  const loadSessions = useCallback(async (opts?: { silent?: boolean }) => {
    // Keep prior rows visible on back/refresh; skeleton only when empty.
    if (!opts?.silent) setSessionsLoading(true)
    try {
      const { data } = await api.get('/chat/sessions')
      setSessions((data?.data || []) as SessionRow[])
    } catch {
      setSessions([])
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isWorkspace && view !== 'list') return
    // Silent refresh when we already have rows (back from a thread).
    void loadSessions({ silent: sessions.length > 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fetch on view flip
  }, [view, loadSessions, isWorkspace])

  useEffect(() => {
    return subscribe('AI_ACTIVITY', (evt) => {
      const payload = evt.payload as {
        session_id?: string
        message?: string
        type?: string
        tool?: string
      } | null
      if (!payload?.session_id || !payload.message) return
      const eventType = payload.type || 'thinking'
      if (
        eventType !== 'tool_call' &&
        eventType !== 'thinking' &&
        eventType !== 'tool_result'
      ) {
        return
      }
      const sid = payload.session_id.toLowerCase()
      setThread((t) => {
        if (!t || !t.loading || t.sessionId.toLowerCase() !== sid) return t
        const step: AgentStep = {
          content: payload.message!,
          tool: payload.tool,
          kind: eventType as AgentStep['kind'],
        }
        const prevSteps = t.steps || []
        const last = prevSteps[prevSteps.length - 1]
        if (last && last.content === step.content && last.kind === step.kind) return t
        const steps = [...prevSteps, step].slice(-12)
        return {
          ...t,
          steps,
          messages: [
            ...t.messages.filter((m) => m.role !== 'activity'),
            {
              role: 'activity' as const,
              content: payload.message!,
              tool: payload.tool,
            },
          ],
        }
      })
    })
  }, [subscribe])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  })

  useEffect(() => {
    if (view === 'thread') inputRef.current?.focus()
  }, [view, thread?.sessionId])

  const startNew = useCallback(() => {
    setThread({
      sessionId: '',
      title: 'Nueva conversación',
      messages: [],
      loading: false,
      steps: [],
    })
    // Keep staged share embeds/note so the user can attach to a fresh thread.
    setView('thread')
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const openSession = useCallback(async (sessionId: string, title: string) => {
    try {
      const { data } = await api.get(`/chat/history/${sessionId}`)
      const rows = (data?.data || []) as HistoryRow[]
      const messages: Message[] = []
      for (const r of rows) {
        messages.push(historyRowToMessage(r, messages[messages.length - 1]))
      }
      setThread({
        sessionId,
        title: title || 'Conversación',
        messages,
        loading: false,
        steps: [],
      })
      rememberAbySession(sessionId, title || 'Conversación')
      setView('thread')
      requestAnimationFrame(() => inputRef.current?.focus())
    } catch {
      /* ignore */
    }
  }, [])

  // Workspace: resume the embed conversation when present; else blank chat.
  const didWorkspaceBoot = useRef(false)
  useEffect(() => {
    if (!isWorkspace || didWorkspaceBoot.current) return
    didWorkspaceBoot.current = true
    const sid = resumeSessionId || readLastAbySession()?.id
    const title = readLastAbySession()?.title || 'Conversación'
    if (sid) {
      void openSession(sid, title)
    } else {
      setThread({
        sessionId: '',
        title: 'Nueva conversación',
        messages: [],
        loading: false,
        steps: [],
      })
      setView('thread')
    }
  }, [isWorkspace, resumeSessionId, openSession])

  // Keep last-session pointer fresh while chatting (maximize → same thread).
  useEffect(() => {
    if (thread?.sessionId) {
      rememberAbySession(thread.sessionId, thread.title)
    }
  }, [thread?.sessionId, thread?.title])

  // Borrador desde fuera del chat (openAbyWidget): ver resolveAbyDraftTarget.
  // Una pregunta con `send` abre una conversación nueva y se envía sola; lo
  // demás (compartir registros, adjuntos) queda en el compositor de la última
  // conversación o de una nueva, nunca escondido detrás de la lista.
  const autoSendRef = useRef<string | null>(null)
  useEffect(() => {
    const apply = () => {
      const draft = consumeAbyDraft()
      if (!draft) return
      const target = resolveAbyDraftTarget(draft, readLastAbySession())
      if (target.kind !== 'send' && draft.message) {
        setInput((prev) => (prev ? `${prev} ${draft.message}` : draft.message!).trim())
      }
      if (draft.attachments?.length) {
        const embeds = draft.attachments.filter(isChatEmbed)
        const files = draft.attachments.filter((a) => a.url && !isChatEmbed(a))
        if (embeds.length) setPendingEmbeds((prev) => [...prev, ...embeds])
        if (files.length) {
          setPendingFiles((prev) => [
            ...prev,
            ...files.map((f) => ({
              url: f.url!,
              name: f.name || f.title || 'archivo',
              mime_type: f.mime_type || 'application/octet-stream',
              size: f.size,
            })),
          ])
        }
      }
      if (target.kind === 'open') {
        void openSession(target.sessionId, target.title)
        return
      }
      if (target.kind === 'send') autoSendRef.current = target.message
      setThread({
        sessionId: '',
        title: 'Nueva conversación',
        messages: [],
        loading: false,
        steps: [],
      })
      setView('thread')
    }
    apply()
    const id = window.setInterval(apply, 400)
    return () => window.clearInterval(id)
  }, [openSession])

  // Reopen last Aby thread when mounting the pane (widget / inbox).
  const didResumeRef = useRef(false)
  useEffect(() => {
    if (didResumeRef.current) return
    didResumeRef.current = true
    if (view !== 'list' || thread) return
    const last = readLastAbySession()
    if (last?.id) void openSession(last.id, last.title || 'Conversación')
  }, [view, thread, openSession])

  const requestDeleteSession = useCallback(
    (sessionId: string, title: string, e?: React.MouseEvent) => {
      e?.stopPropagation()
      if (!sessionId) return
      setPendingDelete({ id: sessionId, title: title || 'esta conversación' })
    },
    [],
  )

  const confirmDeleteSession = useCallback(async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.delete(`/chat/sessions/${pendingDelete.id}`)
      setSessions((prev) => prev.filter((s) => s.id !== pendingDelete.id))
      setThread((t) => {
        if (t?.sessionId === pendingDelete.id) {
          if (isWorkspace) {
            return {
              sessionId: '',
              title: 'Nueva conversación',
              messages: [],
              loading: false,
              steps: [],
            }
          }
          setView('list')
          return null
        }
        return t
      })
      setPendingDelete(null)
    } catch {
      /* ignore */
    } finally {
      setDeleting(false)
    }
  }, [pendingDelete, isWorkspace])

  const backToList = useCallback(() => {
    if (isWorkspace) {
      setSidebarOpen(true)
      return
    }
    setView('list')
    setThread(null)
    // Keep staged share embeds so user can pick another conversation.
    // Sessions reload via the list-view effect (silent if we already have rows).
  }, [isWorkspace])

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    setUploading(true)
    try {
      const uploaded: PendingFile[] = []
      for (const file of list) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('folder', 'aby')
        const { data } = await api.post('/upload', fd)
        const url = data?.url || data?.data?.url
        if (!url) continue
        uploaded.push({
          url,
          name: file.name,
          mime_type: file.type || data?.data?.mime_type || '',
          size: file.size,
          preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        })
      }
      if (uploaded.length) setPendingFiles((prev) => [...prev, ...uploaded])
    } finally {
      setUploading(false)
    }
  }, [])

  const sendMessage = useCallback(async (overrideText?: string, retry?: AbyRetry) => {
    const typed = (retry?.text ?? overrideText ?? input).trim()
    if (
      (!typed && !retry && pendingFiles.length === 0 && pendingEmbeds.length === 0) ||
      !thread ||
      thread.loading ||
      uploading
    )
      return

    // Explicit aceptar / rechazar (texto o voz ya tipada) aplica la preview.
    const pendingIds = pendingProposalIdsRef.current
    if (!retry && typed && pendingIds.length) {
      const decision = matchProposalDecision(typed)
      if (decision) {
        setInput('')
        void decideProposalRef.current(pendingIds, decision === 'approve')
        return
      }
    }

    const msg =
      typed ||
      (pendingEmbeds.length ? 'Revisa el registro adjunto.' : 'Revisa los archivos adjuntos.')
    const files = retry ? retry.files : pendingFiles
    const embeds = retry ? retry.embeds : pendingEmbeds
    const isLive = liveModeRef.current
    if (!retry) {
      setInput('')
      setPendingFiles([])
      setPendingEmbeds([])
    }
    if (isLive) {
      // Avoid mic feedback while Aby speaks / processes.
      stopDictation()
      stopSpeaking()
      speakingRef.current = false
      setSpeaking(false)
    }

    const isFirst = thread.messages.length === 0
    const title = isFirst ? (msg.length > 40 ? msg.slice(0, 40) + '…' : msg) : thread.title
    const sessionId = thread.sessionId || crypto.randomUUID()

    setThread({
      ...thread,
      title,
      sessionId,
      // Retry continues the same thread: the user bubble is already there and
      // the failed-turn notice gives way to the new attempt.
      messages: retry
        ? thread.messages.filter((m) => !m.error)
        : [...thread.messages, { role: 'user', content: msg, attachments: files, embeds }],
      loading: true,
      steps: [],
    })

    let didSpeak = false
    const pushRecoveringStep = (label: string) => {
      setThread((t) => {
        if (!t || !t.loading) return t
        const step: AgentStep = { content: label, kind: 'thinking' }
        const prev = t.steps || []
        const last = prev[prev.length - 1]
        if (last?.content === label) return t
        return { ...t, steps: [...prev, step].slice(-12) }
      })
    }

    const applySuccess = (data: AbySendSuccess) => {
      const sid = data.session_id || sessionId
      rememberAbySession(sid, title)
      const reply = typeof data.message === 'string' ? data.message : ''
      // Local / Claude Code proxy: org chose free inference — no usage debit.
      if (data.sparks_apply !== false) usageCap?.onReplySpent()
      const suggested = data.suggested_guide
      setThread((t) =>
        t
          ? {
              ...t,
              sessionId: sid,
              messages: [
                ...t.messages.filter((m) => m.role !== 'activity'),
                {
                  role: 'ai',
                  content: reply,
                  fresh: true,
                  images: data.images,
                  proposals: data.proposals || [],
                  embeds: data.embeds || [],
                  suggestedGuide: suggested,
                },
              ],
              loading: false,
              steps: [],
            }
          : t,
      )
      // Auto-start high-confidence how-to tours (AccessGate already filtered catalog).
      if (suggested?.id && (suggested.confidence ?? 0) >= 0.85) {
        const guide = abyGuidance.listGuides().find((g) => g.id === suggested.id)
        if (guide) {
          requestChatWidgetMinimize()
          void abyGuidance.startGuide(guide.id).catch(() => {})
        }
      }
      if (isLive && reply) {
        didSpeak = true
        speakLive(stripMarkdownLite(reply))
      }
    }

    const postOnce = () =>
      api.post(
        '/chat/send',
        {
          message: msg,
          session_id: sessionId,
          live: isLive || undefined,
          attachments: [
            ...files.map(({ url, name, mime_type, size }) => ({
              url,
              name,
              mime_type,
              size,
            })),
            ...embeds,
          ],
          guides: abyGuidance.listGuides().map(({ id, title, description, intents }) => ({
            id,
            title,
            description,
            intents,
          })),
        },
        {
          // Bulk ERP turns + CDN; client bound high so we can recover via poll.
          timeout: 180_000,
        },
      )

    try {
      let data: AbySendSuccess | null = null
      try {
        const res = await postOnce()
        if (res.data?.success) data = res.data as AbySendSuccess
      } catch (err) {
        if (!isAbyTransportError(err) && !isAbyStillProcessing(err)) throw err
        // CDN/proxy often drops the body while the server keeps working.
        pushRecoveringStep('Conexión interrumpida — recuperando respuesta del servidor…')
        data = await pollAbyAssistantReply({
          sessionId,
          userMessage: msg,
          timeoutMs: 180_000,
          onTick: (elapsed) => {
            if (elapsed > 8_000 && elapsed < 12_000) {
              pushRecoveringStep('Sigue procesando en el servidor…')
            } else if (elapsed > 60_000 && elapsed < 65_000) {
              pushRecoveringStep('Tarea larga — esperando a que termine…')
            }
          },
        })
        if (!data) {
          pushRecoveringStep('Reintentando automáticamente…')
          try {
            const res2 = await postOnce()
            if (res2.data?.success) data = res2.data as AbySendSuccess
          } catch (err2) {
            if (isAbyStillProcessing(err2) || isAbyTransportError(err2)) {
              pushRecoveringStep('Esperando fin del turno en curso…')
              data = await pollAbyAssistantReply({
                sessionId,
                userMessage: msg,
                timeoutMs: 120_000,
              })
            } else {
              throw err2
            }
          }
        }
      }

      if (data?.success) {
        applySuccess(data)
      } else {
        throw new Error('empty_aby_response')
      }
    } catch (err) {
      // The server names the cause (session, usage limit, provider down, tool);
      // transport cuts fall back to the local wording. Either way the turn can
      // be retried in place.
      const turnErr = abyTurnErrorOf(err)
      const errMsg = turnErr?.message || friendlyAbyError(err)
      setThread((t) =>
        t
          ? {
              ...t,
              messages: [
                ...t.messages.filter((m) => m.role !== 'activity'),
                {
                  role: 'ai',
                  content: errMsg,
                  error: turnErr ?? { code: 'transport', message: errMsg, actions: ['retry'] },
                  retry: { text: msg, files, embeds },
                },
              ],
              loading: false,
              steps: [],
            }
          : t,
      )
      if (isLive) {
        didSpeak = true
        speakLive(errMsg)
      }
    } finally {
      // Mic resume is owned by speakLive onEnd (after TTS). If we didn't speak,
      // resume listening here so live mode doesn't stall.
      if (isLive && liveModeRef.current && !didSpeak) {
        window.setTimeout(() => {
          if (
            !liveModeRef.current ||
            speakingRef.current ||
            isSpeaking() ||
            useAbyLiveStore.getState().micMuted
          ) {
            return
          }
          startDictation()
        }, 400)
      }
    }
  }, [input, thread, pendingFiles, pendingEmbeds, uploading, startDictation, stopDictation, speakLive])

  // Envía la pregunta pendiente cuando la conversación nueva ya está montada.
  useEffect(() => {
    const text = autoSendRef.current
    if (!text || !thread || thread.sessionId || thread.messages.length || thread.loading) return
    autoSendRef.current = null
    void sendMessage(text)
  }, [thread, sendMessage])


  sendMessageRef.current = (overrideText?: string) => sendMessage(overrideText)

  const navigate = useNavigate()
  const [reconnectFor, setReconnectFor] = useState<Message | null>(null)
  const onErrorAction = useCallback(
    (action: AbyTurnErrorAction, msg: Message) => {
      switch (action) {
        case 'retry':
          if (msg.retry) void sendMessage(undefined, msg.retry)
          return
        case 'new_thread':
          startNew()
          return
        case 'reconnect':
          if (isClaudeProvider(msg.error?.provider)) {
            setReconnectFor(msg)
            return
          }
          requestChatWidgetMinimize()
          void navigate({ to: '/organization/ai' })
          return
        default:
          // Session and provider both live in the org AI settings.
          requestChatWidgetMinimize()
          void navigate({ to: '/organization/ai' })
      }
    },
    [sendMessage, startNew, navigate],
  )

  const decideProposals = useCallback(
    async (proposalIds: string[], approve: boolean) => {
      const ids = [...new Set(proposalIds.filter(Boolean))]
      if (!ids.length) return
      setDecidingId(ids.length === 1 ? ids[0]! : 'batch')
      // Mute while deciding so "aceptar" / noise doesn't spawn another turn.
      stopDictation()
      setMicMuted(true)
      listenGateUntilRef.current = Date.now() + 2_500
      if (approve) {
        setThread((t) => (t ? { ...t, loading: true, steps: [] } : t))
      }
      try {
        const { data } =
          ids.length === 1
            ? await api.post(`/chat/proposals/${ids[0]}/decide`, { approve })
            : await api.post(`/chat/proposals/decide-batch`, { ids, approve })

        const updatedOne = data?.proposal as AbyProposal | undefined
        const updatedMany = (data?.proposals as AbyProposal[] | undefined) || []
        const idSet = new Set(ids)
        const follow = data?.follow_up as
          | {
              message?: string
              proposals?: AbyProposal[]
              embeds?: ChatAttachment[]
              images?: { url: string; caption: string }[]
            }
          | undefined
        const status = approve ? 'approved' : 'rejected'
        const suffix =
          ids.length > 1
            ? approve
              ? `\n\n✅ Plan aplicado (${ids.length} cambios).`
              : `\n\n❌ Plan rechazado (${ids.length}).`
            : approve
              ? '\n\n✅ Acción aplicada.'
              : '\n\n❌ Acción rechazada.'

        setThread((t) => {
          if (!t) return t
          let messages = t.messages.map((m) => {
            if (!m.proposals?.some((p) => idSet.has(p.id))) return m
            return {
              ...m,
              proposals: m.proposals.map((p) => {
                if (!idSet.has(p.id)) return p
                const fromBatch = updatedMany.find((u) => u.id === p.id)
                const fromOne = updatedOne && updatedOne.id === p.id ? updatedOne : undefined
                return { ...p, ...(fromBatch || fromOne || {}), status }
              }),
              content: m.content.includes(suffix.trim()) ? m.content : m.content + suffix,
            }
          })
          if (approve && follow?.message) {
            messages = [
              ...messages,
              {
                role: 'ai' as const,
                content: follow.message,
                fresh: true,
                proposals: follow.proposals || [],
                embeds: follow.embeds,
                images: follow.images,
              },
            ]
            if (liveModeRef.current) {
              speakLive(stripMarkdownLite(follow.message))
            }
          }
          return { ...t, messages, loading: false, steps: [] }
        })
      } catch (err) {
        const ax = err as {
          response?: { data?: { message?: string; applied?: AbyProposal[]; applied_n?: number } }
        }
        const payload = ax.response?.data
        const msg = getApiErrorMessage(err, 'No se pudo aplicar el plan')
        const applied = payload?.applied || []
        const already = /already (approved|rejected|applied)/i.test(msg)
        if (already || applied.length) {
          const status = approve ? 'approved' : 'rejected'
          const doneIds = new Set(
            applied.length ? applied.map((p) => p.id).filter(Boolean) : ids,
          )
          setThread((t) => {
            if (!t) return t
            return {
              ...t,
              loading: false,
              messages: t.messages.map((m) => {
                if (!m.proposals?.some((p) => doneIds.has(p.id) || ids.includes(p.id))) return m
                return {
                  ...m,
                  proposals: m.proposals.map((p) =>
                    doneIds.has(p.id) || ids.includes(p.id) ? { ...p, status } : p,
                  ),
                }
              }),
            }
          })
          if (!already) toast.error(msg)
        } else {
          toast.error(msg)
          setThread((t) => (t ? { ...t, loading: false } : t))
        }
      } finally {
        setDecidingId(null)
      }
    },
    [speakLive, stopDictation, setMicMuted],
  )

  decideProposalRef.current = decideProposals


  // Result renderers (SDK registry) report interactions as actions.
  const onResultAction = useCallback(
    (action: string, payload?: unknown) => {
      if (action !== 'decide') return
      const { ids, approve } = payload as DecidePayload
      void decideProposals(ids, approve)
    },
    [decideProposals],
  )
  const isResultBusy = useCallback(
    (result: AgentResult) => {
      if (!decidingId) return false
      if (decidingId === 'batch') return result.kind === 'plan' || result.kind === 'proposal'
      const proposals = (result.proposals ?? (result.proposal ? [result.proposal] : [])) as AbyProposal[]
      return proposals.some((p) => p.id === decidingId)
    },
    [decidingId],
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  const deleteConfirmDialog = (
    <ConfirmDialog
      open={!!pendingDelete}
      onOpenChange={(open) => {
        if (!open && !deleting) setPendingDelete(null)
      }}
      title='¿Borrar conversación?'
      desc={
        <p>
          Se eliminará{' '}
          <span className='font-semibold text-foreground'>
            {pendingDelete?.title || 'esta conversación'}
          </span>{' '}
          y su historial. Esta acción no se puede deshacer.
        </p>
      }
      cancelBtnText='Cancelar'
      confirmText='Borrar'
      destructive
      isLoading={deleting}
      handleConfirm={() => void confirmDeleteSession()}
    />
  )

  if (!isWorkspace && view === 'list') {
    return (
      <>
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <div className='flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-3 py-2'>
          <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
            Conversaciones
          </p>
          <Button
            size='sm'
            variant='secondary'
            className='h-8 gap-1.5 text-xs'
            onClick={startNew}
          >
            <MessageSquarePlus className='h-3.5 w-3.5' />
            Nueva
          </Button>
        </div>
        {(pendingEmbeds.length > 0 || pendingFiles.length > 0) && (
          <div className='shrink-0 space-y-1.5 border-b bg-emerald-500/5 px-3 py-2'>
            <p className='text-[11px] font-medium text-emerald-800 dark:text-emerald-300'>
              Adjunto listo — elige una conversación o Nueva
            </p>
            {pendingEmbeds.length > 0 && <ChatEmbedList attachments={pendingEmbeds} />}
            {pendingFiles.length > 0 && (
              <p className='text-[10px] text-muted-foreground'>
                {pendingFiles.length} archivo{pendingFiles.length > 1 ? 's' : ''}
              </p>
            )}
            <button
              type='button'
              className='text-[10px] text-muted-foreground underline'
              onClick={() => {
                setPendingEmbeds([])
                setPendingFiles([])
                setInput('')
              }}
            >
              Quitar adjuntos
            </button>
          </div>
        )}
        <div className='min-h-0 flex-1 overflow-y-auto'>
          {sessionsLoading ? (
            <ul className='divide-y' aria-busy='true' aria-label='Cargando conversaciones'>
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className='px-3 py-2.5'>
                  <div className='flex items-center justify-between gap-2'>
                    <Skeleton className='h-3.5 w-36' />
                    <Skeleton className='h-3 w-10' />
                  </div>
                  <Skeleton
                    className={cn('mt-1.5 h-3', i % 2 === 0 ? 'w-[85%]' : 'w-[60%]')}
                  />
                </li>
              ))}
            </ul>
          ) : sessions.length === 0 ? (
            <div className='flex flex-col items-center gap-3 px-4 py-14 text-center text-muted-foreground'>
              <Mascot skin={mascotSkin} size={56} state={mascotFace} />
              <div>
                <p className='text-sm font-medium text-foreground'>Habla con {mascotName || 'Aby'}</p>
                <p className='mt-1 text-xs'>Consultas, crear registros, analizar datos…</p>
              </div>
              <Button size='sm' className='mt-1 gap-1.5' onClick={startNew}>
                <Plus className='h-3.5 w-3.5' />
                Nueva conversación
              </Button>
            </div>
          ) : (
            <ul className='divide-y divide-border/40'>
              {sessions.map((s) => (
                <li key={s.id} className='group flex items-stretch'>
                  <button
                    type='button'
                    onClick={() => void openSession(s.id, s.title)}
                    className='min-w-0 flex-1 px-3 py-2.5 text-left transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:outline-none'
                  >
                    <div className='flex items-center justify-between gap-2'>
                      <span className='truncate text-sm font-medium'>
                        {s.title || 'Sin título'}
                      </span>
                      {s.updated_at && (
                        <span className='shrink-0 text-[10px] text-muted-foreground'>
                          {formatDistanceToNow(new Date(s.updated_at), {
                            addSuffix: true,
                            locale: es,
                          })}
                        </span>
                      )}
                    </div>
                    <p className='mt-0.5 line-clamp-1 text-xs text-muted-foreground'>
                      {stripMarkdownLite(scrubToolDump(s.last_message || '')) || 'Sin mensajes'}
                    </p>
                  </button>
                  <button
                    type='button'
                    title='Borrar conversación'
                    aria-label={`Borrar conversación ${s.title || 'Sin título'}`}
                    onClick={(e) => requestDeleteSession(s.id, s.title || 'Sin título', e)}
                    className={cn(
                      'px-2.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
                      // Touch / narrow: always visible (no hover on mobile).
                      // Desktop: reveal on row hover / keyboard focus.
                      'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
                    )}
                  >
                    <Trash2 className='h-3.5 w-3.5' />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {deleteConfirmDialog}
      </>
    )
  }

  const isEmptyThread =
    !!thread && thread.messages.length === 0 && !thread.loading

  if (isWorkspace) {
    const workspaceComposer = thread ? (
      <div className={AGENT_CAPSULE}>
        {pendingFiles.length > 0 && (
          <div className='flex flex-wrap gap-1.5 px-3 pt-2'>
            {pendingFiles.map((f, i) => {
              const thumb = attachmentThumb(f)
              return (
                <span
                  key={i}
                  className='group inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-[10px]'
                >
                  {thumb ? (
                    <img src={thumb} alt='' className='h-6 w-6 rounded object-cover' />
                  ) : (
                    <FileSpreadsheet className='h-3 w-3' />
                  )}
                  <span className='max-w-[7rem] truncate'>{f.name}</span>
                  <button
                    type='button'
                    className='rounded p-0.5 opacity-60 hover:opacity-100'
                    onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className='h-2.5 w-2.5' />
                  </button>
                </span>
              )
            })}
          </div>
        )}
        {pendingEmbeds.length > 0 && (
          <div className='flex flex-col gap-1 px-3 pt-2'>
            <ChatEmbedList attachments={pendingEmbeds} />
            <button
              type='button'
              className='self-start text-[10px] text-muted-foreground underline'
              onClick={() => setPendingEmbeds([])}
            >
              Quitar adjuntos
            </button>
          </div>
        )}
        <div className='flex items-end gap-1 px-2 py-2'>
          <input
            ref={fileRef}
            type='file'
            className='hidden'
            multiple
            accept='image/*,.pdf,.xls,.xlsx,.csv,.txt,.doc,.docx'
            onChange={(e) => {
              if (e.target.files) void uploadFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <Button
            size='icon'
            variant='ghost'
            type='button'
            className='h-9 w-9 shrink-0 rounded-full'
            title='Adjuntar'
            disabled={thread.loading || uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip className='h-4 w-4' />
          </Button>
          <Button
            size='icon'
            variant='ghost'
            type='button'
            className={cn(
              'h-9 w-9 shrink-0 rounded-full',
              liveMode && 'bg-primary/10 text-primary',
            )}
            title={liveMode ? 'Desactivar live' : 'Modo live'}
            disabled={thread.loading}
            onClick={() => {
              setLiveMode((v) => {
                if (v) {
                  stopDictation()
                  stopSpeaking()
                  stopVoiceLevels()
                  setMicMuted(false)
                  setInterimSpeech('')
                  setSpeaking(false)
                  speakingRef.current = false
                }
                return !v
              })
            }}
          >
            <AudioLines className={cn('h-4 w-4', liveMode && 'animate-pulse')} />
          </Button>
          <Button
            size='icon'
            variant='ghost'
            type='button'
            className={cn(
              'h-9 w-9 shrink-0 rounded-full',
              liveMode && micMuted && 'bg-destructive/10 text-destructive',
              !liveMode && aiListening && 'text-destructive',
            )}
            title={liveMode ? (micMuted ? 'Encender mic' : 'Apagar mic') : 'Dictar'}
            disabled={thread.loading}
            onClick={() => {
              if (liveMode) {
                setMicMuted(!micMuted)
                return
              }
              toggleAiDictation()
            }}
          >
            {liveMode ? (
              micMuted || !aiListening ? (
                <MicOff className='h-4 w-4' />
              ) : (
                <Mic className='h-4 w-4' />
              )
            ) : aiListening ? (
              <MicOff className='h-4 w-4' />
            ) : (
              <Mic className='h-4 w-4' />
            )}
          </Button>
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={input}
            rows={1}
            onChange={(e) => {
              setInput(e.target.value)
              const el = e.target
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`
            }}
            onKeyDown={handleKeyDown}
            onPaste={(e) => {
              const items = e.clipboardData?.items
              if (!items) return
              const files: File[] = []
              for (const item of Array.from(items)) {
                if (item.kind === 'file') {
                  const f = item.getAsFile()
                  if (f) files.push(f)
                }
              }
              if (files.length) {
                e.preventDefault()
                void uploadFiles(files)
              }
            }}
            placeholder={
              uploading
                ? 'Subiendo…'
                : liveMode
                  ? 'Live activo — habla o escribe…'
                  : `Mensaje a ${mascotName || 'Aby'}…`
            }
            disabled={thread.loading}
            className='max-h-40 min-h-[40px] min-w-0 flex-1 resize-none bg-transparent py-2.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50'
          />
          <Button
            size='icon'
            className='h-9 w-9 shrink-0 rounded-full'
            onClick={() => void sendMessage()}
            disabled={
              thread.loading ||
              uploading ||
              (!input.trim() && pendingFiles.length === 0 && pendingEmbeds.length === 0)
            }
          >
            <Send className='h-4 w-4' />
          </Button>
        </div>
      </div>
    ) : null

    return (
      <>
        <div className={cn('flex min-h-0 flex-1', className)}>
          <AgentWorkspaceChrome
            mascotName={mascotName || 'Aby'}
            mascotSkin={mascotSkin}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            sessions={sessions}
            sessionsLoading={sessionsLoading}
            activeSessionId={thread?.sessionId || ''}
            onNewChat={startNew}
            onOpenSession={(id, title) => void openSession(id, title)}
            onDeleteSession={requestDeleteSession}
            isEmpty={isEmptyThread}
            onSuggestion={(text) => void sendMessage(text)}
            composer={workspaceComposer}
          >
            <div
              className='min-h-0 flex-1 overflow-y-auto overscroll-contain pb-36'
              ref={scrollRef}
            >
              {thread ? (
                <div className='mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6'>
                  {thread.messages.map((msg, i) =>
                    msg.role === 'activity' ? null : (
                      <div
                        key={i}
                        className={cn(
                          'text-sm leading-relaxed',
                          AGENT_ENTER,
                          msg.role === 'user'
                            ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground shadow-[0_10px_28px_-14px_var(--primary)]'
                            : 'w-full text-foreground',
                        )}
                      >
                        {msg.role === 'ai' ? (
                          <div className='flex gap-3'>
                            <div className='mt-0.5 shrink-0'>
                              <Mascot skin={mascotSkin} size={28} />
                            </div>
                            <div className='min-w-0 flex-1'>
                              {msg.error ? (
                                <AbyTurnErrorNotice
                                  msg={msg}
                                  busy={thread.loading}
                                  onAction={onErrorAction}
                                />
                              ) : (
                                <AiReply content={msg.content} fresh={msg.fresh} />
                              )}
                              {msg.images?.map((img, j) => (
                                <img
                                  key={j}
                                  src={img.url}
                                  alt={img.caption}
                                  className='mt-2 max-w-full rounded-lg'
                                />
                              ))}
                              <AgentResults
                                results={agentResultsOf({
                                  embeds: msg.embeds,
                                  proposals: msg.proposals,
                                  guide: msg.suggestedGuide
                                    ? abyGuidance
                                        .listGuides()
                                        .find((item) => item.id === msg.suggestedGuide?.id)
                                    : thread.messages[i - 1]?.role === 'user'
                                      ? abyGuidance.findGuide(thread.messages[i - 1]!.content)
                                      : undefined,
                                })}
                                onAction={onResultAction}
                                busyFor={isResultBusy}
                              />
                            </div>
                          </div>
                        ) : (
                          <>
                            {msg.content}
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className='mt-2 flex flex-wrap gap-1.5'>
                                {msg.attachments.map((f, j) => {
                                  const thumb = attachmentThumb(f)
                                  return (
                                    <span
                                      key={j}
                                      className='inline-flex items-center gap-1 rounded-md bg-background/40 px-1.5 py-0.5 text-[10px]'
                                    >
                                      {thumb ? (
                                        <img
                                          src={thumb}
                                          alt=''
                                          className='h-8 w-8 rounded object-cover'
                                        />
                                      ) : (
                                        <FileSpreadsheet className='h-3 w-3' />
                                      )}
                                      <span className='max-w-[8rem] truncate'>{f.name}</span>
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                            {msg.embeds && msg.embeds.length > 0 && (
                              <ChatEmbedList attachments={msg.embeds} className='mt-2' />
                            )}
                          </>
                        )}
                      </div>
                    ),
                  )}
                  {thread.loading && (
                    <div className='flex items-start gap-2.5'>
                      <Mascot skin={mascotSkin} size={28} state={mascotFace} />
                      <AgentTrail steps={thread.steps || []} live={liveMode} />
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </AgentWorkspaceChrome>
        </div>
        {deleteConfirmDialog}
      </>
    )
  }

  return (
    <>
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className='flex shrink-0 items-center gap-1 border-b border-border/40 px-2 py-1.5'>
        <Button
          size='icon'
          variant='ghost'
          className='h-8 w-8 shrink-0'
          title='Conversaciones'
          onClick={backToList}
        >
          <ArrowLeft className='h-4 w-4' />
        </Button>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-sm font-medium'>{thread?.title || mascotName}</p>
        </div>
        <Button
          size='icon'
          variant='ghost'
          className='h-8 w-8 shrink-0'
          title='Nueva conversación'
          onClick={startNew}
        >
          <Plus className='h-4 w-4' />
        </Button>
        {thread?.sessionId ? (
          <Button
            size='icon'
            variant='ghost'
            className='h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive'
            title='Borrar conversación'
            onClick={() =>
              requestDeleteSession(thread.sessionId, thread.title || 'Sin título')
            }
          >
            <Trash2 className='h-3.5 w-3.5' />
          </Button>
        ) : null}
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain' ref={scrollRef}>
        {thread ? (
          <div className='flex flex-col gap-3 p-4'>
            {thread.messages.length === 0 && !thread.loading && (
              <div className='flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground'>
                <Mascot skin={mascotSkin} size={48} state={mascotFace} />
                <p className='text-center text-sm'>
                  Escribe tu tarea o pregunta.
                  <br />
                  <span className='text-xs'>Puedo consultar datos, crear registros, analizar y más.</span>
                </p>
              </div>
            )}
            {thread.messages.map((msg, i) =>
              msg.role === 'activity' ? null : (
                <div
                  key={i}
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                    AGENT_ENTER,
                    msg.role === 'user'
                      ? 'ml-auto rounded-br-md bg-primary text-primary-foreground shadow-[0_8px_22px_-14px_var(--primary)]'
                      : cn(AGENT_CARD, 'rounded-bl-md'),
                  )}
                >
                  {msg.role === 'ai' ? (
                    msg.error ? (
                      <AbyTurnErrorNotice msg={msg} busy={thread.loading} onAction={onErrorAction} />
                    ) : (
                      <AiReply content={msg.content} fresh={msg.fresh} />
                    )
                  ) : (
                    msg.content
                  )}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className='mt-2 flex flex-wrap gap-1.5'>
                      {msg.attachments.map((f, j) => {
                        const thumb = attachmentThumb(f)
                        return (
                        <span
                          key={j}
                          className='inline-flex items-center gap-1 rounded-md bg-background/40 px-1.5 py-0.5 text-[10px]'
                        >
                          {thumb ? (
                            <img src={thumb} alt='' className='h-8 w-8 rounded object-cover' />
                          ) : (
                            <FileSpreadsheet className='h-3 w-3' />
                          )}
                          <span className='max-w-[8rem] truncate'>{f.name}</span>
                        </span>
                        )
                      })}
                    </div>
                  )}
                  {msg.role === 'user' && msg.embeds && msg.embeds.length > 0 && (
                    <ChatEmbedList attachments={msg.embeds} className='mt-2' />
                  )}
                  {msg.images?.map((img, j) => (
                    <img key={j} src={img.url} alt={img.caption} className='mt-2 max-w-full rounded-lg' />
                  ))}
                  {msg.role === 'ai' && (
                    <AgentResults
                      results={agentResultsOf({
                        embeds: msg.embeds,
                        proposals: msg.proposals,
                        // Only the server decides teach vs do: a local findGuide
                        // fallback offered a tour for "crear un cliente" (a DO).
                        guide: msg.suggestedGuide
                          ? abyGuidance.listGuides().find((item) => item.id === msg.suggestedGuide?.id)
                          : undefined,
                      })}
                      onAction={onResultAction}
                      busyFor={isResultBusy}
                    />
                  )}
                </div>
              ),
            )}
            {thread.loading && (
              <div className='flex items-start gap-2.5'>
                <Mascot skin={mascotSkin} size={28} state={mascotFace} />
                <AgentTrail steps={thread.steps || []} live={liveMode} />
              </div>
            )}
          </div>
        ) : null}
      </div>

      {thread && (
        <div className='flex shrink-0 flex-col gap-1.5 px-2.5 pb-2.5 pt-1.5'>
          {pendingFiles.length > 0 && (
            <div className='flex flex-wrap gap-1.5'>
              {pendingFiles.map((f, i) => {
                const thumb = attachmentThumb(f)
                return (
                <span
                  key={i}
                  className='group inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-[10px]'
                >
                  {thumb ? (
                    <img src={thumb} alt='' className='h-6 w-6 rounded object-cover' />
                  ) : (
                    <FileSpreadsheet className='h-3 w-3' />
                  )}
                  <span className='max-w-[7rem] truncate'>{f.name}</span>
                  <button
                    type='button'
                    className='rounded p-0.5 opacity-60 hover:opacity-100'
                    onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className='h-2.5 w-2.5' />
                  </button>
                </span>
                )
              })}
            </div>
          )}
          {pendingEmbeds.length > 0 && (
            <div className='flex flex-col gap-1'>
              <ChatEmbedList attachments={pendingEmbeds} />
              <button
                type='button'
                className='self-start text-[10px] text-muted-foreground underline'
                onClick={() => setPendingEmbeds([])}
              >
                Quitar adjuntos
              </button>
            </div>
          )}
          <div className={cn('flex items-center gap-1.5 rounded-2xl px-1.5 py-1', AGENT_CAPSULE)}>
            <input
              ref={fileRef}
              type='file'
              className='hidden'
              multiple
              accept='image/*,.pdf,.xls,.xlsx,.csv,.txt,.doc,.docx'
              onChange={(e) => {
                if (e.target.files) void uploadFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <Button
              size='icon'
              variant='ghost'
              type='button'
              className='h-8 w-8 shrink-0'
              title='Adjuntar imagen o Excel'
              disabled={thread.loading || uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className='h-4 w-4' />
            </Button>
            <Button
              size='icon'
              variant='ghost'
              type='button'
              className={cn(
                'h-8 w-8 shrink-0',
                liveMode && 'text-primary bg-primary/10',
                liveMode && speaking && 'ring-2 ring-sky-500/40',
                liveMode &&
                  !micMuted &&
                  aiListening &&
                  !speaking &&
                  !thread.loading &&
                  'ring-2 ring-primary/40',
              )}
              title={
                ttsSupported()
                  ? liveMode
                    ? 'Desactivar modo live (voz)'
                    : 'Modo live: hablar y escuchar (voz Google)'
                  : 'Modo live (dictado; TTS no disponible en este navegador)'
              }
              disabled={thread.loading}
              onClick={() => {
                setLiveMode((v) => {
                  if (v) {
                    // Hard stop: leave live must release the mic immediately.
                    stopDictation()
                    stopSpeaking()
                    stopVoiceLevels()
                    setMicMuted(false)
                    setInterimSpeech('')
                    setSpeaking(false)
                    speakingRef.current = false
                  }
                  return !v
                })
              }}
            >
              <AudioLines
                className={cn(
                  'h-4 w-4',
                  liveMode &&
                    !micMuted &&
                    (aiListening || speaking || thread.loading) &&
                    'animate-pulse',
                )}
              />
            </Button>
            <Button
              size='icon'
              variant='ghost'
              type='button'
              className={cn(
                'h-8 w-8 shrink-0',
                liveMode && micMuted && 'text-destructive bg-destructive/10',
                !liveMode && aiListening && 'text-destructive',
              )}
              title={
                liveMode
                  ? micMuted
                    ? 'Encender micrófono'
                    : 'Apagar micrófono (live sigue activo)'
                  : 'Dictar (voz a texto)'
              }
              disabled={thread.loading}
              onClick={() => {
                if (liveMode) {
                  setMicMuted(!micMuted)
                  return
                }
                toggleAiDictation()
              }}
            >
              {liveMode ? (
                micMuted || !aiListening ? (
                  <MicOff className='h-4 w-4' />
                ) : (
                  <Mic className='h-4 w-4' />
                )
              ) : aiListening ? (
                <MicOff className='h-4 w-4' />
              ) : (
                <Mic className='h-4 w-4' />
              )}
            </Button>
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={(e) => {
                const items = e.clipboardData?.items
                if (!items) return
                const files: File[] = []
                for (const item of Array.from(items)) {
                  if (item.kind === 'file') {
                    const f = item.getAsFile()
                    if (f) files.push(f)
                  }
                }
                if (files.length) {
                  e.preventDefault()
                  void uploadFiles(files)
                }
              }}
              placeholder={
                uploading
                  ? 'Subiendo…'
                  : liveMode
                    ? speaking
                      ? `${mascotName || 'Aby'} está hablando…`
                      : thread.loading
                        ? `${mascotName || 'Aby'} pensando…`
                        : micMuted
                          ? 'Mic apagado — escribe o enciende el mic'
                          : aiListening
                            ? interimSpeech || 'Te escucho…'
                            : 'Live activo'
                    : aiListening
                      ? 'Escuchando…'
                      : 'Escribe, adjunta o dicta…'
              }
              disabled={thread.loading}
              className='min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50'
            />
            <Button
              size='icon'
              className='h-8 w-8 shrink-0 rounded-full'
              onClick={() => void sendMessage()}
              disabled={
                thread.loading ||
                uploading ||
                (!input.trim() && pendingFiles.length === 0 && pendingEmbeds.length === 0)
              }
            >
              <Send className='h-4 w-4' />
            </Button>
          </div>
        </div>
      )}
    </div>
    {deleteConfirmDialog}
    {ReconnectDialog && (
    <ReconnectDialog
      open={reconnectFor !== null}
      onOpenChange={(o) => {
        if (!o) setReconnectFor(null)
      }}
      onConnected={() => {
        const m = reconnectFor
        void queryClient.invalidateQueries({ queryKey: ['organization'] })
        if (m?.retry) void sendMessage(undefined, m.retry)
      }}
    />
    )}
    </>
  )
}

function normalizeAbyMarkdown(content: string): string {
  let s = content.replace(/\r\n/g, '\n')
  // Drop leaked Go fmt map dumps (legacy bad fallbacks).
  if (s.includes('map[') && (s.includes('columns:') || s.includes('map[name:'))) {
    s = s
      .split('\n')
      .filter((line) => !line.includes('map[') || (!line.includes('columns:') && !line.includes('map[name:')))
      .join('\n')
      .trim()
    if (!s) s = 'Consulté el sistema. ¿Quieres que continúe con el siguiente paso?'
  }
  // Line-start bullets (• ● ▪) → GFM "- "
  s = s.replace(/^[\t ]*[•●▪◦]\s+/gm, '- ')
  // Inline " • item" piles → one item per line
  s = s.replace(/([^\n])\s+[•●▪◦]\s+/g, '$1\n- ')
  // Blank line before a list so GFM parses it
  s = s.replace(/([^\n])\n(- )/g, '$1\n\n$2')
  return s
}

/** A failed turn: the specific cause and the buttons that recover from it. */
function AbyTurnErrorNotice({
  msg,
  busy,
  onAction,
}: {
  msg: Message
  busy: boolean
  onAction: (action: AbyTurnErrorAction, msg: Message) => void
}) {
  const err = msg.error!
  const actions = err.actions.filter((a) => a !== 'retry' || msg.retry)
  return (
    <div role='alert' className='space-y-2'>
      <div className='flex items-start gap-2 text-foreground'>
        <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-[color:var(--warning)]' aria-hidden />
        <p className='m-0'>{err.message}</p>
      </div>
      {actions.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {actions.map((a, i) => (
            <Button
              key={a}
              size='sm'
              variant={i === 0 ? 'default' : 'outline'}
              className='h-7 gap-1.5 px-2.5 text-xs'
              disabled={busy}
              onClick={() => onAction(a, msg)}
            >
              {a === 'retry' ? (
                <RotateCcw className='h-3.5 w-3.5' />
              ) : a === 'new_thread' ? (
                <MessageSquarePlus className='h-3.5 w-3.5' />
              ) : (
                <Plug className='h-3.5 w-3.5' />
              )}
              {abyErrorActionLabel(a, err)}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * A reply as it lands: typed in when fresh (see useRevealText), with a caret
 * after the last block until it's complete. Keeps the thread pinned to the
 * bottom while it grows, unless the user scrolled up to read.
 */
function AiReply({ content, fresh }: { content: string; fresh?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const { text, revealing } = useRevealText(content, !!fresh, () => {
    const scroller = ref.current?.closest<HTMLElement>('.overflow-y-auto')
    if (!scroller) return
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 160
    if (nearBottom) scroller.scrollTop = scroller.scrollHeight
  })
  return (
    <div ref={ref}>
      <AiMarkdown
        content={text}
        className={cn(
          revealing &&
            "[&>:last-child]:after:ml-0.5 [&>:last-child]:after:inline-block [&>:last-child]:after:animate-pulse [&>:last-child]:after:font-light [&>:last-child]:after:text-primary [&>:last-child]:after:content-['▍']",
        )}
      />
    </div>
  )
}

function AiMarkdown({ content, className }: { content: string; className?: string }) {
  const navigate = useNavigate()
  const normalized = normalizeAbyMarkdown(scrubToolDump(content))
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none break-words prose-p:my-1 prose-headings:mt-2 prose-headings:mb-1 prose-ul:my-1.5 prose-ul:list-disc prose-ul:pl-5 prose-ol:my-1.5 prose-ol:list-decimal prose-ol:pl-5 prose-li:my-0.5 prose-li:leading-snug prose-pre:my-1.5 prose-pre:bg-background/40 prose-pre:p-2 prose-pre:rounded-md prose-pre:text-xs prose-code:before:content-none prose-code:after:content-none prose-code:bg-background/30 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-mono prose-a:text-primary prose-a:underline prose-a:underline-offset-2 prose-table:my-1 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-hr:my-2', className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          ul: ({ children, ...rest }) => (
            <ul {...rest} className='my-1.5 list-disc space-y-1 pl-5'>
              {children}
            </ul>
          ),
          ol: ({ children, ...rest }) => (
            <ol {...rest} className='my-1.5 list-decimal space-y-1 pl-5'>
              {children}
            </ol>
          ),
          li: ({ children, ...rest }) => (
            <li {...rest} className='leading-snug'>
              {children}
            </li>
          ),
          a: ({ href, children, ...rest }) => {
            const path = (href || '').replace(/^\/app(?=\/)/, '')
            const record = path.match(/^\/m\/([^/]+)\/([^/?#]+)/)
            if (record) {
              return (
                <a
                  {...rest}
                  href={href}
                  onClick={(e) => {
                    e.preventDefault()
                    void navigate({
                      to: '/m/$model/$id',
                      params: { model: record[1], id: record[2] },
                    })
                  }}
                >
                  {children}
                </a>
              )
            }
            const viewMatch = path.match(/^\/m\/([^/]+)\/?$/)
            if (viewMatch) {
              return (
                <a
                  {...rest}
                  href={href}
                  onClick={(e) => {
                    e.preventDefault()
                    void navigate({
                      to: '/m/$model',
                      params: { model: viewMatch[1] },
                    })
                  }}
                >
                  {children}
                </a>
              )
            }
            return (
              <a {...rest} href={href} target='_blank' rel='noreferrer'>
                {children}
              </a>
            )
          },
        }}
      >
        {normalized}
      </Markdown>
    </div>
  )
}

const iconColors: Record<string, string> = {
  search: 'text-blue-400',
  database: 'text-emerald-400',
  brain: 'text-purple-400',
  // Recibí tu solicitud — verde “aceptado”, no ámbar genérico.
  sparkles: 'text-emerald-400',
  'bar-chart-3': 'text-orange-400',
  'plus-circle': 'text-green-400',
  pencil: 'text-yellow-400',
  'trash-2': 'text-red-400',
  'book-open': 'text-cyan-400',
  'package-search': 'text-emerald-400',
  'message-square': 'text-blue-300',
  calculator: 'text-amber-400',
  image: 'text-pink-400',
  'volume-2': 'text-indigo-400',
  'file-search': 'text-sky-400',
  'layout-grid': 'text-violet-400',
  // Pensando / herramientas — gris engranaje.
  cog: 'text-zinc-400',
  'shopping-cart': 'text-emerald-400',
  package: 'text-emerald-400',
  users: 'text-sky-400',
  'file-text': 'text-blue-400',
  warehouse: 'text-orange-400',
  banknote: 'text-green-400',
  user: 'text-violet-400',
  monitor: 'text-indigo-400',
  boxes: 'text-emerald-400',
  check: 'text-emerald-400',
}


function AgentTrail({ steps, live = false }: { steps: AgentStep[]; live?: boolean }) {
  const visible =
    steps.length > 0
      ? steps
      : [{ content: 'sparkles|Trabajando…', kind: 'thinking' as const }]
  return (
    <div
      className={cn(
        'max-w-[95%] rounded-lg border px-3 py-2 transition-colors duration-500',
        live
          ? 'border-emerald-500/25 bg-emerald-500/5'
          : 'border-border/60 bg-muted/40',
      )}
    >
      <div className='flex flex-col gap-1'>
        {visible.map((step, i) => {
          const isLast = i === visible.length - 1
          return (
            <div
              key={`${i}-${step.content.slice(0, 24)}`}
              className={cn(
                'transition-opacity duration-300',
                !isLast && 'opacity-55',
              )}
            >
              <ActivityLine content={step.content} pulse={isLast} kind={step.kind} />
            </div>
          )
        })}
      </div>
      {live && (
        <p className='mt-1.5 text-[10px] text-muted-foreground'>
          La respuesta por voz llega al terminar — mientras tanto ves cada paso.
        </p>
      )}
    </div>
  )
}

function ActivityLine({
  content,
  pulse = true,
  kind,
}: {
  content: string
  pulse?: boolean
  kind?: AgentStep['kind']
}) {
  const parts = content.split('|')
  const iconKey = parts.length > 1 ? parts[0] : 'cog'
  const message = parts.length > 1 ? parts[1] : content
  const IconComponent = resolveIcon(iconKey, Cog)
  const colorClass =
    iconColors[iconKey] ||
    iconColors[iconKey.replace(/_/g, '-')] ||
    (kind === 'tool_result' ? 'text-emerald-400' : 'text-zinc-400')

  return (
    <div className='flex items-center gap-2 text-xs text-muted-foreground'>
      <IconComponent
        className={cn(
          'h-3.5 w-3.5 shrink-0 transition-colors duration-500',
          colorClass,
          pulse && 'animate-pulse',
        )}
      />
      <span className={cn('transition-colors duration-300', pulse && 'animate-pulse')}>
        {message}
      </span>
    </div>
  )
}

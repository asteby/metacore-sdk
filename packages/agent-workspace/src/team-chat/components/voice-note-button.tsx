import { useCallback, useEffect, useRef, useState } from 'react'
import { Square, AudioLines } from 'lucide-react'
import { Button } from '@asteby/metacore-ui'
import { cn } from '@asteby/metacore-ui'
import { toast } from 'sonner'
import { api } from '../../host'
import { createLivePeakSampler, peaksFromArrayBuffer } from '../../lib/audio-waveform'
import type { ChatAttachment } from '../data/types'

/**
 * Click-to-toggle voice note via MediaRecorder → /upload.
 * Samples live peaks (WhatsApp-style) and stores them on the attachment.
 */
export function VoiceNoteButton({
  onReady,
  disabled,
  className,
}: {
  onReady: (file: ChatAttachment) => void
  disabled?: boolean
  className?: string
}) {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const samplerRef = useRef<ReturnType<typeof createLivePeakSampler> | null>(null)
  const startedAtRef = useRef(0)

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    samplerRef.current?.stop()
    samplerRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    mediaRef.current = null
    chunksRef.current = []
    setRecording(false)
    setElapsed(0)
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const stopAndUpload = useCallback(async () => {
    const rec = mediaRef.current
    if (!rec) return
    const livePeaks = samplerRef.current?.peaks() ?? []
    const durationSec = Math.max(0.5, (Date.now() - startedAtRef.current) / 1000)
    samplerRef.current?.stop()
    samplerRef.current = null

    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve()
      try {
        rec.stop()
      } catch {
        resolve()
      }
    })
    const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
    const tracks = streamRef.current
    tracks?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    mediaRef.current = null
    chunksRef.current = []
    setRecording(false)
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    setElapsed(0)

    if (blob.size < 800) {
      toast.error('Nota de voz demasiado corta')
      return
    }

    let waveform = livePeaks
    let duration = durationSec
    try {
      const decoded = await peaksFromArrayBuffer(await blob.arrayBuffer())
      if (decoded.peaks.length) waveform = decoded.peaks
      if (decoded.duration > 0) duration = decoded.duration
    } catch {
      /* keep live peaks */
    }

    const fd = new FormData()
    const filename = `voice_${Date.now()}.webm`
    fd.append('file', blob, filename)
    fd.append('folder', 'chat')
    try {
      const { data } = await api.post('/upload', fd)
      if (data?.data?.url) {
        onReady({
          url: data.data.url,
          name: filename,
          mime_type: data.data.mime_type || blob.type || 'audio/webm',
          size: data.data.size || blob.size,
          waveform,
          duration,
        })
      }
    } catch {
      toast.error('No se pudo subir la nota de voz')
    }
  }, [onReady])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Tu navegador no soporta notas de voz (usa Chrome)')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      samplerRef.current = createLivePeakSampler(stream)
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mediaRef.current = rec
      startedAtRef.current = Date.now()
      rec.start(250)
      setRecording(true)
      setElapsed(0)
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    } catch {
      toast.error('No se pudo acceder al micrófono')
      cleanup()
    }
  }, [cleanup])

  const toggle = useCallback(() => {
    if (recording) void stopAndUpload()
    else void start()
  }, [recording, start, stopAndUpload])

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <Button
      size='icon'
      type='button'
      variant='ghost'
      disabled={disabled}
      className={cn(
        'h-8 shrink-0 rounded-md',
        recording && 'text-destructive animate-pulse',
        className,
      )}
      title={recording ? `Detener (${mm}:${ss})` : 'Nota de voz'}
      onClick={toggle}
    >
      {recording ? (
        <Square size={16} className='fill-current' />
      ) : (
        <AudioLines size={18} className='stroke-muted-foreground' />
      )}
    </Button>
  )
}

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, ClipboardPaste, ExternalLink, Loader2 } from 'lucide-react'
import { Button, Input } from '@asteby/metacore-ui'
import { Modal } from '@asteby/metacore-ui/modal'
import { claudeConnectErrorCode, claudeConnectErrorKey, orgAIConfigQueryKey } from './api'
import { makeTr } from './i18n'
import type { ClaudeConnectApi, ClaudeConnectSession, TranslateFn } from './types'

type Step = 'checking' | 'install' | 'installing' | 'starting' | 'ready' | 'submitting' | 'success' | 'error'

export type ClaudeConnectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Data layer for the flow (see `createClaudeConnectApi`). */
  api: ClaudeConnectApi
  t?: TranslateFn
  /** Called once connected, after the config query is invalidated. */
  onConnected?: () => void
  /** Opens the sign-in URL. Defaults to `window.open` with noopener. */
  openUrl?: (url: string) => void
}

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function ClaudeConnectDialog({ open, onOpenChange, api, t, onConnected, openUrl }: ClaudeConnectDialogProps) {
  const tr = makeTr(t)
  const qc = useQueryClient()
  const [step, setStep] = useState<Step>('checking')
  const [session, setSession] = useState<ClaudeConnectSession | null>(null)
  const [code, setCode] = useState('')
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [tokenOpen, setTokenOpen] = useState(false)
  const [token, setToken] = useState('')
  const [tokenSaving, setTokenSaving] = useState(false)
  const [tokenErrorKey, setTokenErrorKey] = useState<string | null>(null)
  // Bumped on every close/restart so late responses of an old run are dropped.
  const run = useRef(0)
  const sessionRef = useRef<ClaudeConnectSession | null>(null)
  useEffect(() => {
    sessionRef.current = session
  }, [session])
  const connected = useRef(false)
  const apiRef = useRef(api)
  apiRef.current = api

  const begin = useCallback(async () => {
    const my = ++run.current
    const alive = () => run.current === my
    setErrorKey(null)
    setCode('')
    setToken('')
    setTokenErrorKey(null)
    setTokenOpen(false)
    setSession(null)
    setStep('checking')
    try {
      const bin = await apiRef.current.getBinary()
      if (!alive()) return
      if (!bin.installed) return setStep('install')
    } catch (e) {
      if (!alive()) return
      setErrorKey(claudeConnectErrorKey(e))
      return setStep('error')
    }
    setStep('starting')
    try {
      const s = await apiRef.current.start()
      if (!alive()) {
        void apiRef.current.cancel(s.session_id).catch(() => {})
        return
      }
      setSession(s)
      setStep('ready')
    } catch (e) {
      if (!alive()) return
      if (claudeConnectErrorCode(e) === 'binary_missing') return setStep('install')
      setErrorKey(claudeConnectErrorKey(e))
      setStep('error')
    }
  }, [])

  useEffect(() => {
    if (!open) return
    connected.current = false
    void begin()
    return () => {
      run.current++
      const s = sessionRef.current
      if (s && !connected.current) void apiRef.current.cancel(s.session_id).catch(() => {})
      setSession(null)
    }
  }, [open, begin])

  // Countdown; an expired session is replaced by a fresh one.
  useEffect(() => {
    if (!session || (step !== 'ready' && step !== 'submitting')) return
    const tick = () => {
      const left = new Date(session.expires_at).getTime() - Date.now()
      setRemaining(left)
      if (left <= 0 && step === 'ready') void begin()
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [session, step, begin])

  const install = async () => {
    const my = run.current
    setStep('installing')
    setErrorKey(null)
    try {
      const bin = await api.install()
      if (run.current !== my) return
      if (!bin.installed) throw new Error('not installed')
      void begin()
    } catch (e) {
      if (run.current !== my) return
      setErrorKey(claudeConnectErrorKey(e))
      setStep('install')
    }
  }

  const openLink = () => {
    if (!session?.url) return
    if (openUrl) openUrl(session.url)
    else window.open(session.url, '_blank', 'noopener,noreferrer')
  }

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) setCode(text.trim())
    } catch {
      /* clipboard blocked: the user pastes by hand */
    }
  }

  const finish = async () => {
    connected.current = true
    setStep('success')
    await qc.invalidateQueries({ queryKey: orgAIConfigQueryKey })
    onConnected?.()
  }

  const submit = async () => {
    if (!session || !code.trim()) return
    const my = run.current
    setStep('submitting')
    setErrorKey(null)
    try {
      const ok = await api.submitCode(session.session_id, code.trim())
      if (run.current !== my) return
      if (!ok) throw new Error('not connected')
      await finish()
    } catch (e) {
      if (run.current !== my) return
      const c = claudeConnectErrorCode(e)
      if (c === 'invalid_code') {
        setErrorKey(claudeConnectErrorKey(e))
        return setStep('ready')
      }
      if (c === 'timeout' || c === 'expired') {
        await begin()
        setErrorKey(claudeConnectErrorKey(e))
        return
      }
      setErrorKey(claudeConnectErrorKey(e))
      setStep('error')
    }
  }

  const saveToken = async () => {
    const value = token.trim()
    if (!value || tokenSaving) return
    const my = run.current
    setTokenSaving(true)
    setTokenErrorKey(null)
    try {
      const ok = await api.submitToken(value)
      if (run.current !== my) return
      if (!ok) throw new Error('not connected')
      setToken('')
      // The code session is no longer needed: free it server-side.
      const s = sessionRef.current
      if (s) void api.cancel(s.session_id).catch(() => {})
      await finish()
    } catch (e) {
      if (run.current !== my) return
      setTokenErrorKey(claudeConnectErrorKey(e))
    } finally {
      if (run.current === my) setTokenSaving(false)
    }
  }

  const busy = step === 'installing' || step === 'submitting' || tokenSaving
  const close = () => onOpenChange(false)
  const cancelBtn = (
    <Button variant="outline" onClick={close} disabled={busy}>
      {tr('org_ai.claude_connect.cancel')}
    </Button>
  )

  let body: ReactNode
  let footer: ReactNode
  if (step === 'success') {
    body = (
      <div className="flex flex-col items-center gap-2 py-6 text-center" role="status">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden="true" />
        <p className="font-medium">{tr('org_ai.claude_connect.success')}</p>
      </div>
    )
    footer = <Button onClick={close}>{tr('org_ai.claude_connect.done')}</Button>
  } else if (step === 'install' || step === 'installing') {
    body = (
      <div className="space-y-3 text-sm">
        <p>{tr('org_ai.claude_connect.install_notice')}</p>
        {errorKey && <p role="alert" className="text-destructive">{tr(errorKey)}</p>}
      </div>
    )
    footer = (
      <>
        {cancelBtn}
        <Button onClick={() => void install()} disabled={busy}>
          {step === 'installing' && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {step === 'installing' ? tr('org_ai.claude_connect.installing') : tr('org_ai.claude_connect.install')}
        </Button>
      </>
    )
  } else if (step === 'ready' || step === 'submitting') {
    body = (
      <div className="space-y-4">
        <Button variant="outline" className="w-full" onClick={openLink} disabled={step === 'submitting'}>
          <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
          {tr('org_ai.claude_connect.open_link')}
        </Button>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
              }}
              placeholder={tr('org_ai.claude_connect.code_placeholder')}
              aria-label={tr('org_ai.claude_connect.code_label')}
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              disabled={step === 'submitting'}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void paste()}
              disabled={step === 'submitting'}
              aria-label={tr('org_ai.claude_connect.paste')}
              title={tr('org_ai.claude_connect.paste')}
            >
              <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          {errorKey && <p role="alert" className="text-sm text-destructive">{tr(errorKey)}</p>}
          <p className="text-xs text-muted-foreground">
            {tr('org_ai.claude_connect.expires_in', { time: formatCountdown(remaining) })}
          </p>
        </div>
        <div className="border-t pt-3 text-sm">
          <button
            type="button"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            aria-expanded={tokenOpen}
            onClick={() => setTokenOpen((o) => !o)}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${tokenOpen ? '' : '-rotate-90'}`} aria-hidden="true" />
            {tr('org_ai.claude_connect.token_toggle')}
          </button>
          {tokenOpen && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-muted-foreground">{tr('org_ai.claude_connect.token_hint')}</p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveToken()
                  }}
                  aria-label={tr('org_ai.claude_connect.token_label')}
                  className="font-mono"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={tokenSaving || step === 'submitting'}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void saveToken()}
                  disabled={!token.trim() || tokenSaving || step === 'submitting'}
                >
                  {tokenSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  {tr('org_ai.claude_connect.token_save')}
                </Button>
              </div>
              {tokenErrorKey && <p role="alert" className="text-sm text-destructive">{tr(tokenErrorKey)}</p>}
            </div>
          )}
        </div>
      </div>
    )
    footer = (
      <>
        {cancelBtn}
        <Button onClick={() => void submit()} disabled={!code.trim() || busy}>
          {step === 'submitting' && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {tr('org_ai.claude_connect.connect')}
        </Button>
      </>
    )
  } else if (step === 'error') {
    body = (
      <p role="alert" className="text-sm text-destructive">
        {tr(errorKey ?? 'org_ai.claude_connect.errors.generic')}
      </p>
    )
    footer = (
      <>
        {cancelBtn}
        <Button onClick={() => void begin()}>{tr('org_ai.claude_connect.retry')}</Button>
      </>
    )
  } else {
    body = (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {tr('org_ai.claude_connect.loading')}
      </div>
    )
    footer = cancelBtn
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o && busy) return
        onOpenChange(o)
      }}
      title={tr('org_ai.claude_connect.title')}
      size="sm"
      footer={footer}
      dismissable={!busy}
    >
      {body}
    </Modal>
  )
}

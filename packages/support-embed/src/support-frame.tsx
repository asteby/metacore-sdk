import * as React from 'react'
import { Alert, AlertDescription, AlertTitle, Button, Input, Textarea } from '@asteby/metacore-ui/primitives'
import { SupportThread, useSupportT } from '@asteby/metacore-support-ui'
import {
  createSupportApi,
  supportErrorCode,
  type EmbedSessionInfo,
  type EmbedTransport,
  type SupportApi,
  type SupportCallbackEvent,
} from '@asteby/metacore-sdk/support'
import { profileTexts, sanitizeProfile, type SafeProfile } from './profile'
import { applyProfileTheme } from './theme'
import type { ToFrame, ToParent } from './protocol'

/** Lo que el frame necesita del puerto hacia el padre (`createParentPort` lo implementa). */
export interface FramePort {
  send(msg: ToParent): void
  on(handler: (msg: ToFrame) => void): () => void
}

export interface SupportFrameProps {
  embed: EmbedTransport
  /** Prefijo de las rutas del widget, el mismo con el que se creo el transporte (`createSupportApi.basePath`). */
  apiBase: string
  /** Idioma completo (`es-MX`) para elegir los textos del perfil. */
  locale: string
  port: FramePort
  /** Donde el frame lee el JWT de identidad que el padre pasa con `identify`. */
  identity: { current: string | undefined }
  /** Se muestra el boton de reabrir solo si el canal lo permite (`embed_policy.reopen`). */
  allowReopen?: boolean
  prefersDark?: boolean
  /** Raiz donde se aplican los tokens del tema. Defecto `document.documentElement`. */
  root?: HTMLElement
}

type Phase = { k: 'starting' } | { k: 'ready'; info: EmbedSessionInfo } | { k: 'unavailable' } | { k: 'error' }

/** Codigos de sesion tras los cuales el widget no puede funcionar en este sitio: el loader se retira. */
const FATAL_SESSION = new Set(['origin_not_allowed', 'channel_inactive', 'identity_invalid'])
const SERVICE_OUT = new Set(['channel_quota_exceeded'])

const safeHref = (v: string) => (/^https:\/\//.test(v) ? v : undefined)

export function SupportFrame({ embed, apiBase, locale, port, identity, allowReopen, prefersDark = false, root }: SupportFrameProps) {
  const { t } = useSupportT()
  const [phase, setPhase] = React.useState<Phase>({ k: 'starting' })
  const [profile, setProfile] = React.useState<SafeProfile | null>(null)
  const [caseId, setCaseId] = React.useState<string | null>(null)
  const [composing, setComposing] = React.useState(false)
  const [serviceOut, setServiceOut] = React.useState(false)
  const [nonce, setNonce] = React.useState(0)
  const openRef = React.useRef(false)
  const unread = React.useRef(0)

  // Eventos: cuenta como no leido lo que llega del equipo mientras el panel esta cerrado.
  const api = React.useMemo(() => {
    const base: SupportApi = createSupportApi(embed.transport, {
      basePath: apiBase,
      events: (id, onEvent) =>
        embed.events(apiBase)(id, (ev: SupportCallbackEvent) => {
          if (!openRef.current && (ev.event === 'desk_message' || ev.event === 'ai_action' || ev.event === 'issue_commented')) {
            unread.current += 1
            port.send({ t: 'unread', count: Math.min(unread.current, 999) })
          }
          onEvent(ev)
        }),
    })
    return allowReopen ? base : { ...base, reopen: undefined }
  }, [embed, apiBase, port, allowReopen])

  const apply = React.useCallback(
    (info: EmbedSessionInfo) => {
      const safe = sanitizeProfile(info.profile)
      setProfile(safe)
      const applied = applyProfileTheme(safe, root ?? document.documentElement, prefersDark)
      const text = profileTexts(safe, locale)
      port.send({
        t: 'profile',
        position: safe.position,
        launcher: text.launcher ?? t('title'),
        brand_color: applied.brand?.color ?? '#0f172a',
        on_brand: applied.brand?.on ?? '#ffffff',
      })
    },
    [locale, port, prefersDark, root, t],
  )

  // Sesion + casos del visitante.
  React.useEffect(() => {
    let live = true
    setPhase({ k: 'starting' })
    embed
      .start()
      .then(async (info) => {
        if (!live) return
        apply(info)
        try {
          const page = await api.listCases({ limit: 20 })
          if (!live) return
          const latest = page.items.find((c) => c.status === 'open') ?? page.items[0]
          setCaseId(latest ? ((latest as { case_id?: string }).case_id ?? latest.folio) : null)
        } catch {
          // Sin casos o lista no disponible: el visitante puede abrir uno nuevo.
        }
        port.send({ t: 'ready' })
        if (live) setPhase({ k: 'ready', info })
      })
      .catch((err) => {
        if (!live) return
        const code = supportErrorCode(err)
        if (code && FATAL_SESSION.has(code)) {
          port.send({ t: 'unavailable' })
          setPhase({ k: 'unavailable' })
        } else if (code && SERVICE_OUT.has(code)) setPhase({ k: 'unavailable' })
        else setPhase({ k: 'error' })
      })
    return () => {
      live = false
    }
    // `api` y `apply` son estables por sesion; el nonce reinicia tras identify/logout/reintento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embed, nonce])

  // Ordenes del padre.
  React.useEffect(
    () =>
      port.on((msg) => {
        if (msg.t === 'identify') {
          identity.current = msg.token
          embed.stop()
          setCaseId(null)
          setNonce((n) => n + 1)
        } else if (msg.t === 'logout') {
          identity.current = undefined
          embed.logout()
          setCaseId(null)
          setNonce((n) => n + 1)
        } else if (msg.t === 'open') {
          openRef.current = true
          unread.current = 0
          port.send({ t: 'unread', count: 0 })
        } else if (msg.t === 'close') {
          openRef.current = false
        }
      }),
    [port, embed, identity],
  )

  const texts = profile ? profileTexts(profile, locale) : {}
  const contact = profile?.fallback_contact

  if (phase.k === 'starting') return <p role="status" className="p-4 text-sm text-muted-foreground">{t('embed.starting')}</p>

  if (phase.k === 'unavailable' || serviceOut) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle>{t('embed.unavailableTitle')}</AlertTitle>
          <AlertDescription>
            <p>{texts.offline ?? t('embed.unavailableBody')}</p>
            {contact?.email ? <p><a className="underline" href={`mailto:${contact.email}`}>{t('embed.contactEmail', { email: contact.email })}</a></p> : null}
            {contact?.url && safeHref(contact.url) ? (
              <p><a className="underline" href={safeHref(contact.url)} target="_blank" rel="noopener noreferrer nofollow">{t('embed.contactUrl')}</a></p>
            ) : null}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (phase.k === 'error') {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTitle>{t('embed.errorTitle')}</AlertTitle>
          <AlertDescription>{t('embed.errorBody')}</AlertDescription>
        </Alert>
        <Button className="mt-3" onClick={() => setNonce((n) => n + 1)}>{t('retry')}</Button>
      </div>
    )
  }

  const visitor = phase.info.visitor?.display_name

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-b p-3">
        {profile?.logo_url ? <img src={profile.logo_url} alt="" className="h-6 w-6 rounded" referrerPolicy="no-referrer" /> : null}
        <h1 className="flex-1 text-sm font-semibold">{texts.greeting ?? t('embed.newCaseTitle')}</h1>
        {caseId && !composing ? (
          <Button variant="outline" size="sm" onClick={() => setComposing(true)}>{t('embed.newCase')}</Button>
        ) : null}
        <Button variant="ghost" size="sm" aria-label={t('embed.close')} onClick={() => port.send({ t: 'close' })}>×</Button>
      </header>
      <main className="min-h-0 flex-1">
        {caseId && !composing ? (
          <SupportThread api={api} folio={caseId} authorName={visitor} />
        ) : (
          <NewCase
            onCreated={(id) => {
              setComposing(false)
              setCaseId(id)
            }}
            create={async (subject, body) => {
              try {
                const c = await api.createCase({ subject, description: body })
                return (c as { case_id?: string }).case_id ?? c.folio
              } catch (e) {
                if (supportErrorCode(e) === 'channel_quota_exceeded') setServiceOut(true)
                throw e
              }
            }}
            t={t}
          />
        )}
      </main>
    </div>
  )
}

function NewCase({
  create,
  onCreated,
  t,
}: {
  create: (subject: string, body: string) => Promise<string>
  onCreated: (id: string) => void
  t: (key: string, vars?: Record<string, string>) => string
}) {
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const id = React.useId()
  return (
    <form
      className="space-y-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!body.trim() || busy) return
        setBusy(true)
        setFailed(false)
        try {
          onCreated(await create(subject.trim(), body.trim()))
        } catch {
          setFailed(true)
        } finally {
          setBusy(false)
        }
      }}
    >
      <div className="space-y-1">
        <label htmlFor={`${id}-s`} className="text-sm font-medium">{t('embed.subject')}</label>
        <Input id={`${id}-s`} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-b`} className="text-sm font-medium">{t('embed.message')}</label>
        <Textarea id={`${id}-b`} value={body} maxLength={8000} required rows={5} onChange={(e) => setBody(e.target.value)} />
      </div>
      {failed ? <p role="alert" className="text-sm text-destructive">{t('embed.errorBody')}</p> : null}
      <Button type="submit" disabled={busy || !body.trim()}>{busy ? t('embed.starting2') : t('embed.start')}</Button>
    </form>
  )
}

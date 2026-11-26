import * as React from 'react'
import { Alert, AlertDescription, AlertTitle, Button } from '@asteby/metacore-ui/primitives'
import {
  SupportNewTicketForm,
  SupportThread,
  SupportTicketList,
  clientStateOf,
  useSupportT,
  type SupportTicketItem,
} from '@asteby/metacore-support-ui'
import {
  createSupportApi,
  supportErrorCode,
  type EmbedSessionInfo,
  type EmbedTransport,
  type SupportApi,
  type SupportCallbackEvent,
  type SupportCaseSummary,
} from '@asteby/metacore-sdk/support'
import { loadSeen, markSeen, type SeenMap } from './ticket-seen'
import { parseProfileDisplay, type DisplayMode } from './display'
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
  /** Modo con el que se presenta; en `inline` no hay boton de cerrar. El loader lo comunica con `hello`. */
  mode?: DisplayMode
  /** Ocupa el alto de su contenedor en vez del de la ventana (embed en codigo, sin iframe). */
  fill?: boolean
  /** Clave del almacen local de lo visto por ticket (el id del canal); defecto compartido. */
  storageKey?: string
}

/** What the embed shows: the person's tickets (default), one ticket's thread, or the new-ticket form. */
type View = { k: 'list' } | { k: 'thread'; id: string } | { k: 'new' }

/** Open tickets whose last message is fetched to know whose turn it is (the Hub list view carries no last author). */
const ENRICH_MAX = 10
const LIST_POLL_MS = 30_000

type Phase = { k: 'starting' } | { k: 'ready'; info: EmbedSessionInfo } | { k: 'unavailable' } | { k: 'error' }

/** Codigos de sesion tras los cuales el widget no puede funcionar en este sitio: el loader se retira. */
const FATAL_SESSION = new Set(['origin_not_allowed', 'channel_inactive', 'identity_invalid'])
const SERVICE_OUT = new Set(['channel_quota_exceeded'])

const safeHref = (v: string) => (/^https:\/\//.test(v) ? v : undefined)

export function SupportFrame({ embed, apiBase, locale, port, identity, allowReopen, prefersDark = false, root, mode: initialMode, fill = false, storageKey = 'default' }: SupportFrameProps) {
  const { t } = useSupportT()
  const [phase, setPhase] = React.useState<Phase>({ k: 'starting' })
  const [profile, setProfile] = React.useState<SafeProfile | null>(null)
  const [view, setView] = React.useState<View>({ k: 'list' })
  const [tickets, setTickets] = React.useState<SupportTicketItem[]>([])
  const [listState, setListState] = React.useState<'loading' | 'ready' | 'error'>('loading')
  const seen = React.useRef<SeenMap>({})
  const [serviceOut, setServiceOut] = React.useState(false)
  const [nonce, setNonce] = React.useState(0)
  const [mode, setMode] = React.useState<DisplayMode>(initialMode ?? 'floating')
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
    // The Hub widget API has no "finish" call: the button is only offered where the transport has one.
    return { ...base, close: undefined, reopen: allowReopen ? base.reopen : undefined }
  }, [embed, apiBase, port, allowReopen])

  const idOf = (c: SupportCaseSummary) => (c as { case_id?: string }).case_id ?? c.folio

  // The person's tickets with the state they see. The Hub list has no last author, so the few open ones are
  // peeked at (last message only) to tell "waiting for you" from "in progress"; unread = their reply is newer than the last visit.
  const refreshList = React.useCallback(async (): Promise<SupportTicketItem[]> => {
    const page = await api.listCases({ limit: 50 })
    const rows = await Promise.all(
      page.items.map(async (c, i): Promise<SupportTicketItem> => {
        const id = idOf(c)
        let lastAuthor: string | undefined
        let last: { body: string; at?: string; fromMe?: boolean } | undefined
        if (c.status === 'open' && i < ENRICH_MAX) {
          try {
            const full = await api.getCase(id, { limit: 1 })
            const m = full.messages[full.messages.length - 1]
            if (m) {
              lastAuthor = m.author_type
              last = { body: m.body, at: m.created_at, fromMe: m.author_type === 'reporter' }
            }
          } catch {
            // Without the peek the row falls back to its status.
          }
        }
        const state = clientStateOf({ status: c.status, lifecycle: c.lifecycle, lastAuthor })
        const theirs = lastAuthor === 'agent' || lastAuthor === 'ai'
        const visited = seen.current[id] ?? 0
        const unread = c.unread ?? (theirs && last?.at && Date.parse(last.at) > visited ? 1 : 0)
        return { id, folio: c.folio, subject: c.subject, state, unread, lastMessage: last, updatedAt: c.updated_at }
      }),
    )
    setTickets(rows)
    return rows
  }, [api])

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
        ...parseProfileDisplay(safe as unknown as Record<string, unknown>),
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
        seen.current = loadSeen(storageKey)
        try {
          const rows = await refreshList()
          if (!live) return
          // Nothing yet: straight to the form; otherwise the list, never one mixed thread.
          setView(rows.length === 0 ? { k: 'new' } : { k: 'list' })
          setListState('ready')
        } catch {
          // Lista no disponible: el visitante puede abrir uno nuevo.
          setListState('error')
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
        if (msg.t === 'hello') {
          if (msg.mode) setMode(msg.mode)
        } else if (msg.t === 'identify') {
          identity.current = msg.token
          embed.stop()
          setView({ k: 'list' })
          setTickets([])
          setNonce((n) => n + 1)
        } else if (msg.t === 'logout') {
          identity.current = undefined
          embed.logout()
          setView({ k: 'list' })
          setTickets([])
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

  // Mientras se ve la lista, se refresca sola para que lleguen estados y no leidos nuevos.
  const listing = phase.k === 'ready' && view.k === 'list'
  React.useEffect(() => {
    if (!listing) return
    const id = window.setInterval(() => void refreshList().catch(() => {}), LIST_POLL_MS)
    return () => window.clearInterval(id)
  }, [listing, refreshList])

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
  const channelKey = storageKey
  const current = view.k === 'thread' ? tickets.find((t) => t.id === view.id) : undefined
  const openTicket = tickets.find((t) => t.state === 'waiting') ?? tickets.find((t) => t.state === 'new' || t.state === 'in_progress' || t.state === 'reopened')
  const goList = () => {
    setView({ k: 'list' })
    void refreshList().catch(() => {})
  }
  const openThread = (t: SupportTicketItem) => {
    seen.current = markSeen(channelKey, seen.current, t.id)
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, unread: 0 } : x)))
    setView({ k: 'thread', id: t.id })
  }
  const others = tickets.filter((t) => view.k === 'thread' && t.id !== view.id && (t.state === 'waiting' || t.state === 'new' || t.state === 'in_progress' || t.state === 'reopened')).slice(0, 8)

  return (
    <div className={`flex ${fill ? 'h-full' : 'h-dvh'} flex-col bg-background text-foreground`}>
      <header className="flex items-center gap-2 border-b p-3">
        {profile?.logo_url ? <img src={profile.logo_url} alt="" className="h-6 w-6 rounded" referrerPolicy="no-referrer" /> : null}
        <h1 className="flex-1 text-sm font-semibold">{texts.greeting ?? t('embed.newCaseTitle')}</h1>
        {mode === 'inline' ? null : (
          <Button variant="ghost" size="sm" aria-label={t('embed.close')} onClick={() => port.send({ t: 'close' })}>×</Button>
        )}
      </header>
      <main className="min-h-0 flex-1">
        {view.k === 'thread' ? (
          <SupportThread
            key={view.id}
            api={api}
            folio={view.id}
            authorName={visitor}
            onBack={goList}
            others={others}
            onSwitch={openThread}
            onOpenAnother={() => setView({ k: 'new' })}
          />
        ) : view.k === 'new' ? (
          <SupportNewTicketForm
            openTicket={openTicket ? { folio: openTicket.folio, subject: openTicket.subject } : undefined}
            onContinue={() => openTicket && openThread(openTicket)}
            onCancel={tickets.length > 0 ? goList : undefined}
            onSubmit={async (subject, body) => {
              try {
                const c = await api.createCase({ subject, description: body })
                const id = (c as { case_id?: string }).case_id ?? c.folio
                seen.current = markSeen(channelKey, seen.current, id)
                await refreshList().catch(() => [])
                setView({ k: 'thread', id })
              } catch (e) {
                if (supportErrorCode(e) === 'channel_quota_exceeded') setServiceOut(true)
                throw e
              }
            }}
          />
        ) : (
          <SupportTicketList
            tickets={tickets}
            loading={listState === 'loading'}
            error={listState === 'error'}
            onSelect={openThread}
            onNewTicket={() => setView({ k: 'new' })}
            activeId={current?.id}
          />
        )}
      </main>
    </div>
  )
}

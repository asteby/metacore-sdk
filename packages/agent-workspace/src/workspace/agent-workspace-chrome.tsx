import { useMemo, useState } from 'react'
import {
  MessageSquarePlus,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { formatDistanceToNow, isToday, isYesterday, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button, Skeleton } from '@asteby/metacore-ui'
import { cn } from '@asteby/metacore-ui'
import { stripMarkdownLite } from '../lib/plain-text'
import { Mascot } from './mascot'
import { scrubToolDump } from '../lib/aby-tool-dump'
import { useAgentSuggestions } from '../lib/agent-suggestions'
import { AGENT_ENTER, AGENT_PANEL } from './agent-surfaces'

export type WorkspaceSession = {
  id: string
  title: string
  last_message: string
  updated_at: string
}

type Group = { label: string; items: WorkspaceSession[] }

function groupSessions(sessions: WorkspaceSession[]): Group[] {
  const today: WorkspaceSession[] = []
  const yesterday: WorkspaceSession[] = []
  const week: WorkspaceSession[] = []
  const older: WorkspaceSession[] = []
  const weekAgo = subDays(new Date(), 7)

  for (const s of sessions) {
    const d = s.updated_at ? new Date(s.updated_at) : null
    if (!d || Number.isNaN(d.getTime())) {
      older.push(s)
      continue
    }
    if (isToday(d)) today.push(s)
    else if (isYesterday(d)) yesterday.push(s)
    else if (d >= weekAgo) week.push(s)
    else older.push(s)
  }

  const out: Group[] = []
  if (today.length) out.push({ label: 'Hoy', items: today })
  if (yesterday.length) out.push({ label: 'Ayer', items: yesterday })
  if (week.length) out.push({ label: 'Últimos 7 días', items: week })
  if (older.length) out.push({ label: 'Anteriores', items: older })
  return out
}

export function AgentWorkspaceChrome({
  mascotName,
  mascotSkin,
  sidebarOpen,
  onToggleSidebar,
  sessions,
  sessionsLoading,
  activeSessionId,
  onNewChat,
  onOpenSession,
  onDeleteSession,
  children,
  composer,
  isEmpty,
  onSuggestion,
}: {
  mascotName: string
  mascotSkin?: string
  sidebarOpen: boolean
  onToggleSidebar: () => void
  sessions: WorkspaceSession[]
  sessionsLoading: boolean
  activeSessionId: string
  onNewChat: () => void
  onOpenSession: (id: string, title: string) => void
  onDeleteSession: (id: string, title: string, e?: React.MouseEvent) => void
  children: React.ReactNode
  composer: React.ReactNode
  isEmpty: boolean
  onSuggestion: (text: string) => void
}) {
  const [query, setQuery] = useState('')
  const suggestions = useAgentSuggestions()
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter(
      (s) =>
        (s.title || '').toLowerCase().includes(q) ||
        (s.last_message || '').toLowerCase().includes(q),
    )
  }, [sessions, query])
  const groups = useMemo(() => groupSessions(filtered), [filtered])

  return (
    // No bg here: the route already paints --background once. A second layer
    // compounded the glass alpha (0.45 → 0.7) and the page read as solid.
    <div className="flex min-h-0 flex-1 gap-3 overflow-hidden md:p-3 md:pr-0">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden"
          onClick={onToggleSidebar}
        />
      )}

      <aside
        className={cn(
          'z-50 flex w-[272px] shrink-0 flex-col overflow-hidden transition-transform duration-200 motion-reduce:transition-none',
          AGENT_PANEL,
          'fixed inset-y-2 left-2 md:static md:h-full md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:hidden',
        )}
      >
        <div className="flex items-center gap-1 px-2 py-2.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            title="Ocultar barra"
            onClick={onToggleSidebar}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={onNewChat}
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 text-left text-sm font-medium transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <MessageSquarePlus className="h-4 w-4 shrink-0 opacity-70" />
            <span className="truncate">Nuevo chat</span>
          </button>
        </div>

        <div className="px-2 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar"
              className="h-9 w-full rounded-xl border-0 bg-foreground/[0.04] pl-8 pr-2 text-xs outline-none ring-1 ring-border/50 transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/35"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {sessionsLoading ? (
            <div className="space-y-2 px-1 pt-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded-lg" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              Sin conversaciones aún
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="mb-3">
                <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  {g.label}
                </p>
                <ul className="space-y-0.5">
                  {g.items.map((s) => {
                    const active = s.id === activeSessionId
                    return (
                      <li key={s.id} className="group relative">
                        <button
                          type="button"
                          onClick={() => onOpenSession(s.id, s.title)}
                          className={cn(
                            'flex w-full flex-col rounded-xl px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                            active
                              ? 'bg-primary/10 ring-1 ring-primary/25'
                              : 'hover:bg-foreground/5',
                          )}
                        >
                          <span className="truncate pr-5 text-[13px] font-medium leading-tight">
                            {s.title || 'Sin título'}
                          </span>
                          <span className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                            {stripMarkdownLite(scrubToolDump(s.last_message || '')) || 'Sin mensajes'}
                          </span>
                        </button>
                        <button
                          type="button"
                          title="Borrar"
                          aria-label={`Borrar ${s.title || 'conversación'}`}
                          onClick={(e) =>
                            onDeleteSession(s.id, s.title || 'Sin título', e)
                          }
                          className={cn(
                            'absolute right-1 top-1.5 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
                            'opacity-100 md:opacity-0 md:group-hover:opacity-100',
                          )}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 px-3">
          {!sidebarOpen && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Mostrar chats"
              onClick={onToggleSidebar}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          )}
          {!sidebarOpen && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Nuevo chat"
              onClick={onNewChat}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
          <div className="min-w-0 flex-1" />
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          {isEmpty ? (
            <div className={cn('flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-28', AGENT_ENTER)}>
              <div className="mb-5 drop-shadow-[0_10px_24px_color-mix(in_oklab,var(--primary)_35%,transparent)]">
                <Mascot skin={mascotSkin} size={56} />
              </div>
              <h1 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
                ¿En qué puedo ayudarte?
              </h1>
              <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
                {mascotName} puede consultar datos, crear registros y guiarte.
              </p>
              <div className="mt-8 flex max-w-xl flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSuggestion(s)}
                    className="rounded-full border border-border/60 bg-card/70 px-3.5 py-1.5 text-xs text-foreground/80 shadow-sm backdrop-blur-xl transition-[transform,background-color,border-color] duration-200 hover:-translate-y-px hover:border-primary/35 hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            children
          )}

          {/* Light scrim only: the capsule carries its own glass and shadow. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background/80 via-background/40 to-transparent pt-10">
            <div className="pointer-events-auto mx-auto w-full max-w-3xl px-3 pb-4 sm:px-4">
              {composer}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function sessionRelativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: es })
  } catch {
    return ''
  }
}

import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from 'react'
import { Box, type LucideIcon } from 'lucide-react'
import { resolveIconName } from '@asteby/metacore-ui'
import { usePlatformConfig, type MascotSkin } from '@asteby/metacore-app-providers'

/**
 * Ports of the agent workspace.
 *
 * The package owns the whole agent experience (workspace chat with history,
 * floating widget, team chat, calls, voice, charts). Everything that belongs to
 * the host app — HTTP, realtime socket, current user, navigation, storage
 * namespace and optional product capabilities — is injected here, so the same
 * code runs in ops and any other Metacore app without forks.
 */

/** Minimal axios-shaped client: the host passes its authenticated instance. */
export interface WorkspaceHttp {
  get<T = any>(url: string, config?: any): Promise<{ data: T }>
  post<T = any>(url: string, body?: any, config?: any): Promise<{ data: T }>
  put<T = any>(url: string, body?: any, config?: any): Promise<{ data: T }>
  patch<T = any>(url: string, body?: any, config?: any): Promise<{ data: T }>
  delete<T = any>(url: string, config?: any): Promise<{ data: T }>
}

export interface WorkspaceWSEvent {
  type: string
  payload: unknown
}

/** Subset of the host's WebSocket context the workspace consumes. */
export interface WorkspaceRealtime {
  sendMessage: (message: any) => void
  isConnected: boolean
  subscribe: (eventType: string, handler: (event: WorkspaceWSEvent) => void) => () => void
  /** Team-chat channel open in the floating widget (suppresses duplicate toasts). */
  widgetTeamChatChannelId: string | null
  setWidgetTeamChatChannelId: (id: string | null) => void
  activeTeamChatChannelId: string | null
  setActiveTeamChatChannelId: (id: string | null) => void
  presenceByUserId: Record<string, { online: boolean; last_seen?: string }>
  totalUnread: number
  clearUnread: () => void
}

export interface WorkspaceUser {
  id: string
  name: string
  email?: string
  role?: string
  avatar?: string
  organization_id?: string
}

export interface WorkspaceNavItem {
  title?: string
  url?: string
  icon?: LucideIcon
  items?: WorkspaceNavItem[]
}
export interface WorkspaceNavGroup {
  title?: string
  items: WorkspaceNavItem[]
}

/** Optional product capabilities. Omit one and its UI disappears cleanly. */
export interface WorkspaceCapabilities {
  /** Usage/credits accounting: called after an AI reply that consumed credits. */
  usage?: { onReplySpent: () => void }
  /** Dialog to (re)connect the AI provider when the session expires. */
  ProviderReconnectDialog?: ComponentType<{
    open: boolean
    onOpenChange: (open: boolean) => void
    onConnected: () => void
  }>
  /** Renderer for map charts embedded in answers. */
  MapChart?: ComponentType<{ spec: any; atlas?: any; height?: number }>
  /** WebRTC calls from the team chat and the widget. */
  calls?: boolean
}

export interface AgentWorkspaceHostValue {
  http: WorkspaceHttp
  realtime: WorkspaceRealtime
  user: WorkspaceUser | null
  navGroups: WorkspaceNavGroup[] | undefined
  /** Prefix for localStorage keys (`ops`, `<producto>`). */
  storageNamespace: string
  /** Overrides the platform mascot name/skin (e.g. unified agent name). */
  branding?: { name?: string; skin?: string | MascotSkin }
  capabilities: WorkspaceCapabilities
}

const HostContext = createContext<AgentWorkspaceHostValue | null>(null)

let current: AgentWorkspaceHostValue | null = null

export interface AgentWorkspaceProviderProps extends Omit<AgentWorkspaceHostValue, 'capabilities'> {
  capabilities?: WorkspaceCapabilities
  children: ReactNode
}

export function AgentWorkspaceProvider({ children, capabilities, ...rest }: AgentWorkspaceProviderProps) {
  const value = useMemo<AgentWorkspaceHostValue>(
    () => ({ ...rest, capabilities: capabilities ?? {} }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rest.http, rest.realtime, rest.user, rest.navGroups, rest.storageNamespace, rest.branding, capabilities],
  )
  // Non-React modules (helpers, stores) read the same host synchronously.
  current = value
  return <HostContext.Provider value={value}>{children}</HostContext.Provider>
}

export function useWorkspaceHost(): AgentWorkspaceHostValue {
  const ctx = useContext(HostContext)
  if (!ctx) throw new Error('useWorkspaceHost must be used inside <AgentWorkspaceProvider>')
  return ctx
}

/** For non-component code. Throws if the provider has never rendered. */
export function getWorkspaceHost(): AgentWorkspaceHostValue {
  if (!current) throw new Error('AgentWorkspaceProvider is not mounted')
  return current
}

/** Drop-in for the old module-level `api` import. */
export const api: WorkspaceHttp = {
  get: (...a) => getWorkspaceHost().http.get(...a),
  post: (...a) => getWorkspaceHost().http.post(...a),
  put: (...a) => getWorkspaceHost().http.put(...a),
  patch: (...a) => getWorkspaceHost().http.patch(...a),
  delete: (...a) => getWorkspaceHost().http.delete(...a),
}

export type WSEvent = WorkspaceWSEvent

/** Drop-in for the old `useWebSocketContext()` of the host app. */
export function useWebSocketContext(): WorkspaceRealtime {
  return useWorkspaceHost().realtime
}

export function useWorkspaceUser(): WorkspaceUser | null {
  return useWorkspaceHost().user
}

/** Drop-in for the old `useNavigation()` (only `data` is consumed). */
export function useNavigation(): { data: WorkspaceNavGroup[] | undefined } {
  return { data: useWorkspaceHost().navGroups }
}

/** Platform config with the host's unified agent branding applied on top. */
export function useWorkspacePlatformConfig() {
  const cfg = usePlatformConfig()
  const { branding } = useWorkspaceHost()
  return {
    ...cfg,
    mascot_name: branding?.name ?? cfg.mascot_name,
    mascot_skin: branding?.skin ?? cfg.mascot_skin,
  }
}

/** Extracts a human message from an axios-style error. */
export function getApiErrorMessage(err: unknown, fallback = 'Error'): string {
  if (err == null) return fallback

  const ax = err as {
    response?: { data?: unknown; status?: number }
    message?: string
  }
  const data = ax.response?.data

  if (typeof data === 'string') {
    const trimmed = data.trim()
    if (trimmed) {
      const title = trimmed.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim()
      if (title) return title
      // Avoid dumping full HTML pages into toasts.
      if (!trimmed.startsWith('<') && trimmed.length < 800) return trimmed
    }
  }

  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    for (const key of ['message', 'error', 'detail', 'title'] as const) {
      const v = o[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    const nested = o.data
    if (nested && typeof nested === 'object') {
      const m = (nested as Record<string, unknown>).message
      if (typeof m === 'string' && m.trim()) return m.trim()
    }
  }

  if (typeof ax.message === 'string' && ax.message.trim()) {
    return ax.message.trim()
  }
  return fallback
}

/** Resolves a lucide icon name (any casing/separator) with a fallback glyph. */
export function resolveIcon(iconName?: string, fallback: LucideIcon = Box): LucideIcon {
  if (!iconName) return fallback
  return resolveIconName(iconName.trim(), fallback)
}

/** localStorage/sessionStorage key scoped to the host app (`<namespace>:<name>`). */
export function storageKey(name: string): string {
  return `${current?.storageNamespace ?? 'ops'}:${name}`
}

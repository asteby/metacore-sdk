import { Component, useId, useMemo, type ErrorInfo, type ReactNode } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  GENUI_V2_VERSION,
  GenUIBody,
  SourceDeniedError,
  createActionHandler,
  downgrade,
  isSafeInternalPath,
  parseGenUI,
  registeredGenUIBlocks,
  GENUI_BUILTIN_BLOCKS,
  type GenUIBodyDoc,
  type GenUIHostAdapter,
  type SourceResolver,
} from '@asteby/metacore-genui'
import type { AgentResult, AgentResultRendererProps } from '@asteby/metacore-runtime-react'
import { cn } from '@asteby/metacore-ui'
import type { ChatAttachment } from '../team-chat/data/types'

/*
 * Renderer of the agent's `type:"ui"` embeds: a genui/v2 document drawn by the
 * SAME `GenUIBody` pages and the Dashboard use, inside the chat bubble. The
 * document is untrusted (the LLM wrote it), so the default adapter is closed:
 *   - no external links (the validator rejects them), no `ext` / `slot` /
 *     custom blocks / iframes: only the chat's block whitelist is drawn;
 *   - actions: only `navigate` to internal paths and `emit` of listed ids;
 *     `invoke` / `submit` never reach any host;
 *   - data comes only through the host's `SourceResolver` (the default one
 *     accepts `inline` rows and denies every other source).
 * A block the chat cannot draw degrades to its `fallback` text; a document that
 * does not validate degrades to plain text.
 */

/** Block types the chat may draw (server-only kinds such as `proposal`/`confirm` are not here). */
export const AGENT_UI_CHAT_BLOCKS: readonly string[] = [
  'stack', 'grid', 'tabs', 'section',
  'text', 'markdown', 'alert', 'empty', 'card', 'list',
  'kpi', 'kpi_card', 'stats', 'metric', 'links', 'timeline',
  'table', 'chart', 'map', 'diagram', 'media', 'view', 'model_view',
]

/** Verbs the chat understands. Writes never go through a genui verb: they are proposals. */
export const AGENT_UI_CHAT_VERBS: readonly string[] = ['navigate', 'emit', 'set', 'open', 'close', 'refresh']

export type AgentUiHost = Omit<Partial<GenUIHostAdapter>, 'onAction' | 'allowExternalLinks' | 'customBlocks' | 'urlState' | 'connectBus'>

export interface AgentUiOptions {
  /** What the host owns: sources, permissions, icons, lazy blocks (map)... */
  host?: AgentUiHost
  /** Block whitelist. Default {@link AGENT_UI_CHAT_BLOCKS}. */
  blocks?: readonly string[]
  /** `emit` ids that reach `onEmit` (e.g. `aby.guide`). Default: none. */
  emitIds?: readonly string[]
  onEmit?: (id: string, params: Record<string, unknown> | undefined) => void
  /** Internal navigation. Default: the router history, else a full page load. */
  onNavigate?: (path: string) => void
  /** An action the chat ignored (telemetry). */
  onBlockedAction?: (reason: string) => void
}

/** Sources of the default adapter: inline rows only; anything else is denied, never invented. */
export const inlineOnlySources: SourceResolver = {
  async resolve({ def }) {
    const inline = def && typeof def === 'object' ? (def as { inline?: unknown }).inline : undefined
    if (Array.isArray(inline)) return inline.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    throw new SourceDeniedError()
  },
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

/** Text of a document that cannot be drawn: title + the readable strings of its blocks. */
export function agentUiPlainText(doc: unknown): string {
  const out: string[] = []
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || out.length > 40) return
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1))
    if (!isObj(node)) return
    for (const k of ['title', 'text', 'markdown', 'summary', 'fallback', 'label', 'description']) {
      const s = str(node[k])
      if (s && !out.includes(s)) out.push(s)
    }
    walk(node.blocks, depth + 1)
    walk(node.tabs, depth + 1)
    walk(node.items, depth + 1)
  }
  if (isObj(doc)) {
    const t = str(doc.title)
    if (t) out.push(t)
    walk(doc.blocks, 0)
  }
  return out.join('\n')
}

const NO_CONTENT = 'Contenido no disponible aqui.'

/**
 * Removes custom-block hooks (`component`): the chat never mounts a federated
 * component. A node that was only a hook keeps its `fallback` as text.
 */
function stripCustom(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripCustom)
  if (!isObj(node)) return node
  const out: Obj = {}
  for (const [k, v] of Object.entries(node)) {
    if (k === 'component') continue
    if (k === 'mode' && (v === 'custom' || v === 'hybrid')) continue
    out[k] = stripCustom(v)
  }
  if (typeof node.component === 'string' && !Array.isArray(out.blocks)) {
    out.blocks = [{ type: 'text', text: typeof node.fallback === 'string' && node.fallback ? node.fallback : NO_CONTENT }]
  }
  return out
}

export type PreparedAgentUi =
  | { kind: 'doc'; ui: GenUIBodyDoc }
  | { kind: 'text'; text: string }

/**
 * Validates (no external links), upgrades v1, degrades to the chat's caps and
 * strips custom hooks. Never throws; the worst case is plain text.
 */
export function prepareAgentUi(raw: unknown, opts: Pick<AgentUiOptions, 'blocks'> = {}): PreparedAgentUi {
  const text = agentUiPlainText(raw)
  const parsed = parseGenUI(raw, { allowExternalLinks: false })
  if (!parsed.ok) return { kind: 'text', text }
  const supported = new Set([...GENUI_BUILTIN_BLOCKS, ...registeredGenUIBlocks()])
  const blocks = (opts.blocks ?? AGENT_UI_CHAT_BLOCKS).filter((b) => supported.has(b) || b === 'kpi_card')
  const down = downgrade(parsed.spec, { versions: [GENUI_V2_VERSION], blocks, verbs: [...AGENT_UI_CHAT_VERBS] })
  if (!down.ok) return { kind: 'text', text }
  const ui = stripCustom(down.spec) as unknown as GenUIBodyDoc
  if (!Array.isArray(ui.blocks) || ui.blocks.length === 0) return { kind: 'text', text }
  return { kind: 'doc', ui }
}

class UiBoundary extends Component<{ fallback: ReactNode; children?: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override componentDidCatch(_e: Error, _i: ErrorInfo) {}
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function PlainText({ text }: { text: string }) {
  if (!text) return null
  return (
    <p data-agent-ui='text' className='m-0 whitespace-pre-wrap break-words text-sm text-foreground'>
      {text}
    </p>
  )
}

type UiResult = AgentResult & { embed: ChatAttachment & { ui?: unknown } }

export function createAgentUiResult(options: AgentUiOptions = {}) {
  const policyOf = (navigate: (p: string) => void) =>
    createActionHandler({
      verbs: ['navigate', 'emit'],
      emitIds: options.emitIds,
      onNavigate: navigate,
      onEmit: (id, params) => options.onEmit?.(id, params),
      onBlocked: (_req, reason) => options.onBlockedAction?.(reason),
    })

  function AgentUiResult({ result }: AgentResultRendererProps<UiResult>) {
    const { t } = useTranslation()
    const router = useRouter({ warn: false }) as { history?: { push(href: string): void } } | undefined
    const scopeId = useId()
    const raw = result.embed?.ui
    const prepared = useMemo(() => prepareAgentUi(raw, { blocks: options.blocks }), [raw])

    const host = useMemo<GenUIHostAdapter>(() => {
      const navigate =
        options.onNavigate ??
        ((path: string) => {
          if (!isSafeInternalPath(path)) return
          if (router?.history) router.history.push(path)
          else window.location.assign(path)
        })
      return {
        t: (key, args) => t(key, { defaultValue: key, ...args }) as string,
        ...options.host,
        sources: options.host?.sources ?? inlineOnlySources,
        // Without a host `can`, anything gated by a permission stays hidden.
        can: options.host?.can ?? (() => false),
        onNavigate: navigate,
        onAction: policyOf(navigate),
        allowExternalLinks: false,
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [t, router])

    if (prepared.kind === 'text') return <PlainText text={prepared.text} />
    const fallback = <PlainText text={agentUiPlainText(raw)} />
    return (
      <div data-agent-ui='doc' className={cn('w-[min(100%,40rem)] max-w-full overflow-x-auto rounded-xl border bg-card p-2')}>
        <UiBoundary fallback={fallback}>
          <GenUIBody
            scope={{ addon: 'aby', page: `msg-${result.embed?.id ?? scopeId}` }}
            ui={prepared.ui}
            host={host}
            syncUrl={false}
            loadingFallback={<div role='status' aria-busy='true' className='h-16 animate-pulse rounded-md bg-muted' />}
          />
        </UiBoundary>
      </div>
    )
  }
  return AgentUiResult
}

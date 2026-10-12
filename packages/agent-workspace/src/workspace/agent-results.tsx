import { lazy, Suspense } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  AgentResultView,
  registerAgentResultRenderer,
  resolveAgentResultRenderer,
  type AgentResult,
  type AgentResultRenderer,
  type AgentResultRendererProps,
} from '@asteby/metacore-runtime-react'
import { cn } from '@asteby/metacore-ui'
import { abyGuidance, type AbyGuide } from '../lib/aby-guidance'
import { requestChatWidgetMinimize } from '../lib/aby-widget'
import { ChatEmbedCard, ChatImageEmbed } from '../team-chat/components/chat-embed-card'
import type { ChatAttachment } from '../team-chat/data/types'
import { AbyProposalCard, AbyProposalPlan, type AbyProposal } from './aby-proposal-card'
import { AGENT_CARD, AGENT_CARD_INTERACTIVE, AGENT_ENTER } from './agent-surfaces'

const AbyChartEmbed = lazy(() =>
  import('./aby-chart-embed').then((m) => ({ default: m.AbyChartEmbed })),
)

/*
 * Default renderers for what Aby's tools return. They go through the SDK
 * registry (registerAgentResultRenderer) like any addon's would: an addon
 * that registers `record` for its model, or a kind of its own, is picked up
 * by the chat without touching this file.
 */

type EmbedResult = AgentResult & { embed: ChatAttachment }
type ProposalResult = AgentResult & { proposal: AbyProposal }
type PlanResult = AgentResult & { proposals: AbyProposal[] }
type GuideResult = AgentResult & { guide: AbyGuide }

export type DecidePayload = { ids: string[]; approve: boolean }

/** Record / view cards keep a compact width instead of spanning the reply. */
const CARD_WIDTH = 'w-[min(100%,18rem)]'

function EmbedCardResult({ result }: AgentResultRendererProps<EmbedResult>) {
  return (
    <div className={CARD_WIDTH}>
      <ChatEmbedCard att={result.embed} />
    </div>
  )
}

function ImageResult({ result }: AgentResultRendererProps<EmbedResult>) {
  return <ChatImageEmbed att={result.embed} />
}

function ChartResult({ result }: AgentResultRendererProps<EmbedResult>) {
  if (!result.embed.chart) return null
  return (
    <Suspense fallback={null}>
      <AbyChartEmbed spec={result.embed.chart} />
    </Suspense>
  )
}

/**
 * A count (usually "nothing matched"): the model's label from metadata and a
 * human count, opening the table — instead of "Count: 0 / Model: products".
 */
function CountResult({ result }: AgentResultRendererProps<EmbedResult>) {
  const { t } = useTranslation()
  const embed = result.embed
  const count = Number(embed.count ?? 0)
  return (
    <div className={CARD_WIDTH}>
      <ChatEmbedCard
        att={{
          ...embed,
          type: 'view',
          title: t('aby_results.count', { count }),
        }}
      />
    </div>
  )
}

function ProposalResultView({ result, onAction, busy }: AgentResultRendererProps<ProposalResult>) {
  return (
    <AbyProposalCard
      proposal={result.proposal}
      busy={busy}
      onDecide={(id, approve) => onAction?.('decide', { ids: [id], approve } satisfies DecidePayload)}
    />
  )
}

function PlanResultView({ result, onAction, busy }: AgentResultRendererProps<PlanResult>) {
  return (
    <AbyProposalPlan
      proposals={result.proposals}
      busy={busy}
      onDecideMany={(ids, approve) => onAction?.('decide', { ids, approve } satisfies DecidePayload)}
    />
  )
}

/** Suggested on-screen guide: an action card that launches the tour. */
function GuideResult({ result }: AgentResultRendererProps<GuideResult>) {
  const { t } = useTranslation()
  const guide = result.guide
  const launch = () => {
    requestChatWidgetMinimize()
    // runStep surfaces its own failure (toast naming the missing step +
    // ops:aby-guide-error); a second generic toast here would double up.
    void abyGuidance.startGuide(guide.id).catch(() => {})
  }
  return (
    <button
      type='button'
      onClick={launch}
      className={cn(
        'group flex w-full items-center gap-3 p-2.5 pr-3 text-left',
        AGENT_CARD,
        AGENT_CARD_INTERACTIVE,
        AGENT_ENTER,
        'border-primary/25 bg-gradient-to-r from-primary/10 to-transparent',
      )}
    >
      <span className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/20'>
        <Sparkles className='size-4' />
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-sm font-semibold text-foreground'>{guide.title}</span>
        <span className='block truncate text-xs text-muted-foreground'>
          {t('aby_results.guide_hint')}
        </span>
      </span>
      <ChevronRight className='size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none' />
    </button>
  )
}

function registerDefault<R extends AgentResult>(kind: string, renderer: AgentResultRenderer<R>) {
  if (!resolveAgentResultRenderer({ kind })) registerAgentResultRenderer(kind, renderer)
}

/**
 * Registers the host defaults. Idempotent, and never replaces a renderer an
 * addon already registered for the same kind.
 */
export function registerDefaultAgentResults(): void {
  registerDefault('record', EmbedCardResult)
  registerDefault('view', EmbedCardResult)
  registerDefault('count', CountResult)
  registerDefault('chart', ChartResult)
  registerDefault('image', ImageResult)
  registerDefault('proposal', ProposalResultView)
  registerDefault('plan', PlanResultView)
  registerDefault('guide', GuideResult)
}

registerDefaultAgentResults()

/** What one Aby message carries, as registry results (display order). */
export function agentResultsOf(msg: {
  embeds?: ChatAttachment[]
  proposals?: AbyProposal[]
  guide?: AbyGuide
}): AgentResult[] {
  const out: AgentResult[] = []
  for (const embed of msg.embeds ?? []) {
    if (!embed?.type) continue
    out.push({ kind: embed.type, model: embed.model, embed })
  }
  if (msg.guide) out.push({ kind: 'guide', guide: msg.guide })
  const proposals = msg.proposals ?? []
  if (proposals.length > 1) {
    out.push({ kind: 'plan', model: proposals[0]?.model, proposals })
  } else {
    for (const proposal of proposals) {
      out.push({ kind: 'proposal', model: proposal.model, proposal })
    }
  }
  return out
}

/** Renders a message's results through the registry, stacked. */
export function AgentResults({
  results,
  onAction,
  busyFor,
  className,
}: {
  results: AgentResult[]
  onAction: (action: string, payload?: unknown) => void
  busyFor?: (result: AgentResult) => boolean
  className?: string
}) {
  if (!results.length) return null
  return (
    <div className={cn('mt-2 flex w-full flex-col items-start gap-2 [&>*]:max-w-full', className)}>
      {results.map((result, i) => (
        <AgentResultView
          key={`${result.kind}-${i}`}
          result={result}
          onAction={onAction}
          busy={busyFor?.(result)}
        />
      ))}
    </div>
  )
}

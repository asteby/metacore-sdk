import { ChevronRight, FileSpreadsheet, Link2, type LucideIcon } from 'lucide-react'
import { lazy, Suspense, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { cn } from '@asteby/metacore-ui'
const AbyChartEmbed = lazy(() =>
  import('../../workspace/aby-chart-embed').then((m) => ({ default: m.AbyChartEmbed })),
)
import { useNavigation, type WorkspaceNavGroup as NavGroup, type WorkspaceNavItem as NavItem } from '../../host'
import { requestChatWidgetMinimize } from '../../lib/aby-widget'
import type { ChatAttachment } from '../data/types'
import { humanizeModelKey } from '../data/share-embed'
import {
  AGENT_CARD,
  AGENT_CARD_INTERACTIVE,
  AGENT_ENTER,
} from '../../workspace/agent-surfaces'

export function isChatEmbed(a: ChatAttachment): boolean {
  return a.type === 'record' || a.type === 'view' || a.type === 'chart' || a.type === 'image'
}

export function ChatEmbedList({
  attachments,
  className,
}: {
  attachments: ChatAttachment[]
  className?: string
}) {
  const embeds = attachments.filter(isChatEmbed)
  if (!embeds.length) return null
  const charts = embeds.filter((a) => a.type === 'chart' && a.chart)
  const images = embeds.filter((a) => a.type === 'image' && a.image_data_url)
  const cards = embeds.filter((a) => a.type === 'record' || a.type === 'view')
  return (
    <div className={cn('flex w-full flex-col gap-2', className)}>
      {charts.map((a, i) => (
        <Suspense key={`chart-${a.title || i}`} fallback={null}>
          <AbyChartEmbed spec={a.chart!} />
        </Suspense>
      ))}
      {images.map((a, i) => (
        <ChatImageEmbed key={`image-${a.title || i}`} att={a} />
      ))}
      {cards.length > 0 ? (
        <div className='flex w-[min(100%,18rem)] flex-col gap-1.5'>
          {cards.map((a, i) => (
            <ChatEmbedCard key={`${a.type}-${a.id || a.search || i}`} att={a} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function findNavForModel(groups: NavGroup[] | undefined, model?: string): NavItem | null {
  if (!model || !groups?.length) return null
  const needle = `/m/${model}`
  const walk = (items: NavItem[]): NavItem | null => {
    for (const item of items) {
      if (item.url?.includes(needle)) return item
      if (item.items?.length) {
        const hit = walk(item.items)
        if (hit) return hit
      }
    }
    return null
  }
  for (const g of groups) {
    const hit = walk(g.items || [])
    if (hit) return hit
  }
  return null
}

export function ChatImageEmbed({ att }: { att: ChatAttachment }) {
  return (
    <a
      href={att.image_data_url}
      download={`${(att.title || 'imagen').slice(0, 60)}.png`}
      className='block w-[min(100%,18rem)] overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm'
    >
      <img
        src={att.image_data_url}
        alt={att.title || 'Imagen generada'}
        className='block w-full object-cover'
      />
      {att.title ? (
        <span className='block truncate px-2.5 py-1.5 text-[11px] text-muted-foreground'>{att.title}</span>
      ) : null}
    </a>
  )
}

export function ChatEmbedCard({ att }: { att: ChatAttachment }) {
  const navigate = useNavigate()
  const { data: navGroups } = useNavigation()
  const nav = useMemo(() => findNavForModel(navGroups, att.model), [navGroups, att.model])
  const isView = att.type === 'view'
  const title = att.title?.trim() || (isView ? 'Vista' : 'Registro')
  const modelLabel =
    att.model_title?.trim() ||
    nav?.title?.trim() ||
    (att.model ? humanizeModelKey(att.model) : '') ||
    (isView ? 'Vista' : 'Registro')
  const detail = (isView ? att.filter_summary : att.subtitle)?.trim()
  const showDetail = !!detail && detail !== title && detail !== modelLabel
  const Icon: LucideIcon = nav?.icon || (isView ? FileSpreadsheet : Link2)

  const open = () => {
    // Fullscreen Aby on mobile covers the app — tuck the chat so the vista is visible.
    requestChatWidgetMinimize()
    if (att.type === 'record' && att.model && att.id) {
      void navigate({
        to: '/m/$model/$id',
        params: { model: att.model, id: String(att.id) },
      })
      return
    }
    if (att.type === 'view' && att.model) {
      const raw = (att.search || '').replace(/^\?/, '')
      const search = Object.fromEntries(new URLSearchParams(raw).entries())
      void navigate({
        to: '/m/$model',
        params: { model: att.model },
        search: search as never,
      })
    }
  }

  return (
    <button
      type='button'
      onClick={open}
      className={cn(
        'group flex w-full overflow-hidden text-left',
        AGENT_CARD,
        AGENT_CARD_INTERACTIVE,
        AGENT_ENTER,
      )}
    >
      <span className='w-1 shrink-0 bg-primary' aria-hidden />
      <span className='flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2'>
        <span className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/20'>
          <Icon className='size-4' />
        </span>
        <span className='min-w-0 flex-1'>
          <span className='block truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground'>
            {isView ? `Vista · ${modelLabel}` : modelLabel}
          </span>
          <span className='block truncate text-sm font-semibold text-foreground'>{title}</span>
          {showDetail ? (
            <span className='mt-0.5 block truncate text-[11px] text-muted-foreground'>{detail}</span>
          ) : null}
        </span>
        <ChevronRight
          className='size-4 shrink-0 text-muted-foreground/70 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none'
          aria-hidden
        />
      </span>
    </button>
  )
}

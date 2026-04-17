import { cn } from '@asteby/metacore-ui/lib'
import type { WebhookStats } from '../types'
import type { WebhooksTranslate } from '../i18n'
import { defaultTranslate } from '../i18n'

export interface StatsBarProps {
  stats: WebhookStats | null
  t?: WebhooksTranslate
  className?: string
}

/**
 * Four-counter summary: active / paused / failed / total deliveries.
 */
export function StatsBar({ stats, t = defaultTranslate, className }: StatsBarProps) {
  if (!stats) return null

  const items = [
    {
      key: 'active',
      label: t('webhooks.stats.active', 'Activos'),
      value: stats.active_webhooks,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      key: 'paused',
      label: t('webhooks.stats.paused', 'Pausados'),
      value: stats.paused_webhooks,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
    {
      key: 'failed',
      label: t('webhooks.stats.failed', 'Fallidos'),
      value: stats.failed_webhooks,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
    },
    {
      key: 'deliveries',
      label: t('webhooks.stats.deliveries', 'Entregas totales'),
      value: (stats.total_deliveries ?? 0).toLocaleString(),
      color: 'text-violet-500',
      bg: 'bg-violet-500/10',
    },
  ]

  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-4 gap-3', className)}>
      {items.map((item) => (
        <div
          key={item.key}
          className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border', item.bg)}
        >
          <div className={cn('text-2xl font-bold tabular-nums', item.color)}>{item.value}</div>
          <div className="text-xs text-muted-foreground font-medium">{item.label}</div>
        </div>
      ))}
    </div>
  )
}

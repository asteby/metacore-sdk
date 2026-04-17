import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileText,
  Pause,
  Play,
  Send,
  Trash2,
  Webhook as WebhookIcon,
  XCircle,
} from 'lucide-react'
import { Badge, Button } from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import type { Webhook } from '../types'
import type { WebhooksTranslate } from '../i18n'
import { defaultTranslate } from '../i18n'

export interface WebhooksListProps {
  webhooks: Webhook[]
  isLoading?: boolean
  onDelete: (id: string) => void
  onToggle: (id: string, nextStatus: 'active' | 'paused') => void
  onTest?: (id: string) => void
  onViewLogs: (webhook: Webhook) => void
  enableTest?: boolean
  /** Whether the row should show a device chip (device scope). */
  showDeviceChip?: boolean
  t?: WebhooksTranslate
}

export function WebhooksList({
  webhooks,
  isLoading,
  onDelete,
  onToggle,
  onTest,
  onViewLogs,
  enableTest = true,
  showDeviceChip = false,
  t = defaultTranslate,
}: WebhooksListProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-muted/20 animate-pulse" />
        ))}
      </div>
    )
  }

  if (webhooks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="relative mb-6">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-violet-500/10 to-violet-500/5 flex items-center justify-center ring-1 ring-violet-500/10">
            <WebhookIcon className="h-10 w-10 text-violet-500/40" />
          </div>
        </div>
        <h3 className="text-lg font-bold mb-1">
          {t('webhooks.empty.title', 'Sin webhooks')}
        </h3>
        <p className="text-sm text-muted-foreground max-w-[280px]">
          {t(
            'webhooks.empty.subtitle',
            'Registra tu primer webhook para recibir eventos en tiempo real en tu servidor.'
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {webhooks.map((wh) => {
        const isExpanded = expanded === wh.id
        const isActive = wh.status === 'active'
        const isFailed = wh.status === 'failed'
        const isPaused = wh.status === 'paused'

        const totalAttempts = wh.success_count + wh.failure_count
        const successRate =
          totalAttempts > 0
            ? Math.round((wh.success_count / totalAttempts) * 100)
            : 100

        return (
          <div
            key={wh.id}
            className={cn(
              'rounded-xl border transition-all duration-200',
              isActive
                ? 'bg-card/60 border-border/60 hover:border-violet-500/20'
                : isFailed
                  ? 'bg-destructive/5 border-destructive/20'
                  : 'bg-muted/10 border-border/30 opacity-70'
            )}
          >
            {/* Header */}
            <div
              className="flex items-center gap-4 px-4 py-3.5 cursor-pointer"
              onClick={() => setExpanded(isExpanded ? null : wh.id)}
            >
              <div
                className={cn(
                  'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
                  isActive
                    ? 'bg-violet-500/10'
                    : isFailed
                      ? 'bg-destructive/10'
                      : 'bg-muted/30'
                )}
              >
                <WebhookIcon
                  className={cn(
                    'h-4 w-4',
                    isActive
                      ? 'text-violet-500'
                      : isFailed
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                  )}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold truncate">
                    {wh.name}
                  </span>
                  <Badge
                    variant={
                      isActive ? 'default' : isFailed ? 'destructive' : 'secondary'
                    }
                    className="text-[10px] px-1.5 py-0"
                  >
                    {isActive
                      ? t('webhooks.status.active', 'Activo')
                      : isFailed
                        ? t('webhooks.status.failed', 'Fallido')
                        : t('webhooks.status.paused', 'Pausado')}
                  </Badge>
                  {successRate < 90 && totalAttempts > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300"
                    >
                      {t('webhooks.list.success_rate', '{{rate}}% éxito', {
                        rate: successRate,
                      })}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span className="font-mono truncate max-w-[200px]">
                    {wh.url}
                  </span>
                  {showDeviceChip && wh.device && (
                    <>
                      <span>&bull;</span>
                      <span>{wh.device.name}</span>
                    </>
                  )}
                  <span>&bull;</span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    {wh.success_count}
                  </span>
                  {wh.failure_count > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <XCircle className="h-3 w-3" />
                      {wh.failure_count}
                    </span>
                  )}
                </div>
              </div>

              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  isExpanded && 'rotate-180'
                )}
              />
            </div>

            {isExpanded && (
              <div className="px-4 pb-4 pt-0 border-t border-border/40 animate-in slide-in-from-top-2 fade-in duration-200">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-3">
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('webhooks.fields.events', 'Eventos')}
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {wh.events.split(',').map((e) => (
                        <Badge
                          key={e}
                          variant="outline"
                          className="text-[9px] px-1.5 py-0"
                        >
                          {e.trim()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('webhooks.fields.max_retries', 'Reintentos')}
                    </span>
                    <p className="text-sm font-medium mt-1">
                      {t('webhooks.list.retries', '{{n}} intentos', {
                        n: wh.max_retries,
                      })}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('webhooks.list.last_delivery', 'Última entrega')}
                    </span>
                    <p className="text-sm mt-1">
                      {wh.last_delivered_at
                        ? new Date(wh.last_delivered_at).toLocaleString()
                        : t('webhooks.list.never', 'Nunca')}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('webhooks.list.signing_secret', 'Signing secret')}
                    </span>
                    <p className="text-sm font-mono mt-1">
                      {wh.secret_masked || '\u2022\u2022\u2022'}
                    </p>
                  </div>
                </div>

                {wh.last_error && (
                  <div className="mb-3 p-2.5 rounded-lg bg-destructive/5 border border-destructive/20">
                    <div className="flex items-center gap-2 text-xs">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      <span className="text-destructive font-medium">
                        {t('webhooks.list.last_error', 'Último error:')}
                      </span>
                      <span className="text-muted-foreground truncate">
                        {wh.last_error}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-border/20 flex-wrap">
                  {enableTest && onTest && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        onTest(wh.id)
                      }}
                    >
                      <Send className="h-3.5 w-3.5" />
                      {t('webhooks.actions.test', 'Test')}
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs"
                    onClick={(e) => {
                      e.stopPropagation()
                      onViewLogs(wh)
                    }}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {t('webhooks.actions.logs', 'Logs')}
                  </Button>

                  {isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs text-amber-600 hover:bg-amber-500/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggle(wh.id, 'paused')
                      }}
                    >
                      <Pause className="h-3.5 w-3.5" />
                      {t('webhooks.actions.pause', 'Pausar')}
                    </Button>
                  )}

                  {(isPaused || isFailed) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs text-emerald-600 hover:bg-emerald-500/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggle(wh.id, 'active')
                      }}
                    >
                      <Play className="h-3.5 w-3.5" />
                      {t('webhooks.actions.activate', 'Activar')}
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 ml-auto"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(wh.id)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('webhooks.actions.delete', 'Eliminar')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

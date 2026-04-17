import { useState } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2,
  ChevronDown,
  FileText,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import { useWebhookLogs } from '../hooks'
import type { WebhooksApiClient } from '../types'
import type { WebhooksTranslate } from '../i18n'
import { defaultTranslate } from '../i18n'

export interface LogsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  webhookId: string | null
  webhookName: string
  apiClient: WebhooksApiClient
  basePath: string
  /** Enable replay of individual delivery attempts (device scope feature). */
  enableReplay?: boolean
  /** Optional translation fn. */
  t?: WebhooksTranslate
}

export function LogsDialog({
  open,
  onOpenChange,
  webhookId,
  webhookName,
  apiClient,
  basePath,
  enableReplay = false,
  t = defaultTranslate,
}: LogsDialogProps) {
  const [page, setPage] = useState(1)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)

  const logsQuery = useWebhookLogs(apiClient, basePath, webhookId, page, {
    enabled: open && !!webhookId,
  })

  const logs = logsQuery.data?.logs ?? []
  const totalPages = logsQuery.data?.totalPages ?? 1
  const isLoading = logsQuery.isLoading || logsQuery.isFetching

  const handleReplay = async (logId: string) => {
    if (!webhookId) return
    try {
      await apiClient.post(`${basePath}/${webhookId}/logs/${logId}/replay`)
      toast.success(t('webhooks.logs.replay_success', 'Reenvío disparado'))
      logsQuery.refetch()
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } }; message?: string })
          ?.response?.data?.message ||
        (err as { message?: string })?.message ||
        t('webhooks.logs.replay_error', 'Error al reenviar')
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden border-none shadow-2xl max-h-[85vh]">
        <div className="p-6 space-y-4">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20">
                <FileText className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <DialogTitle>
                  {t('webhooks.logs.title', 'Delivery logs')}
                </DialogTitle>
                <DialogDescription>{webhookName}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-14 rounded-lg bg-muted/20 animate-pulse"
                  />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {t('webhooks.logs.empty', 'Sin logs de entrega aún')}
              </div>
            ) : (
              logs.map((log) => {
                const isSuccess = log.status === 'success'
                const isExp = expandedLog === log.id

                return (
                  <div
                    key={log.id}
                    className={cn(
                      'rounded-lg border transition-all',
                      isSuccess
                        ? 'border-border/40'
                        : 'border-destructive/20 bg-destructive/5'
                    )}
                  >
                    <div
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                      onClick={() => setExpandedLog(isExp ? null : log.id)}
                    >
                      <div
                        className={cn(
                          'h-6 w-6 rounded flex items-center justify-center shrink-0',
                          isSuccess
                            ? 'bg-emerald-500/10'
                            : 'bg-destructive/10'
                        )}
                      >
                        {isSuccess ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1.5 py-0 font-mono"
                          >
                            {log.event_type}
                          </Badge>
                          {log.response_status > 0 && (
                            <Badge
                              variant={isSuccess ? 'default' : 'destructive'}
                              className="text-[9px] px-1.5 py-0"
                            >
                              HTTP {log.response_status}
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {log.response_time_msec}ms
                          </span>
                          {log.attempt_num > 1 && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 text-amber-600"
                            >
                              {t('webhooks.logs.attempt', 'intento')} #
                              {log.attempt_num}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(log.created_at).toLocaleString()}
                      </span>

                      <ChevronDown
                        className={cn(
                          'h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0',
                          isExp && 'rotate-180'
                        )}
                      />
                    </div>

                    {isExp && (
                      <div className="px-3 pb-3 pt-0 border-t border-border/20 space-y-2 animate-in fade-in duration-200">
                        {log.error && (
                          <div className="p-2 rounded bg-destructive/10 text-xs text-destructive font-mono">
                            {log.error}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              {t('webhooks.logs.request_body', 'Request body')}
                            </span>
                            <pre className="text-[10px] font-mono text-muted-foreground p-2 rounded bg-muted/20 mt-1 max-h-[120px] overflow-auto">
                              {(() => {
                                try {
                                  return JSON.stringify(
                                    JSON.parse(log.request_body),
                                    null,
                                    2
                                  )
                                } catch {
                                  return log.request_body
                                }
                              })()}
                            </pre>
                          </div>
                          <div>
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              {t('webhooks.logs.response_body', 'Response body')}
                            </span>
                            <pre className="text-[10px] font-mono text-muted-foreground p-2 rounded bg-muted/20 mt-1 max-h-[120px] overflow-auto">
                              {log.response_body ||
                                t('webhooks.logs.empty_body', '(vacío)')}
                            </pre>
                          </div>
                        </div>
                        {enableReplay && (
                          <div className="flex justify-end pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleReplay(log.id)
                              }}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              {t('webhooks.logs.replay', 'Reenviar')}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('webhooks.logs.prev', 'Anterior')}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t('webhooks.logs.page', 'Página {{page}} de {{total}}', {
                  page,
                  total: totalPages,
                })}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('webhooks.logs.next', 'Siguiente')}
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => logsQuery.refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('webhooks.actions.refresh', 'Actualizar')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
